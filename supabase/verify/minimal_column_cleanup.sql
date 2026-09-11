-- Removes the marker column added by minimal_column_test.sql.
-- Run this once the test has answered the question, whatever the answer.
alter table public.delivery_challan_items drop column if exists claude_test_marker;
