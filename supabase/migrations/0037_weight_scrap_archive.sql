-- Preserve a dated snapshot before an admin starts a fresh Weight / Scrap run.
-- The live per-DC rows can then be recorded again; snapshots remain searchable.
create table if not exists public.weight_scrap_archive (
  id bigint generated always as identity primary key,
  reset_id uuid not null,
  source_weight_id uuid not null,
  dc_id uuid not null,
  dc_item_id uuid not null,
  dc_number text not null,
  dc_date date not null,
  customer_name text not null,
  component text not null,
  material text,
  current_sent_qty numeric(12,2) not null,
  sent_qty_at_save numeric(12,2) not null,
  weight_master_id uuid not null,
  rough_weight_g numeric(14,3) not null,
  rough_unit text not null,
  finished_weight_g numeric(14,3) not null,
  finished_unit text not null,
  scrap_weight_g numeric(14,3) not null,
  scrap_rate_per_kg numeric(12,2) not null,
  total_scrap_g numeric(14,3) not null,
  scrap_value numeric(14,2) not null,
  recorded_at timestamptz not null,
  archived_at timestamptz not null default now(),
  archived_by uuid references public.profiles(id) on delete set null
);

create index if not exists weight_scrap_archive_dc_date_idx
  on public.weight_scrap_archive (dc_date desc, dc_number desc);
create index if not exists weight_scrap_archive_reset_idx
  on public.weight_scrap_archive (reset_id, dc_date);

alter table public.weight_scrap_archive enable row level security;
drop policy if exists "weight_scrap_archive_select_authenticated" on public.weight_scrap_archive;
create policy "weight_scrap_archive_select_authenticated"
  on public.weight_scrap_archive for select to authenticated using (true);
drop policy if exists "weight_scrap_archive_insert_admin" on public.weight_scrap_archive;
create policy "weight_scrap_archive_insert_admin"
  on public.weight_scrap_archive for insert to authenticated with check (public.is_admin());
revoke all on public.weight_scrap_archive from anon;
revoke update, delete, truncate on public.weight_scrap_archive from authenticated;
grant select, insert on public.weight_scrap_archive to authenticated;

create or replace function public.archive_and_reset_weight_scrap(p_from date, p_to date)
returns table (archived int)
language plpgsql
security definer
set search_path = public
as $reset$
declare
  v_reset_id uuid := gen_random_uuid();
  v_count int := 0;
begin
  if not public.is_admin() then
    raise exception 'WEIGHT_ADMIN_ONLY: only an admin can reset weight/scrap'
      using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'WEIGHT_BAD_RESET_DATES';
  end if;

  -- Serialize resets with weight saves so every selected row is archived once.
  lock table public.dc_line_weights in share row exclusive mode;

  insert into public.weight_scrap_archive (
    reset_id, source_weight_id, dc_id, dc_item_id, dc_number, dc_date,
    customer_name, component, material, current_sent_qty, sent_qty_at_save,
    weight_master_id, rough_weight_g, rough_unit, finished_weight_g,
    finished_unit, scrap_weight_g, scrap_rate_per_kg, total_scrap_g,
    scrap_value, recorded_at, archived_by
  )
  select
    v_reset_id, w.id, d.id, i.id, d.dc_number, d.dc_date,
    coalesce(c.name, '-'), i.component, i.material, i.sent_qty, w.sent_qty_at_save,
    w.weight_master_id, w.rough_weight_g, w.rough_unit, w.finished_weight_g,
    w.finished_unit, w.scrap_weight_g, w.scrap_rate_per_kg, w.total_scrap_g,
    w.scrap_value, w.updated_at, auth.uid()
  from public.dc_line_weights w
  join public.delivery_challan_items i on i.id = w.dc_item_id
  join public.delivery_challans d on d.id = i.dc_id
  left join public.customers c on c.id = d.customer_id
  where d.dc_date between p_from and p_to and d.status::text <> 'draft';
  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'WEIGHT_RESET_EMPTY';
  end if;

  delete from public.dc_line_weights w
  where w.id in (
    select a.source_weight_id
    from public.weight_scrap_archive a
    where a.reset_id = v_reset_id
  );

  return query select v_count;
end;
$reset$;

revoke all on function public.archive_and_reset_weight_scrap(date, date) from public, anon;
grant execute on function public.archive_and_reset_weight_scrap(date, date) to authenticated;
