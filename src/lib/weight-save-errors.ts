/**
 * What the operator is told when a Weight / Scrap or Weight Master change fails.
 *
 * save_dc_line_weights (0031) runs as one transaction and raises short coded
 * messages, so any failure means no line on the DC was changed. Component
 * names from the message are passed through unchanged.
 */
export function weightSaveErrorMessage(
  message: string | null | undefined,
  code?: string | null
): string {
  const text = message ?? "";
  const named = (pattern: RegExp) => text.match(pattern)?.[1]?.trim();

  if (text.includes("MODULE_LOCKED")) return "Weight / Scrap is locked. Enter your PIN again.";
  if (
    text.includes("WEIGHT_ADMIN_ONLY") ||
    code === "42501" ||
    /permission denied|row-level security/i.test(text)
  ) {
    return "Only an admin can change Weight / Scrap. Nothing was saved.";
  }
  if (text.includes("WEIGHT_MASTER_IN_USE")) {
    return "This master has been used by recorded DC lines, so it cannot be deleted. Make it inactive instead.";
  }
  if (text.includes("weight_master_one_per_pair")) {
    return "A master for this component and material already exists. Edit that one instead.";
  }
  if (text.includes("WEIGHT_MASTER_BAD_MATERIAL")) {
    return "Choose a material from Components & Materials.";
  }
  if (text.includes("WEIGHT_MASTER_BAD_COMPONENT")) {
    return "Choose a component from Components & Materials.";
  }
  if (text.includes("WEIGHT_RECORD_FIXED")) {
    return "Recorded weights cannot be changed. Nothing was saved.";
  }
  if (text.includes("WEIGHT_DRAFT_DC")) return "A draft DC has no Weight / Scrap.";
  if (text.includes("WEIGHT_DC_NOT_FOUND")) return "This DC no longer exists.";
  if (text.includes("WEIGHT_LINE_NOT_ON_DC") || text.includes("WEIGHT_LINE_NOT_FOUND")) {
    return "A line is no longer on this DC. Reload the page. Nothing was saved.";
  }
  if (text.includes("WEIGHT_DUPLICATE_LINE")) return "A line was sent twice. Nothing was saved.";
  if (text.includes("WEIGHT_NO_LINES")) return "Nothing to save.";

  const coded: [RegExp, string][] = [
    [
      /WEIGHT_NOT_CONFIGURED:(.*)/,
      "Weight not configured for this Component/Material. Add it in the Weight/Scrap Master first. Nothing was saved.",
    ],
    [/WEIGHT_RATE_MISSING:(.*)/, "enter the scrap rate (₹/kg). Nothing was saved."],
    [
      /WEIGHT_NOT_RECORDED:(.*)/,
      "not recorded yet, so there is no Sent Qty to accept. Nothing was saved.",
    ],
    [/WEIGHT_BAD_NUMBER:(.*)/, "the scrap rate is not a number. Nothing was saved."],
    [/WEIGHT_NEGATIVE:(.*)/, "the scrap rate cannot be negative. Nothing was saved."],
  ];
  for (const [pattern, sentence] of coded) {
    const component = named(pattern);
    if (component !== undefined) return `${component}: ${sentence}`;
  }
  if (/finished_within_rough/.test(text))
    return "Finished weight cannot be more than rough weight.";
  if (/not_negative/.test(text)) return "Weights cannot be negative.";
  if (/weight_master_sane/.test(text)) return "A piece cannot weigh more than 10,000 kg.";

  return text
    ? `Weight / Scrap could not be saved: ${text}`
    : "Weight / Scrap could not be saved. Nothing was changed.";
}
