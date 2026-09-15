-- Stage 2 Phase 2: a QR code on every delivery challan.
--
-- The QR opens a public, read-only page for that one challan. It carries an
-- unguessable random token, never the challan's id or number, so one challan's
-- link cannot be used to find another.
--
-- What the public page may show is decided here, in one function, not in the
-- page: DC number, DC date, customer name, the customer's own DC references,
-- and the lines that moved on this challan (component, material, sent, material
-- problem, rejection, total). Never the customer's address, GSTIN or phone,
-- received or balance figures, rates, invoices, or anything else internal.
--
-- Nothing already stored is changed: no challan, line, DC number, quantity,
-- scan or invoice. Links are only created when a challan is printed.

-- ---------------------------------------------------------------------------
-- One link per challan. Removed with the challan.
create table if not exists public.dc_public_links (
  dc_id uuid primary key references public.delivery_challans (id) on delete cascade,
  -- Two random UUIDs without dashes: 64 hex characters, about 244 random bits.
  token text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint dc_public_links_token_format check (token ~ '^[0-9a-f]{64}$')
);

alter table public.dc_public_links enable row level security;

-- Staff can read links. Nobody writes to the table directly: links are made
-- only by ensure_dc_public_link below. The public cannot read it at all.
revoke all on table public.dc_public_links from anon, authenticated;
grant select on table public.dc_public_links to authenticated;

drop policy if exists dc_public_links_select_authenticated on public.dc_public_links;
create policy dc_public_links_select_authenticated on public.dc_public_links
  for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- The link for a challan, made the first time it is asked for. Signed-in staff only.
create or replace function public.ensure_dc_public_link(p_dc_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text;
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    raise exception 'NOT_SIGNED_IN' using errcode = '42501';
  end if;
  if not exists (select 1 from public.delivery_challans where id = p_dc_id) then
    raise exception 'DC_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.dc_public_links (dc_id) values (p_dc_id)
  on conflict (dc_id) do nothing;

  select token into v_token from public.dc_public_links where dc_id = p_dc_id;
  return v_token;
end;
$$;

revoke all on function public.ensure_dc_public_link(uuid) from public, anon;
grant execute on function public.ensure_dc_public_link(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The public view of one challan, by token. Returns null for an unknown token.
-- Read-only: a stable SQL function that selects and nothing else.
create or replace function public.get_public_dc(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'dc_number', d.dc_number,
    'dc_date', d.dc_date,
    'customer_name', c.name,
    'customer_dc_number', coalesce(to_jsonb(d.customer_dc_number), '[]'::jsonb),
    'customer_dc_date', coalesce(to_jsonb(d.customer_dc_date), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'component', coalesce(p.name, i.component),
          'material', i.material,
          'sent_qty', i.sent_qty,
          'material_problem_qty', i.material_problem_qty,
          'rejection_qty', i.rejection_qty,
          'total_qty', i.total_qty
        )
        order by i.sort_order
      )
      from public.delivery_challan_items i
      left join public.dc_picklist_items p
        on p.id = i.component_id and p.kind = 'component'
      -- The same lines the printed challan shows: only what moved on it.
      where i.dc_id = d.id
        and coalesce(i.sent_qty, 0) + coalesce(i.material_problem_qty, 0) + coalesce(i.rejection_qty, 0) > 0
    ), '[]'::jsonb)
  )
  from public.dc_public_links l
  join public.delivery_challans d on d.id = l.dc_id
  left join public.customers c on c.id = d.customer_id
  where p_token ~ '^[0-9a-f]{64}$'
    and l.token = p_token;
$$;

revoke all on function public.get_public_dc(text) from public;
grant execute on function public.get_public_dc(text) to anon, authenticated;
