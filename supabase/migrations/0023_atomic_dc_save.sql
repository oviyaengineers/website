-- Save a delivery challan in one transaction.
--
-- Saving was four separate requests: the challan header, its lines, then the
-- scan it came from. Each could fail on its own. A failed line insert deleted
-- the header again, but the trigger had already taken its DC number, so the
-- series lost a number. Two tabs could raise a challan from the same scan,
-- because the "already converted?" check ran before the insert and held no
-- lock. Two follow-ups saved together could both pass the remaining-balance
-- check and despatch more than was received. Editing deleted every line and
-- inserted them again, which a line with follow-ups refuses, after the header
-- had already been changed.
--
-- One function now does all of it, so it all happens or none of it does. A
-- rolled-back save leaves the number series untouched, because the series is
-- a table row updated inside the same transaction.
--
-- Additive only. Existing challans, lines, numbers and scans are not changed.
-- request_key is null on every existing row.

-- A key the form generates once. A resubmitted or repeated request carrying
-- the same key returns the challan already saved instead of making another.
alter table public.delivery_challans
  add column if not exists request_key uuid;

create unique index if not exists delivery_challans_request_key_key
  on public.delivery_challans (request_key)
  where request_key is not null;

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

revoke all on function public.save_delivery_challan(uuid, uuid, jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.save_delivery_challan(uuid, uuid, jsonb, jsonb, uuid[]) to authenticated;

select
  (select count(*) from public.delivery_challans)::int as challans_kept,
  (select count(*) from public.delivery_challan_items)::int as lines_kept,
  public.peek_dc_number() as next_dc_number,
  to_regprocedure('public.save_delivery_challan(uuid, uuid, jsonb, jsonb, uuid[])') is not null as function_exists;
