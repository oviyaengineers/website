-- Snapshot the active master when a line is first added to an issued DC.
-- Editing an older, unrecorded line must not silently copy today's master
-- weights into a historical DC. Draft issuance is covered separately by
-- trg_auto_record_dc_weights_on_issue.
drop trigger if exists trg_auto_record_dc_line_weight on public.delivery_challan_items;
create trigger trg_auto_record_dc_line_weight
  after insert on public.delivery_challan_items
  for each row execute function public.auto_record_dc_line_weight_trigger();
