-- Keep the customer's challan exactly as it was photographed and read.
--
-- A scan held only the corrected values. The photograph never left the
-- device and the text OCR produced was thrown away, so once a value had been
-- corrected there was no way to check the correction against the paper, or to
-- see what was misread.
--
-- Three records, kept apart on purpose:
--   image_path   the original photograph, in the private dc-scans bucket;
--   ocr_text     the raw text OCR returned;
--   ocr_result   the values as first read, before anybody corrected them.
-- The existing columns (customer, reference, date, items) stay the working,
-- corrected values. corrected_at says when they were last changed by hand.
--
-- Additive only. Existing scans keep every value they have; they simply have
-- no image or OCR record, because none was ever stored.

alter table public.pending_dc_scans
  add column if not exists image_path text,
  add column if not exists ocr_text text,
  add column if not exists ocr_result jsonb,
  add column if not exists corrected_at timestamptz;

-- Private: nothing in it is reachable without a signed-in session. 5 MB is
-- well above a phone photograph once the app has resized it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dc-scans', 'dc-scans', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Signed-in users may add a scan image and read one back. There is no update
-- or delete policy, so an original image, once stored, cannot be replaced or
-- removed through the application.
drop policy if exists "dc_scans_select_authenticated" on storage.objects;
create policy "dc_scans_select_authenticated"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'dc-scans');

drop policy if exists "dc_scans_insert_authenticated" on storage.objects;
create policy "dc_scans_insert_authenticated"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'dc-scans');

select
  (select count(*) from public.pending_dc_scans)::int as scans_kept,
  (select public from storage.buckets where id = 'dc-scans') as bucket_public,
  (select count(*) from pg_policies
    where schemaname = 'storage' and policyname like 'dc_scans_%')::int as scan_policies;
