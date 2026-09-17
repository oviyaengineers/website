-- The OCR-ready copy of a scanned customer challan, kept beside the original.
--
-- A scan is now read from a prepared image: the page found and straightened,
-- shadows flattened, contrast raised, table borders removed. That image is
-- stored separately so a reading can be checked against exactly what the OCR
-- saw, while image_path keeps pointing at the photograph as taken, which is
-- never altered.
--
-- Additive only: one nullable column. Existing scans keep every value they
-- have and simply have no processed image. Nothing here touches a delivery
-- challan, a DC number, billing or weight/scrap.

alter table public.pending_dc_scans
  add column if not exists processed_image_path text;

comment on column public.pending_dc_scans.processed_image_path is
  'The prepared image OCR read, in the private dc-scans bucket. image_path is the untouched original.';

select
  (select count(*) from public.pending_dc_scans)::int as scans,
  (select count(*) from public.pending_dc_scans where processed_image_path is not null)::int as with_processed;
