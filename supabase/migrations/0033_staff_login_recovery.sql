-- Forgot User ID / Password for Staff Login.
--
-- Staff sign in with their email address and password (Supabase Auth). This
-- adds a recovery path by emailed one-time code; it does not add a second
-- login system and never stores or returns a password.
--
--   staff_recovery_codes   one row per code sent: only keyed hashes of the email,
--                          the code and the recovery pass; attempts; expiry
--   staff_recovery_limits  request counters per hashed email or network address
--   staff_recovery_events  code sent / failed / locked / verified, password reset
--
-- Flow (every function below is for the server's service role only):
--   1. issue_staff_recovery_code: always behaves the same whether or not the
--      email belongs to a staff account, so addresses cannot be tested; a code
--      is only emailed (by the server) when it does.
--   2. verify_staff_recovery_code: 10 minutes, one use, 5 wrong tries. A right
--      code returns a random recovery pass (kept by the server in a secure
--      cookie), valid 10 minutes, stored here only as a keyed hash.
--   3. staff_recovery_account: the login email and name for a live pass.
--   4. complete_staff_password_reset: after the server has changed the password
--      through Supabase Auth, spends the pass, cancels every other open code for
--      the account and ends all of its login sessions (which also locks the
--      Billing / Weight PIN modules).
--
-- Hashes are keyed with the secret already in Supabase Vault (0030); the PIN
-- tables themselves are not touched. Old rows are removed after a day.
-- Nothing here changes a profile, a role, or any DC, billing or weight data.

-- ---------------------------------------------------------------------------
-- Tables

create table if not exists public.staff_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  -- Null when the email is not a staff account: the row still exists so the
  -- limits and timing are the same either way.
  user_id uuid references auth.users(id) on delete cascade,
  email_hash text not null,
  code_hash text not null,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz,
  grant_hash text,
  grant_expires_at timestamptz,
  consumed_at timestamptz
);
create index if not exists staff_recovery_codes_email_idx
  on public.staff_recovery_codes (email_hash, created_at desc);
create index if not exists staff_recovery_codes_user_idx
  on public.staff_recovery_codes (user_id, created_at desc);
create unique index if not exists staff_recovery_codes_grant_idx
  on public.staff_recovery_codes (grant_hash) where grant_hash is not null;
create index if not exists staff_recovery_codes_created_idx
  on public.staff_recovery_codes (created_at);

create table if not exists public.staff_recovery_limits (
  id bigint generated always as identity primary key,
  -- A keyed hash of "kind:value", e.g. of the network address.
  key_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists staff_recovery_limits_key_idx
  on public.staff_recovery_limits (key_hash, created_at desc);
create index if not exists staff_recovery_limits_created_idx
  on public.staff_recovery_limits (created_at);

create table if not exists public.staff_recovery_events (
  id bigint generated always as identity primary key,
  user_id uuid,
  event text not null check (event in (
    'code_sent', 'code_failed', 'code_locked', 'code_verified', 'user_id_shown', 'password_reset'
  )),
  created_at timestamptz not null default now()
);
create index if not exists staff_recovery_events_user_idx
  on public.staff_recovery_events (user_id, created_at desc);

-- No row-level rule and no privilege for the browser roles: only the functions
-- below, run by the server's service role, read or write these.
alter table public.staff_recovery_codes enable row level security;
alter table public.staff_recovery_limits enable row level security;
alter table public.staff_recovery_events enable row level security;
revoke all on public.staff_recovery_codes, public.staff_recovery_limits, public.staff_recovery_events
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers

/** An HMAC of a value, keyed with the Vault secret. */
create or replace function security_private.recovery_key(p_kind text, p_value text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(
    extensions.hmac('staff-recovery:' || p_kind || ':' || p_value, security_private.pepper(), 'sha256'),
    'hex'
  );
$$;

/** Counts a request against a key and says whether it is within `p_max` per `p_window`. */
create or replace function security_private.recovery_within_limit(
  p_kind text, p_value text, p_max int, p_window interval
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := security_private.recovery_key('limit:' || p_kind, coalesce(p_value, ''));
begin
  if (select count(*) from public.staff_recovery_limits l
       where l.key_hash = v_key and l.created_at > now() - p_window) >= p_max then
    return false;
  end if;
  insert into public.staff_recovery_limits (key_hash) values (v_key);
  return true;
end;
$$;

revoke all on function security_private.recovery_key(text, text) from public, anon, authenticated;
revoke all on function security_private.recovery_within_limit(text, text, int, interval)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Issue a code

create or replace function public.issue_staff_recovery_code(p_email text, p_client text)
returns table (code_id uuid, code text, user_id uuid, email text, full_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_email_hash text;
  v_user uuid;
  v_login text;
  v_name text;
  v_id uuid := gen_random_uuid();
  v_code text;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    raise exception 'RECOVERY_BAD_EMAIL';
  end if;
  v_email_hash := security_private.recovery_key('email', v_email);

  -- Housekeeping: nothing older than a day is kept.
  delete from public.staff_recovery_codes c where c.created_at < now() - interval '24 hours';
  delete from public.staff_recovery_limits l where l.created_at < now() - interval '24 hours';

  -- The same limits for every address, registered or not.
  if exists (select 1 from public.staff_recovery_codes c
              where c.email_hash = v_email_hash and c.created_at > now() - interval '60 seconds') then
    raise exception 'RECOVERY_TOO_SOON';
  end if;
  if (select count(*) from public.staff_recovery_codes c
       where c.email_hash = v_email_hash and c.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'RECOVERY_LIMIT';
  end if;
  if not security_private.recovery_within_limit('send-client', p_client, 20, interval '1 hour') then
    raise exception 'RECOVERY_LIMIT';
  end if;

  -- A staff account: a confirmed, active Supabase user with a profile.
  select u.id, u.email, p.full_name into v_user, v_login, v_name
    from auth.users u
    join public.profiles p on p.id = u.id
   where lower(u.email) = v_email
     and u.email_confirmed_at is not null
     and u.deleted_at is null
     and (u.banned_until is null or u.banned_until < now())
   limit 1;

  -- Any earlier code for this address stops working.
  update public.staff_recovery_codes c set consumed_at = now()
   where c.email_hash = v_email_hash and c.consumed_at is null;

  v_code := lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');
  insert into public.staff_recovery_codes (id, user_id, email_hash, code_hash, expires_at)
  values (v_id, v_user, v_email_hash,
          security_private.recovery_key('code:' || v_id::text, v_code),
          now() + interval '10 minutes');
  if v_user is not null then
    insert into public.staff_recovery_events (user_id, event) values (v_user, 'code_sent');
  end if;

  return query select v_id, v_code, v_user, v_login, v_name;
end;
$$;

/** Withdraws a code the server could not email. */
create or replace function public.cancel_staff_recovery_code(p_code_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.staff_recovery_codes set consumed_at = now()
   where id = p_code_id and consumed_at is null;
$$;

-- ---------------------------------------------------------------------------
-- 2. Verify a code

create or replace function public.verify_staff_recovery_code(p_email text, p_code text, p_client text)
returns table (ok boolean, grant_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email_hash text := security_private.recovery_key('email', lower(btrim(coalesce(p_email, ''))));
  v_row public.staff_recovery_codes;
  v_token text;
begin
  if not security_private.recovery_within_limit('verify-client', p_client, 30, interval '1 hour') then
    raise exception 'RECOVERY_LIMIT';
  end if;

  select * into v_row from public.staff_recovery_codes c
   where c.email_hash = v_email_hash and c.consumed_at is null and c.verified_at is null
   order by c.created_at desc
   limit 1
   for update;

  if not found or v_row.expires_at <= now() then
    return query select false, null::text;
    return;
  end if;

  if coalesce(p_code, '') ~ '^[0-9]{6}$'
     and security_private.recovery_key('code:' || v_row.id::text, p_code) = v_row.code_hash
     and v_row.user_id is not null then
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    update public.staff_recovery_codes
       set verified_at = now(),
           grant_hash = security_private.recovery_key('grant', v_token),
           grant_expires_at = now() + interval '10 minutes'
     where id = v_row.id;
    insert into public.staff_recovery_events (user_id, event) values (v_row.user_id, 'code_verified');
    return query select true, v_token;
    return;
  end if;

  -- Wrong code, a malformed one, or an address with no account: all the same.
  update public.staff_recovery_codes
     set attempts = attempts + 1,
         consumed_at = case when attempts + 1 >= 5 then now() else consumed_at end
   where id = v_row.id;
  if v_row.user_id is not null then
    insert into public.staff_recovery_events (user_id, event)
    values (v_row.user_id, case when v_row.attempts + 1 >= 5 then 'code_locked' else 'code_failed' end);
  end if;
  return query select false, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The account behind a live recovery pass

create or replace function public.staff_recovery_account(p_token text)
returns table (user_id uuid, email text, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email, p.full_name
    from public.staff_recovery_codes c
    join auth.users u on u.id = c.user_id
    join public.profiles p on p.id = u.id
   where coalesce(p_token, '') ~ '^[0-9a-f]{64}$'
     and c.grant_hash = security_private.recovery_key('grant', p_token)
     and c.consumed_at is null
     and c.grant_expires_at > now();
$$;

/** Records that the User ID was shown for a live pass. */
create or replace function public.note_staff_user_id_shown(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.staff_recovery_events (user_id, event) values (p_user, 'user_id_shown');
$$;

-- ---------------------------------------------------------------------------
-- 4. After the password has been changed

create or replace function public.complete_staff_password_reset(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.staff_recovery_codes;
begin
  select * into v_row from public.staff_recovery_codes c
   where coalesce(p_token, '') ~ '^[0-9a-f]{64}$'
     and c.grant_hash = security_private.recovery_key('grant', p_token)
     and c.consumed_at is null
     and c.grant_expires_at > now()
   for update;
  if not found then
    raise exception 'RECOVERY_PASS_INVALID';
  end if;

  -- This pass and every other open code for the account stop working.
  update public.staff_recovery_codes c set consumed_at = now()
   where (c.user_id = v_row.user_id or c.email_hash = v_row.email_hash) and c.consumed_at is null;

  -- Every login session ends (refresh tokens go with them), and with them any
  -- Billing / Weight unlock.
  delete from public.module_unlocks m where m.user_id = v_row.user_id;
  delete from auth.sessions s where s.user_id = v_row.user_id;

  insert into public.staff_recovery_events (user_id, event) values (v_row.user_id, 'password_reset');
  return v_row.user_id;
end;
$$;

revoke all on function
  public.issue_staff_recovery_code(text, text),
  public.cancel_staff_recovery_code(uuid),
  public.verify_staff_recovery_code(text, text, text),
  public.staff_recovery_account(text),
  public.note_staff_user_id_shown(uuid),
  public.complete_staff_password_reset(text)
  from public, anon, authenticated;
grant execute on function
  public.issue_staff_recovery_code(text, text),
  public.cancel_staff_recovery_code(uuid),
  public.verify_staff_recovery_code(text, text, text),
  public.staff_recovery_account(text),
  public.note_staff_user_id_shown(uuid),
  public.complete_staff_password_reset(text)
  to service_role;

select
  (select count(*) from public.staff_recovery_codes)::int as codes,
  (select count(*) from public.profiles)::int as staff_profiles;
