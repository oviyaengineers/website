-- A 4-digit PIN lock on the Billing and Weight / Scrap modules, per user.
--
-- The PIN is an extra lock on top of the normal login. It never grants a
-- permission: every existing row-level rule still applies, and the unlock is
-- simply one more condition added to the billing and weight rules.
--
--   module_pins          one bcrypt hash per user, of an HMAC of the PIN keyed
--                        with a secret "pepper" kept in Supabase Vault
--   module_pin_attempts  failed attempts and the escalating lockout, per user
--   module_unlocks       an unlock for one module, bound to one login session;
--                        15 minutes idle and 8 hours at most, logout ends it
--   security_otps        email one-time codes, stored only as keyed hashes
--   security_events      PIN set / changed / reset, unlocks and failures.
--                        Never a PIN, a hash or a code.
--
-- None of these tables has a row-level rule, and every privilege on them is
-- revoked from the browser roles: only the functions below read or write them,
-- and no function returns a PIN hash. The one function that returns an OTP,
-- issue_security_otp, can be run by the server's service role only, so a
-- browser can never read the code it is meant to receive by email.
--
-- Stage 1 keeps its billing protections while Billing is locked:
--   * save_delivery_challan reads billed quantities inside the DC save, which
--     the billing read rules allow through dc_write_via_save().
--   * guard_dc_reopen_billed runs as its owner, so a locked user still cannot
--     reopen a billed challan.
-- No existing row is changed.

create schema if not exists security_private;
revoke all on schema security_private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The pepper: 32 random bytes, created here and never printed.
do $pepper$
begin
  if not exists (select 1 from vault.secrets where name = 'module_pin_pepper') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'module_pin_pepper',
      'Keys the hashes of module PINs and security one-time codes. Never expose.'
    );
  end if;
end
$pepper$;

-- ---------------------------------------------------------------------------
-- Tables
create table if not exists public.module_pins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text not null,
  -- Change PIN: the current PIN was confirmed in this session, just now.
  current_verified_session uuid,
  current_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.module_pin_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  failed_count int not null default 0,
  -- 0 none yet, 1 served 15 minutes, 2 served 1 hour, 3 at 24 hours.
  lock_level int not null default 0,
  locked_until timestamptz,
  last_failed_at timestamptz
);

create table if not exists public.module_unlocks (
  session_id uuid not null,
  module text not null check (module in ('billing', 'weight')),
  user_id uuid not null references auth.users(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (session_id, module)
);
create index if not exists module_unlocks_user_idx on public.module_unlocks (user_id);

create table if not exists public.security_otps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  purpose text not null check (purpose in ('set', 'change', 'reset')),
  code_hash text not null,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz,
  grant_expires_at timestamptz,
  consumed_at timestamptz
);
create index if not exists security_otps_user_idx on public.security_otps (user_id, created_at desc);

create table if not exists public.security_events (
  id bigint generated always as identity primary key,
  user_id uuid,
  session_id uuid,
  event text not null check (event in (
    'pin_set', 'pin_changed', 'pin_reset', 'module_unlocked', 'pin_failed',
    'pin_locked', 'otp_sent', 'otp_failed', 'otp_locked', 'modules_locked'
  )),
  module text,
  created_at timestamptz not null default now()
);
create index if not exists security_events_user_idx on public.security_events (user_id, created_at desc);

alter table public.module_pins enable row level security;
alter table public.module_pin_attempts enable row level security;
alter table public.module_unlocks enable row level security;
alter table public.security_otps enable row level security;
alter table public.security_events enable row level security;
revoke all on public.module_pins, public.module_pin_attempts, public.module_unlocks,
  public.security_otps, public.security_events from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Private helpers: not in an exposed schema, and not executable by browser roles.

create or replace function security_private.pepper()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'module_pin_pepper' limit 1;
$$;

-- An HMAC of the value, keyed with the pepper and bound to the user.
create or replace function security_private.keyed(p_user uuid, p_kind text, p_value text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(
    extensions.hmac(p_kind || ':' || p_user::text || ':' || p_value, security_private.pepper(), 'sha256'),
    'hex'
  );
$$;

-- The caller's login session, only while that session still exists.
create or replace function security_private.current_session()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session uuid;
begin
  if auth.uid() is null then
    return null;
  end if;
  begin
    v_session := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when others then
    return null;
  end;
  if v_session is null
     or not exists (select 1 from auth.sessions s where s.id = v_session and s.user_id = auth.uid()) then
    return null;
  end if;
  return v_session;
end;
$$;

-- Exactly four digits, and not one anyone would guess first.
create or replace function security_private.pin_acceptable(p_pin text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d int[];
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return false;
  end if;
  d := array[substr(p_pin, 1, 1)::int, substr(p_pin, 2, 1)::int, substr(p_pin, 3, 1)::int, substr(p_pin, 4, 1)::int];
  -- All the same: 0000, 1111 ...
  if d[1] = d[2] and d[2] = d[3] and d[3] = d[4] then
    return false;
  end if;
  -- Runs up or down: 1234, 6789, 9876, 0123 ...
  if (d[2] = d[1] + 1 and d[3] = d[2] + 1 and d[4] = d[3] + 1)
     or (d[2] = d[1] - 1 and d[3] = d[2] - 1 and d[4] = d[3] - 1) then
    return false;
  end if;
  -- Two repeated pairs and other common choices.
  if (d[1] = d[3] and d[2] = d[4]) or (d[1] = d[2] and d[3] = d[4])
     or p_pin in ('2580', '0852', '1004', '2000', '1010', '6969', '1998', '1999', '2001') then
    return false;
  end if;
  return true;
end;
$$;

create or replace function security_private.log_event(p_event text, p_module text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.security_events (user_id, session_id, event, module)
  values (auth.uid(), security_private.current_session(), p_event, p_module);
$$;

/** Whether the caller's session holds a live unlock for the module. */
create or replace function security_private.unlock_valid(p_module text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.module_unlocks u
     where u.session_id = security_private.current_session()
       and u.user_id = auth.uid()
       and u.module = p_module
       and u.last_seen_at > now() - interval '15 minutes'
       and u.unlocked_at > now() - interval '8 hours'
  );
$$;

/**
 * One wrong PIN, counted against the user. Returns the lockout end when this
 * failure starts one, otherwise null. Every fifth wrong PIN locks: 15
 * minutes, then 1 hour, then 24 hours each time after that. A level is
 * forgotten after a clear day with no failures.
 */
create or replace function security_private.record_pin_failure(p_user uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.module_pin_attempts;
  v_locked timestamptz;
begin
  select * into v from public.module_pin_attempts where user_id = p_user for update;
  v.failed_count := v.failed_count + 1;
  v.last_failed_at := now();
  if v.failed_count >= 5 then
    v.lock_level := least(v.lock_level + 1, 3);
    v.locked_until := now() + case v.lock_level
      when 1 then interval '15 minutes'
      when 2 then interval '1 hour'
      else interval '24 hours'
    end;
    v.failed_count := 0;
    v_locked := v.locked_until;
    perform security_private.log_event('pin_locked');
  else
    perform security_private.log_event('pin_failed');
  end if;
  update public.module_pin_attempts
     set failed_count = v.failed_count, lock_level = v.lock_level,
         locked_until = v.locked_until, last_failed_at = v.last_failed_at
   where user_id = p_user;
  -- Only a lockout that starts now is reported, never an earlier one that ended.
  return v_locked;
end;
$$;

/**
 * Checks a PIN for the caller, with the lockout. Returns (ok, locked_until).
 * Never raises for a wrong PIN, so the attempt is always counted.
 */
create or replace function security_private.check_pin(p_pin text)
returns table (ok boolean, locked_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_attempts public.module_pin_attempts;
  v_hash text;
begin
  insert into public.module_pin_attempts (user_id) values (v_user) on conflict (user_id) do nothing;
  select * into v_attempts from public.module_pin_attempts a where a.user_id = v_user for update;

  if v_attempts.locked_until is not null and v_attempts.locked_until > now() then
    return query select false, v_attempts.locked_until;
    return;
  end if;
  -- A clear day without failures starts the ladder again.
  if v_attempts.locked_until is not null and v_attempts.last_failed_at < now() - interval '24 hours' then
    update public.module_pin_attempts set lock_level = 0, locked_until = null where user_id = v_user;
  end if;

  select p.pin_hash into v_hash from public.module_pins p where p.user_id = v_user;
  if v_hash is not null and p_pin ~ '^[0-9]{4}$'
     and extensions.crypt(security_private.keyed(v_user, 'pin', p_pin), v_hash) = v_hash then
    update public.module_pin_attempts
       set failed_count = 0, lock_level = 0, locked_until = null
     where user_id = v_user;
    return query select true, null::timestamptz;
    return;
  end if;

  -- Wrong, malformed, or no PIN set: all counted the same way.
  return query select false, security_private.record_pin_failure(v_user);
end;
$$;

revoke all on all functions in schema security_private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Functions the app calls.

/** Row-level rules call this: is the module unlocked for this session? No side effects. */
create or replace function public.module_unlocked(p_module text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select security_private.unlock_valid(p_module);
$$;

/** Whether this user has a PIN, and until when they are locked out. Their own status only. */
create or replace function public.module_pin_status()
returns table (has_pin boolean, locked_until timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (select 1 from public.module_pins p where p.user_id = auth.uid()),
    (select a.locked_until from public.module_pin_attempts a
      where a.user_id = auth.uid() and a.locked_until > now());
$$;

/** Enter the PIN for one module. On success this session holds that module's unlock. */
create or replace function public.unlock_module(p_module text, p_pin text)
returns table (ok boolean, locked_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid := security_private.current_session();
  v_check record;
begin
  if v_session is null then
    raise exception 'MODULE_NO_SESSION' using errcode = '42501';
  end if;
  if p_module not in ('billing', 'weight') then
    raise exception 'MODULE_UNKNOWN';
  end if;

  select * into v_check from security_private.check_pin(p_pin);
  if not v_check.ok then
    return query select false, v_check.locked_until;
    return;
  end if;

  insert into public.module_unlocks (session_id, module, user_id, unlocked_at, last_seen_at)
  values (v_session, p_module, auth.uid(), now(), now())
  on conflict (session_id, module) do update
    set unlocked_at = now(), last_seen_at = now(), user_id = excluded.user_id;
  perform security_private.log_event('module_unlocked', p_module);
  return query select true, null::timestamptz;
end;
$$;

/** Activity in the module: keeps a live unlock alive, and drops an expired one. */
create or replace function public.touch_module_unlock(p_module text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid := security_private.current_session();
begin
  if v_session is null then
    return false;
  end if;
  if security_private.unlock_valid(p_module) then
    update public.module_unlocks
       set last_seen_at = now()
     where session_id = v_session and module = p_module;
    return true;
  end if;
  delete from public.module_unlocks where session_id = v_session and module = p_module;
  return false;
end;
$$;

/** Logout: every unlock this user holds, on every session, ends now. */
create or replace function public.lock_modules()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  delete from public.module_unlocks where user_id = auth.uid();
  perform security_private.log_event('modules_locked');
end;
$$;

/** Change PIN, step 1: the current PIN, with the same lockout as unlocking. */
create or replace function public.verify_current_module_pin(p_pin text)
returns table (ok boolean, locked_until timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid := security_private.current_session();
  v_check record;
begin
  if v_session is null then
    raise exception 'MODULE_NO_SESSION' using errcode = '42501';
  end if;
  select * into v_check from security_private.check_pin(p_pin);
  if v_check.ok then
    update public.module_pins
       set current_verified_session = v_session, current_verified_at = now()
     where user_id = auth.uid();
  end if;
  return query select v_check.ok, v_check.locked_until;
end;
$$;

/**
 * Issue an email code. SERVICE ROLE ONLY: it returns the code so the server
 * can email it, and a browser must never be able to read it. The server
 * passes the user and session it has verified from the login token.
 */
create or replace function public.issue_security_otp(p_user uuid, p_session uuid, p_purpose text)
returns table (otp_id uuid, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_has_pin boolean;
  v_pin public.module_pins;
  v_id uuid := gen_random_uuid();
  v_code text;
begin
  if p_purpose not in ('set', 'change', 'reset') then
    raise exception 'OTP_BAD_PURPOSE';
  end if;
  if not exists (
    select 1 from auth.users u where u.id = p_user and u.email_confirmed_at is not null
  ) or not exists (
    select 1 from auth.sessions s where s.id = p_session and s.user_id = p_user
  ) then
    raise exception 'OTP_NOT_ALLOWED';
  end if;

  select * into v_pin from public.module_pins p where p.user_id = p_user;
  v_has_pin := found;
  if p_purpose = 'set' and v_has_pin then
    raise exception 'PIN_ALREADY_SET';
  end if;
  if p_purpose in ('change', 'reset') and not v_has_pin then
    raise exception 'PIN_NOT_SET';
  end if;
  if p_purpose = 'change' and (
       v_pin.current_verified_session is distinct from p_session
       or v_pin.current_verified_at is null
       or v_pin.current_verified_at < now() - interval '10 minutes') then
    raise exception 'PIN_CURRENT_NOT_VERIFIED';
  end if;

  -- One code a minute, five an hour.
  if exists (select 1 from public.security_otps o
              where o.user_id = p_user and o.created_at > now() - interval '60 seconds') then
    raise exception 'OTP_TOO_SOON';
  end if;
  if (select count(*) from public.security_otps o
       where o.user_id = p_user and o.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'OTP_HOURLY_LIMIT';
  end if;

  -- Any earlier code stops working.
  update public.security_otps set consumed_at = now()
   where user_id = p_user and consumed_at is null;

  v_code := lpad((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000)::text, 6, '0');
  insert into public.security_otps (id, user_id, session_id, purpose, code_hash, expires_at)
  values (v_id, p_user, p_session, p_purpose,
          security_private.keyed(p_user, 'otp:' || v_id::text, v_code),
          now() + interval '10 minutes');
  insert into public.security_events (user_id, session_id, event) values (p_user, p_session, 'otp_sent');
  return query select v_id, v_code;
end;
$$;

/** The server withdraws a code it could not email. SERVICE ROLE ONLY. */
create or replace function public.cancel_security_otp(p_otp_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.security_otps set consumed_at = now() where id = p_otp_id and consumed_at is null;
$$;

/** Check an emailed code. Five tries per code; a correct code opens a 10-minute, single-use window. */
create or replace function public.verify_security_otp(p_purpose text, p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid := security_private.current_session();
  v public.security_otps;
begin
  if v_session is null then
    raise exception 'MODULE_NO_SESSION' using errcode = '42501';
  end if;
  select * into v from public.security_otps o
   where o.user_id = auth.uid() and o.session_id = v_session and o.purpose = p_purpose
     and o.consumed_at is null and o.verified_at is null and o.expires_at > now()
   order by o.created_at desc
   limit 1
   for update;
  if not found then
    return false;
  end if;

  if p_code ~ '^[0-9]{6}$'
     and security_private.keyed(v.user_id, 'otp:' || v.id::text, p_code) = v.code_hash then
    update public.security_otps
       set verified_at = now(), grant_expires_at = now() + interval '10 minutes'
     where id = v.id;
    return true;
  end if;

  if v.attempts + 1 >= 5 then
    update public.security_otps set attempts = v.attempts + 1, consumed_at = now() where id = v.id;
    perform security_private.log_event('otp_locked');
  else
    update public.security_otps set attempts = v.attempts + 1 where id = v.id;
    perform security_private.log_event('otp_failed');
  end if;
  return false;
end;
$$;

/**
 * Save a new PIN after a verified email code. Set, change or reset: the
 * previous PIN stops working at once and every unlock on every session ends.
 */
create or replace function public.set_module_pin(p_purpose text, p_new_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_session uuid := security_private.current_session();
  v_otp public.security_otps;
  v_old text;
begin
  if v_session is null then
    raise exception 'MODULE_NO_SESSION' using errcode = '42501';
  end if;
  select * into v_otp from public.security_otps o
   where o.user_id = v_user and o.session_id = v_session and o.purpose = p_purpose
     and o.verified_at is not null and o.consumed_at is null and o.grant_expires_at > now()
   order by o.verified_at desc
   limit 1
   for update;
  if not found then
    raise exception 'OTP_NOT_VERIFIED' using errcode = '42501';
  end if;
  if not security_private.pin_acceptable(p_new_pin) then
    raise exception 'PIN_WEAK';
  end if;

  select p.pin_hash into v_old from public.module_pins p where p.user_id = v_user for update;
  if p_purpose = 'set' and v_old is not null then
    raise exception 'PIN_ALREADY_SET';
  end if;
  if p_purpose in ('change', 'reset') and v_old is null then
    raise exception 'PIN_NOT_SET';
  end if;
  if v_old is not null
     and extensions.crypt(security_private.keyed(v_user, 'pin', p_new_pin), v_old) = v_old then
    raise exception 'PIN_SAME';
  end if;

  insert into public.module_pins (user_id, pin_hash, created_at, updated_at)
  values (v_user,
          extensions.crypt(security_private.keyed(v_user, 'pin', p_new_pin), extensions.gen_salt('bf', 11)),
          now(), now())
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash, updated_at = now(),
        current_verified_session = null, current_verified_at = null;

  update public.security_otps set consumed_at = now() where id = v_otp.id;
  delete from public.module_unlocks where user_id = v_user;
  delete from public.module_pin_attempts where user_id = v_user;
  perform security_private.log_event(
    case p_purpose when 'set' then 'pin_set' when 'change' then 'pin_changed' else 'pin_reset' end
  );
end;
$$;

revoke all on function public.module_unlocked(text), public.module_pin_status(),
  public.unlock_module(text, text), public.touch_module_unlock(text), public.lock_modules(),
  public.verify_current_module_pin(text), public.issue_security_otp(uuid, uuid, text),
  public.cancel_security_otp(uuid), public.verify_security_otp(text, text),
  public.set_module_pin(text, text)
  from public, anon;
grant execute on function public.module_unlocked(text), public.module_pin_status(),
  public.unlock_module(text, text), public.touch_module_unlock(text), public.lock_modules(),
  public.verify_current_module_pin(text), public.verify_security_otp(text, text),
  public.set_module_pin(text, text)
  to authenticated;
revoke all on function public.issue_security_otp(uuid, uuid, text), public.cancel_security_otp(uuid)
  from authenticated;
grant execute on function public.issue_security_otp(uuid, uuid, text), public.cancel_security_otp(uuid)
  to service_role;
revoke all on all functions in schema security_private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The lock on billing data. Each rule keeps exactly what it allowed before
-- and adds the unlock. (select ...) evaluates the unlock once per query.
-- dc_write_via_save() lets the DC save read billed quantities while Billing
-- is locked, so its billed-line protections keep working.

alter policy "invoices_select_authenticated" on public.invoices
  using (auth.role() = 'authenticated'
         and ((select public.module_unlocked('billing')) or public.dc_write_via_save()));
alter policy "invoices_insert_authenticated" on public.invoices
  with check (auth.role() = 'authenticated' and (select public.module_unlocked('billing')));
alter policy "invoices_update_authenticated" on public.invoices
  using (auth.role() = 'authenticated' and (select public.module_unlocked('billing')));
alter policy "invoices_delete_admin" on public.invoices
  using (public.is_admin() and (select public.module_unlocked('billing')));

alter policy "invoice_items_select_authenticated" on public.invoice_items
  using (auth.role() = 'authenticated' and (select public.module_unlocked('billing')));
alter policy "invoice_items_insert_authenticated" on public.invoice_items
  with check (auth.role() = 'authenticated' and (select public.module_unlocked('billing')));
alter policy "invoice_items_update_authenticated" on public.invoice_items
  using (auth.role() = 'authenticated' and (select public.module_unlocked('billing')));
alter policy "invoice_items_delete_authenticated" on public.invoice_items
  using (auth.role() = 'authenticated' and (select public.module_unlocked('billing')));

alter policy "invoice_item_sources_select_authenticated" on public.invoice_item_sources
  using ((select public.module_unlocked('billing')) or public.dc_write_via_save());
alter policy "invoice_item_sources_insert_authenticated" on public.invoice_item_sources
  with check ((select public.module_unlocked('billing')));

alter policy "component_rates_select_authenticated" on public.component_rates
  using ((select public.module_unlocked('billing')));
alter policy "component_rates_insert_admin" on public.component_rates
  with check (public.is_admin() and (select public.module_unlocked('billing')));
alter policy "component_rates_update_admin" on public.component_rates
  using (public.is_admin() and (select public.module_unlocked('billing')))
  with check (public.is_admin() and (select public.module_unlocked('billing')));
alter policy "component_rates_delete_admin" on public.component_rates
  using (public.is_admin() and (select public.module_unlocked('billing')));

alter policy "company_billing_settings_select_authenticated" on public.company_billing_settings
  using ((select public.module_unlocked('billing')));
alter policy "company_billing_settings_update_admin" on public.company_billing_settings
  using (public.is_admin() and (select public.module_unlocked('billing')))
  with check (public.is_admin() and (select public.module_unlocked('billing')));

alter policy "invoice_number_series_select_authenticated" on public.invoice_number_series
  using ((select public.module_unlocked('billing')));
alter policy "invoice_number_series_update_admin" on public.invoice_number_series
  using (public.is_admin() and (select public.module_unlocked('billing')))
  with check (public.is_admin() and (select public.module_unlocked('billing')));

-- The billed-DC reopen guard runs as its owner, so it sees every bill even
-- while Billing is locked for the person reopening the challan.
alter function public.guard_dc_reopen_billed() security definer;
alter function public.guard_dc_reopen_billed() set search_path = public;

-- ---------------------------------------------------------------------------
-- The lock on Weight / Scrap data.
alter policy "dc_line_weights_select_authenticated" on public.dc_line_weights
  using ((select public.module_unlocked('weight')));
alter policy "dc_line_weights_insert_admin" on public.dc_line_weights
  with check (public.is_admin() and (select public.module_unlocked('weight')));
alter policy "dc_line_weights_update_admin" on public.dc_line_weights
  using (public.is_admin() and (select public.module_unlocked('weight')))
  with check (public.is_admin() and (select public.module_unlocked('weight')));
alter policy "dc_line_weights_delete_admin" on public.dc_line_weights
  using (public.is_admin() and (select public.module_unlocked('weight')));
alter policy "dc_line_weight_history_select_authenticated" on public.dc_line_weight_history
  using ((select public.module_unlocked('weight')));

select
  (select count(*) from vault.secrets where name = 'module_pin_pepper')::int as pepper,
  (select count(*) from public.module_pins)::int as pins;
