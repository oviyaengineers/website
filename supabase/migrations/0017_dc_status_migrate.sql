-- Moves existing challans onto the Draft / Active / Completed workflow.
-- Run only after 0016_dc_status_add_values.sql.
--
-- dispatched meant "raised and in progress", which is Active.
-- delivered meant "finished with", which is Completed.
-- draft is unchanged.
--
-- No challan is deleted and no DC number is touched.

update public.delivery_challans set status = 'active' where status = 'dispatched';
update public.delivery_challans set status = 'completed' where status = 'delivered';

alter table public.delivery_challans alter column status set default 'draft';
