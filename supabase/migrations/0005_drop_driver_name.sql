-- Remove the driver_name field from delivery_challans; no longer collected on the DC form.
alter table delivery_challans drop column if exists driver_name;
