-- Indexes for the search boxes.
--
-- Every search here is a partial, case-insensitive match: somebody types
-- "DN40FB" or "996" and expects the record wherever that text sits inside a
-- longer field. A plain B-tree index cannot serve `ilike '%x%'`, so those
-- searches would scan every row. That is survivable at four challans and not
-- at four thousand.
--
-- pg_trgm indexes the three-character sequences of a string, which is exactly
-- what an unanchored ilike needs. The extension ships with Postgres and is
-- available on Supabase; creating it is idempotent.

create extension if not exists pg_trgm;

-- Our challan number: "26-27-001", and partials of it.
create index if not exists delivery_challans_dc_number_trgm
  on public.delivery_challans using gin (dc_number gin_trgm_ops);

-- The customer's own references are an array, so the whole array is indexed
-- and searched with the array operators rather than a text match.
create index if not exists delivery_challans_customer_dc_number_gin
  on public.delivery_challans using gin (customer_dc_number);

-- Part names and materials carry the searches that matter most: "CF8M",
-- "DN40FB", "Casting".
create index if not exists delivery_challan_items_component_trgm
  on public.delivery_challan_items using gin (component gin_trgm_ops);
create index if not exists delivery_challan_items_material_trgm
  on public.delivery_challan_items using gin (material gin_trgm_ops);

create index if not exists customers_name_trgm
  on public.customers using gin (name gin_trgm_ops);

create index if not exists pending_dc_scans_customer_dc_number_trgm
  on public.pending_dc_scans using gin (customer_dc_number gin_trgm_ops);

create index if not exists dc_picklist_items_name_trgm
  on public.dc_picklist_items using gin (name gin_trgm_ops);

-- Ordinary B-trees for the ranges and equality the filters use alongside text.
create index if not exists delivery_challans_dc_date_idx
  on public.delivery_challans (dc_date desc);
create index if not exists delivery_challan_items_dc_id_idx
  on public.delivery_challan_items (dc_id);

select count(*)::int as indexes_on_challan_items
  from pg_indexes where tablename = 'delivery_challan_items';
