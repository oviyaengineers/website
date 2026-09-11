-- Run this as a SEPARATE execution, after minimal_column_test.sql.
--
-- That test reported the marker column present in its own run, yet the API
-- cannot see it, so the change exists briefly and then does not. Two things
-- explain that and this tells them apart:
--
--   found = 0  the editor's work is being rolled back when the run ends, so
--              nothing it does ever commits.
--
--   found = 1  the work committed, to a database the application does not
--              read. The address and port below then say which one, and that
--              would also explain the pending_dc_scans table that was visible
--              in the editor and absent from the API weeks ago.

select
  current_database()                          as database,
  current_user                                as running_as,
  inet_server_addr()                          as server_address,
  inet_server_port()                          as server_port,
  count(*)                                    as found
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'delivery_challan_items'
   and column_name = 'claude_test_marker';
