-- Adds the two statuses the DC workflow actually has.
--
-- The original enum was draft / dispatched / delivered, borrowed from a
-- despatch-note model. This is job work: a challan is open until every piece
-- received has been accounted for back to the customer, and "delivered" never
-- described that. The workflow is Draft, Active, Completed.
--
-- Postgres will not let a value added to an enum be used in the same
-- transaction that adds it, so this migration only adds them. Migration 0017
-- moves the existing rows over. Run 0016 first, then 0017.
--
-- The old values are left in the type. Removing an enum value means rewriting
-- the type and every column using it, which is not worth the risk for two
-- labels nothing will write again.

-- The type is schema-qualified deliberately. Unqualified, this reported
-- success three times while public.dc_status stayed untouched, because the
-- bare name resolved through search_path to a type in another schema. Every
-- other statement across 0015 to 0017 was already qualified, which is why
-- this was the only migration silently doing nothing.
alter type public.dc_status add value if not exists 'active';
alter type public.dc_status add value if not exists 'completed';
