-- The smallest possible change, run on its own.
--
-- 0016, 0017 and 0018 have each reported success without committing, while
-- 0015 did eventually land. They share no structure: 0016 is an ALTER TYPE,
-- 0018 a plain ALTER TABLE. So the question is no longer which SQL is at
-- fault but whether any DDL from this editor session is reaching the database.
--
-- Run this file whole. It adds one column and immediately asks the catalog
-- whether the column is there. Send back what the second statement prints.

alter table public.delivery_challan_items
  add column if not exists claude_test_marker text;

select
  current_database()                      as database,
  current_user                            as running_as,
  count(*)                                as marker_column_found
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'delivery_challan_items'
   and column_name = 'claude_test_marker';
