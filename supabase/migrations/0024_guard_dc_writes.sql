-- Close the ways around the atomic save (Stage 1 audit S1, S2).
--
-- S1. The number generators ran with the owner's rights and could be called by
-- anyone holding the public site key, signed in or not. Each call used up a DC
-- number. Execute is revoked from PUBLIC and anon; signed-in users keep it.
-- The insert trigger still allocates numbers, because a trigger function runs
-- as its owner and does not need the caller to hold EXECUTE.
--
-- S2. Row-level security let any signed-in user write challans and lines
-- straight through the API, skipping the checks and locks in
-- save_delivery_challan, and nothing stopped a DC number being changed.
--   - dc_number can never be changed once issued, by anyone.
--   - A challan can only be inserted by the save.
--   - A line can only be inserted, have its quantities or links changed, or be
--     deleted by the save. Renaming a part (component, component_id, material
--     only) stays allowed, because Settings renames and merges parts on
--     existing lines. A line deleted because its challan is being deleted by an
--     admin stays allowed.
-- The save marks its own writes with a transaction-local setting that only a
-- database function can set; the API cannot set it. Maintenance connections
-- (postgres, service_role) are not API users and are not restricted, except
-- that no one may change a DC number.
--
-- No existing row is changed by this migration.

-- S1 ---------------------------------------------------------------------------
revoke execute on function public.generate_dc_number() from public, anon;
revoke execute on function public.next_document_number(text, text) from public, anon;
revoke execute on function public.generate_invoice_number() from public, anon;
revoke execute on function public.set_dc_number() from public, anon;

grant execute on function public.generate_dc_number() to authenticated, service_role;
grant execute on function public.next_document_number(text, text) to authenticated, service_role;
grant execute on function public.generate_invoice_number() to authenticated, service_role;
grant execute on function public.set_dc_number() to authenticated, service_role;

-- S2: dc_number is permanent -----------------------------------------------------
create or replace function public.guard_dc_number()
returns trigger
language plpgsql
set search_path = public
as $guard$
begin
  if new.dc_number is distinct from old.dc_number then
    raise exception 'DC_NUMBER_IMMUTABLE: % cannot be renumbered', old.dc_number
      using errcode = '42501';
  end if;
  return new;
end;
$guard$;

drop trigger if exists trg_guard_dc_number on public.delivery_challans;
create trigger trg_guard_dc_number
  before update on public.delivery_challans
  for each row execute function public.guard_dc_number();

-- S2: writes an API user may only make through the save --------------------------
create or replace function public.dc_write_via_save()
returns boolean
language sql
stable
set search_path = public
as $allowed$
  select current_user not in ('authenticated', 'anon')
      or coalesce(current_setting('app.dc_save', true), '') = 'on';
$allowed$;

create or replace function public.guard_dc_insert()
returns trigger
language plpgsql
set search_path = public
as $guard$
begin
  if not public.dc_write_via_save() then
    raise exception 'DC_WRITE_VIA_SAVE_ONLY: delivery challans are created through the save'
      using errcode = '42501';
  end if;
  return new;
end;
$guard$;

drop trigger if exists trg_guard_dc_insert on public.delivery_challans;
create trigger trg_guard_dc_insert
  before insert on public.delivery_challans
  for each row execute function public.guard_dc_insert();

create or replace function public.guard_dc_item_write()
returns trigger
language plpgsql
set search_path = public
as $guard$
begin
  if public.dc_write_via_save() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE'
     and new.dc_id = old.dc_id
     and new.parent_item_id is not distinct from old.parent_item_id
     and new.received_qty = old.received_qty
     and new.sent_qty = old.sent_qty
     and new.material_problem_qty = old.material_problem_qty
     and new.rejection_qty = old.rejection_qty
     and new.sort_order is not distinct from old.sort_order then
    -- Renaming a part in Settings: only the name, its id or the material move.
    return new;
  end if;

  if tg_op = 'DELETE'
     and not exists (select 1 from public.delivery_challans c where c.id = old.dc_id) then
    -- The challan itself is being deleted (admin only), taking its lines.
    return old;
  end if;

  raise exception 'DC_WRITE_VIA_SAVE_ONLY: challan lines are changed through the save'
    using errcode = '42501';
end;
$guard$;

drop trigger if exists trg_guard_dc_item_write on public.delivery_challan_items;
create trigger trg_guard_dc_item_write
  before insert or update or delete on public.delivery_challan_items
  for each row execute function public.guard_dc_item_write();

-- The save, unchanged from 0023 apart from marking its writes -------------------
create or replace function public.save_delivery_challan(
  p_dc_id uuid,
  p_request_key uuid,
  p_header jsonb,
  p_items jsonb,
  p_scan_ids uuid[] default '{}'
)
returns table (dc_id uuid, dc_number text, already_saved boolean)
language plpgsql
-- Invoker: the caller's row-level security still applies to every write.
security invoker
set search_path = public
as $$
declare
  v_dc public.delivery_challans;
  v_scan record;
  v_check record;
  v_line public.delivery_challan_items;
  v_used numeric;
  v_room numeric;
  v_missing int;
  v_parent_dcs uuid[];
  v_item jsonb;
  v_index int := 0;
  v_item_id uuid;
  v_keep uuid[] := '{}';
  v_component_id uuid;
begin
  -- Marks this transaction's writes as coming through the save, which the
  -- guards on delivery_challans and delivery_challan_items require (0024).
  perform set_config('app.dc_save', 'on', true);

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'DC_NO_ITEMS';
  end if;
  if nullif(p_header->>'customer_id', '') is null then
    raise exception 'DC_NO_CUSTOMER';
  end if;

  -- A repeated request: wait for any save still running under this key, then
  -- hand back what it saved.
  if p_dc_id is null and p_request_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_request_key::text, 0));
    select * into v_dc from public.delivery_challans c where c.request_key = p_request_key;
    if found then
      return query select v_dc.id, v_dc.dc_number, true;
      return;
    end if;
  end if;

  -- Scans convert exactly once. Locked, so a second tab waits here and then
  -- finds the scan already converted.
  for v_scan in
    select s.id, s.status, d.dc_number as converted_to
      from public.pending_dc_scans s
      left join public.delivery_challans d on d.id = s.dc_id
     where s.id = any(coalesce(p_scan_ids, '{}'))
       for update of s
  loop
    if v_scan.status <> 'pending' then
      raise exception 'SCAN_NOT_PENDING:%', coalesce(v_scan.converted_to, v_scan.status);
    end if;
  end loop;

  -- Every line a follow-up row continues must exist.
  select count(*) into v_missing
    from (
      select distinct (e->>'parent_item_id')::uuid as parent_id
        from jsonb_array_elements(p_items) e
       where nullif(e->>'parent_item_id', '') is not null
    ) wanted
   where not exists (select 1 from public.delivery_challan_items i where i.id = wanted.parent_id);
  if v_missing > 0 then
    raise exception 'PARENT_LINE_MISSING';
  end if;

  -- Follow-up rows against each original line, checked under a lock on that
  -- line so two saves against the same lot run one after the other. Room is
  -- what was received, less the line's own outward and everything already on
  -- its follow-ups (drafts included, as they have booked it), leaving out the
  -- challan being edited, whose rows these replace.
  for v_check in
    with recursive asked as (
      select (e->>'parent_item_id')::uuid as parent_id,
             coalesce((e->>'sent_qty')::numeric, 0)
               + coalesce((e->>'material_problem_qty')::numeric, 0)
               + coalesce((e->>'rejection_qty')::numeric, 0) as outward
        from jsonb_array_elements(p_items) e
       where nullif(e->>'parent_item_id', '') is not null
    ),
    up(start_id, id, parent_item_id, depth) as (
      select i.id, i.id, i.parent_item_id, 0
        from public.delivery_challan_items i
       where i.id in (select parent_id from asked)
      union all
      select up.start_id, i.id, i.parent_item_id, up.depth + 1
        from up
        join public.delivery_challan_items i on i.id = up.parent_item_id
       where up.depth < 100
    )
    select up.id as root_id, sum(asked.outward) as asked
      from asked
      join up on up.start_id = asked.parent_id and up.parent_item_id is null
     group by up.id
     order by up.id
  loop
    select * into v_line from public.delivery_challan_items i where i.id = v_check.root_id for update;

    with recursive down(id) as (
      select i.id from public.delivery_challan_items i where i.parent_item_id = v_check.root_id
      union
      select i.id from public.delivery_challan_items i join down on i.parent_item_id = down.id
    )
    select coalesce(sum(i.sent_qty + i.material_problem_qty + i.rejection_qty), 0) into v_used
      from public.delivery_challan_items i
     where i.id in (select id from down)
       and (p_dc_id is null or i.dc_id <> p_dc_id);

    v_room := v_line.received_qty
      - (v_line.sent_qty + v_line.material_problem_qty + v_line.rejection_qty)
      - v_used;

    if v_check.asked > v_room then
      raise exception 'OVER_DISPATCH:%|%|%', v_line.component, greatest(v_room, 0), v_check.asked;
    end if;
  end loop;

  if p_dc_id is null then
    -- The challan every continued line belongs to, when they share one.
    select array_agg(distinct i.dc_id) into v_parent_dcs
      from public.delivery_challan_items i
     where i.id in (
       select (e->>'parent_item_id')::uuid
         from jsonb_array_elements(p_items) e
        where nullif(e->>'parent_item_id', '') is not null
     );

    -- Saved as Active: saving our challan is issuing it. The number comes
    -- from the insert trigger, inside this transaction.
    insert into public.delivery_challans (
      customer_id, dc_date, customer_dc_number, customer_dc_date, authorized_by,
      status, parent_dc_id, request_key, created_by
    )
    values (
      (p_header->>'customer_id')::uuid,
      coalesce(nullif(p_header->>'dc_date', '')::date, current_date),
      (select array_agg(value) from jsonb_array_elements_text(p_header->'customer_dc_number')),
      (select array_agg(nullif(value, '')::date) from jsonb_array_elements_text(p_header->'customer_dc_date')),
      nullif(p_header->>'authorized_by', ''),
      'active',
      case when coalesce(array_length(v_parent_dcs, 1), 0) = 1 then v_parent_dcs[1] end,
      p_request_key,
      auth.uid()
    )
    returning * into v_dc;
  else
    select * into v_dc from public.delivery_challans c where c.id = p_dc_id for update;
    if not found then
      raise exception 'DC_NOT_FOUND';
    end if;

    -- Number and status are never changed by an edit.
    update public.delivery_challans c
       set customer_id = (p_header->>'customer_id')::uuid,
           dc_date = coalesce(nullif(p_header->>'dc_date', '')::date, c.dc_date),
           customer_dc_number = (select array_agg(value) from jsonb_array_elements_text(p_header->'customer_dc_number')),
           customer_dc_date = (select array_agg(nullif(value, '')::date) from jsonb_array_elements_text(p_header->'customer_dc_date')),
           authorized_by = nullif(p_header->>'authorized_by', '')
     where c.id = p_dc_id
    returning * into v_dc;
  end if;

  -- Lines. An edited line keeps its id, which is what follow-ups point at.
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select p.id into v_component_id
      from public.dc_picklist_items p
     where p.kind = 'component'
       and lower(btrim(p.name)) = lower(btrim(v_item->>'component'))
     limit 1;

    v_item_id := nullif(v_item->>'id', '')::uuid;

    if p_dc_id is not null and v_item_id is not null
       and exists (select 1 from public.delivery_challan_items i where i.id = v_item_id and i.dc_id = v_dc.id) then
      update public.delivery_challan_items i
         set component = v_item->>'component',
             component_id = v_component_id,
             material = nullif(v_item->>'material', ''),
             received_qty = coalesce((v_item->>'received_qty')::numeric, 0),
             sent_qty = coalesce((v_item->>'sent_qty')::numeric, 0),
             material_problem_qty = coalesce((v_item->>'material_problem_qty')::numeric, 0),
             rejection_qty = coalesce((v_item->>'rejection_qty')::numeric, 0),
             parent_item_id = nullif(v_item->>'parent_item_id', '')::uuid,
             sort_order = v_index
       where i.id = v_item_id;
    else
      insert into public.delivery_challan_items (
        dc_id, parent_item_id, component, component_id, material,
        received_qty, sent_qty, material_problem_qty, rejection_qty, sort_order
      )
      values (
        v_dc.id,
        nullif(v_item->>'parent_item_id', '')::uuid,
        v_item->>'component',
        v_component_id,
        nullif(v_item->>'material', ''),
        coalesce((v_item->>'received_qty')::numeric, 0),
        coalesce((v_item->>'sent_qty')::numeric, 0),
        coalesce((v_item->>'material_problem_qty')::numeric, 0),
        coalesce((v_item->>'rejection_qty')::numeric, 0),
        v_index
      )
      returning id into v_item_id;
    end if;

    v_keep := v_keep || v_item_id;
    v_index := v_index + 1;
  end loop;

  if p_dc_id is not null then
    -- Lines removed on the form. One with follow-ups is refused by its
    -- foreign key, and the whole edit rolls back with it.
    delete from public.delivery_challan_items i
     where i.dc_id = v_dc.id and not (i.id = any(v_keep));

    -- An original line may not be cut below what its follow-ups already took.
    for v_check in
      select i.id, i.component,
             i.received_qty - (i.sent_qty + i.material_problem_qty + i.rejection_qty) as own_left
        from public.delivery_challan_items i
       where i.dc_id = v_dc.id and i.parent_item_id is null
         and exists (select 1 from public.delivery_challan_items c where c.parent_item_id = i.id)
    loop
      with recursive down(id) as (
        select i.id from public.delivery_challan_items i where i.parent_item_id = v_check.id
        union
        select i.id from public.delivery_challan_items i join down on i.parent_item_id = down.id
      )
      select coalesce(sum(i.sent_qty + i.material_problem_qty + i.rejection_qty), 0) into v_used
        from public.delivery_challan_items i
       where i.id in (select id from down);

      if v_check.own_left - v_used < 0 then
        raise exception 'BELOW_FOLLOW_UPS:%|%', v_check.component, v_used;
      end if;
    end loop;
  end if;

  update public.pending_dc_scans s
     set status = 'converted', dc_id = v_dc.id, converted_at = now()
   where s.id = any(coalesce(p_scan_ids, '{}'));

  return query select v_dc.id, v_dc.dc_number, false;
end;
$$;

select
  has_function_privilege('anon', 'public.generate_dc_number()', 'EXECUTE') as anon_generate_dc_number,
  has_function_privilege('authenticated', 'public.generate_dc_number()', 'EXECUTE') as auth_generate_dc_number,
  (select count(*)::int from pg_trigger where tgname in ('trg_guard_dc_number', 'trg_guard_dc_insert', 'trg_guard_dc_item_write')) as guard_triggers,
  (select count(*)::int from public.delivery_challans) as challans_kept,
  (select count(*)::int from public.delivery_challan_items) as lines_kept,
  public.peek_dc_number() as next_dc_number;
