/**
 * What the operator is told when issuing or cancelling an invoice fails.
 *
 * create_invoice (migration 0026) and cancel_invoice run as one transaction,
 * so a failure always means nothing was kept: no invoice, no line, no number
 * used, no quantity billed. The functions raise short coded messages; this
 * turns them into sentences.
 */
export function invoiceErrorMessage(
  message: string | null | undefined,
  code?: string | null
): string {
  const text = message ?? "";
  const nothing = " Nothing was saved.";
  const num = (value: string) => Number(value);

  const over = text.match(
    /(?:QUANTITY_NO_LONGER_AVAILABLE|OVER_BILLING):(.*)\|(.*)\|([-\d.]+)\|([-\d.]+)/
  );
  if (over) {
    return `${over[1]} on ${over[2]} has ${num(over[3])} left to bill, but ${num(over[4])} was entered. Another invoice may have billed it meanwhile.${nothing}`;
  }
  const otherMonth = text.match(/DC_OTHER_MONTH:(.*)\|(.*)/);
  if (otherMonth) {
    return `${otherMonth[1].trim()} is ${otherMonth[2].trim()} work, so it belongs on an invoice for that month.${nothing}`;
  }
  const settings = text.match(/SETTINGS_MISSING:(.*)/);
  if (settings) {
    return `Enter the ${settings[1].trim()} in Settings → Billing Details before issuing an invoice.${nothing}`;
  }
  const customerState = text.match(/CUSTOMER_STATE_MISSING:(.*)/);
  if (customerState) {
    return `Enter the state for ${customerState[1].trim()} in Customers, so CGST+SGST or IGST can be chosen.${nothing}`;
  }
  const hsn = text.match(/HSN_MISSING:(.*)/);
  if (hsn) {
    return `Enter the HSN/SAC code for ${hsn[1].trim()}, on the invoice, in the Rate List, or as the default in Billing Details.${nothing}`;
  }
  const other = text.match(/DC_OTHER_CUSTOMER:(.*)/);
  if (other) return `${other[1].trim()} belongs to a different customer.${nothing}`;
  const notIssued = text.match(/DC_NOT_ISSUED:(.*)/);
  if (notIssued)
    return `${notIssued[1].trim()} is still a draft, so it cannot be billed yet.${nothing}`;
  const qty = text.match(/QUANTITY_INVALID:(.*)\|(.*)/);
  if (qty) return `Enter a quantity above zero for ${qty[1]} on ${qty[2]}.${nothing}`;
  const rate = text.match(/RATE_INVALID:(.*)\|(.*)/);
  if (rate) return `Enter a rate of zero or more for ${rate[1]} on ${rate[2]}.${nothing}`;
  const charge = text.match(/CHARGE_AMOUNT_INVALID:(.*)/);
  if (charge) return `Enter an amount of zero or more for "${charge[1].trim()}".${nothing}`;
  const cancelled = text.match(/INVOICE_ALREADY_CANCELLED:(.*)/);
  if (cancelled) return `${cancelled[1].trim()} is already cancelled.`;

  const fixed: [string, string][] = [
    ["INVOICE_NO_CUSTOMER", "Select the customer to bill." + nothing],
    ["BILLING_MONTH_INVALID", "Select the billing month." + nothing],
    ["GST_BILL_CHOICE_MISSING", "Choose GST Bill ON or OFF for this invoice." + nothing],
    ["INVOICE_DATE_MISSING", "Enter the invoice date." + nothing],
    [
      "INVOICE_DATE_BEFORE_MONTH",
      "The invoice date cannot be before the billing month starts." + nothing,
    ],
    ["ALLOCATION_MISMATCH", "The invoice quantities did not match their DC lines." + nothing],
    ["INVOICE_NO_LINES", "Select at least one DC line or add a charge." + nothing],
    ["GST_RATE_MISSING", "Enter the GST rate for this invoice." + nothing],
    ["GST_RATE_INVALID", "The GST rate must be between 0 and 100." + nothing],
    ["DISCOUNT_INVALID", "The discount cannot be negative." + nothing],
    ["DISCOUNT_TOO_LARGE", "The discount cannot be more than the subtotal." + nothing],
    ["DUE_BEFORE_INVOICE", "The due date cannot be before the invoice date." + nothing],
    ["DUPLICATE_DC_LINE", "The same DC line is listed twice." + nothing],
    ["DC_LINE_MISSING", "A selected DC line no longer exists. Reload and select again." + nothing],
    ["CHARGE_DESCRIPTION_MISSING", "Give each other charge a description." + nothing],
    ["INVOICE_SERIES_MISSING", "The invoice number series is not set up." + nothing],
    ["CANCEL_ADMIN_ONLY", "Only an admin can cancel an invoice."],
    ["CANCEL_REASON_REQUIRED", "Give a reason for cancelling the invoice."],
    ["INVOICE_NOT_FOUND", "That invoice no longer exists."],
    ["INVOICE_DELETE_NOT_ALLOWED", "Invoices are never deleted. Cancel it instead."],
    [
      "INVOICE_WRITE_VIA_SAVE_ONLY",
      "An issued invoice cannot be changed. Cancel it and issue a new one.",
    ],
    ["INVOICE_NUMBER_IMMUTABLE", "An invoice number can never be changed."],
  ];
  for (const [codeText, sentence] of fixed) {
    if (text.includes(codeText)) return sentence;
  }

  if (code === "42501" || /permission denied/i.test(text)) {
    return "You are not signed in, or not allowed to do this." + nothing;
  }
  return `The invoice could not be saved, and nothing was kept. ${text ? `(${text})` : "Please try again."}`.trim();
}
