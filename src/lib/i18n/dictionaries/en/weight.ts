/**
 * Weight / Scrap screens. Weights, quantities, rates, DC numbers and every
 * name from the challan are shown exactly as stored, never translated.
 */

export const weight = {
  title: "Weight / Scrap",
  intro:
    "Rough and finished weight per piece for each DC line. Scrap and its value are worked out from the line's own Sent Qty.",
  searchPlaceholder: "Search DC no, customer, component...",

  // Filters
  today: "Today",
  thisWeek: "This week",
  thisMonth: "This month",
  anyDate: "Any date",
  dcStatus: "DC status",
  completedDcs: "Completed DCs",
  activeDcs: "Active DCs",
  allIssuedDcs: "All issued DCs",
  weightStatus: "Weight status",
  ourDcNo: "Our DC No",
  customerDcNo: "Customer DC No",
  allMaterials: "All materials",
  clearFilters: "Clear filters",

  // Columns
  ourDcDate: "Our DC Date",
  component: "Component / Description",
  sentQty: "Sent Qty",
  rough: "Rough Material Weight",
  finished: "Finished Material Weight",
  roughShort: "Rough / piece",
  finishedShort: "Finished / piece",
  scrapPerPiece: "Scrap Weight per Piece",
  scrapPerPieceShort: "Scrap / piece",
  totalScrap: "Total Scrap Weight",
  scrapRate: "Scrap Rate",
  scrapValue: "Total Scrap Value",
  perPiece: "/ piece",
  rupeesPerKg: "₹ / kg",
  notEntered: "—",
  open: "Open",
  enterWeights: "Enter weights",
  viewWeights: "View weights",

  // Line status
  status: {
    notWeighed: "Not weighed",
    rateMissing: "Rate missing",
    weighed: "Weighed",
    sentChanged: "Sent changed — check",
  },

  // Totals
  linesShown: "{count} lines",
  linesShownOne: "1 line",
  weighedOf: "{weighed} of {total} weighed",
  processedQty: "Sent Qty (weighed lines)",
  totalRough: "Total rough weight",
  totalFinished: "Total finished weight",
  valueNote: "Covers lines with a scrap rate",
  averageRate: "Average {rate} / kg",
  noLines: "No DC lines match these filters.",
  noLinesYet: "No completed DC lines yet.",

  // Editor
  editorTitle: "Weight for {dc}",
  editorIntro:
    "Enter rough and finished weight per piece for each line. Sent Qty comes from the DC and cannot be changed here.",
  backToList: "Back to Weight / Scrap",
  openDc: "Open DC",
  dcStatusLabel: "DC status: {status}",
  sentFromDc: "Sent Qty (from DC)",
  followUpOf: "Follow-up of {dc}",
  unit: "Unit",
  grams: "g",
  kilograms: "kg",
  sentChangedNote:
    "Weights were saved when Sent was {saved}. Sent is now {now}, and the figures use {now}. Check and save again.",
  lastSaved: "Last saved {date}",
  adminOnlyNote: "Only an admin can enter or change weight/scrap. You can view them.",
  draftNote: "This DC is still a draft. Weight/scrap can be entered once it is confirmed.",
  noItems: "This DC has no lines.",
  removeWeight: "Remove weight",
  keepWeight: "Keep weight",
  willRemove: "This line's weight will be removed when you save.",
  save: "Save weights",
  saving: "Saving…",
  saved: "Weights saved.",
  savedAndRemoved: "Weights saved. {removed} removed.",
  nothingToSave: "No changes to save.",
  unsavedChanges: "{count} unsaved lines",
  unsavedChangesOne: "1 unsaved line",
  fixLines: "Fix the lines marked in red. Nothing was saved.",
  rateHint: "Typed by hand. No rate is assumed.",
  noRateValue: "Enter a rate to see the value",

  // What is wrong with a line
  problem: {
    roughMissing: "Enter the rough weight.",
    finishedMissing: "Enter the finished weight.",
    roughInvalid: "Rough weight is not a number.",
    finishedInvalid: "Finished weight is not a number.",
    rateInvalid: "Scrap rate is not a number.",
    negative: "Weights and rate cannot be negative.",
    tooManyDecimals: "Too many decimal places (g: 3, kg: 6, ₹: 2).",
    finishedOverRough: "Finished weight cannot be more than rough weight.",
    tooLarge: "That weight is too large.",
  },

  // Refusals from the server. Nothing is saved when any of these happens.
  error: {
    adminOnly: "Only an admin can change weight/scrap. Nothing was saved.",
    draftDc: "This DC is a draft, so it has no weight/scrap. Nothing was saved.",
    dcNotFound: "This DC no longer exists. Nothing was saved.",
    lineNotOnDc: "A line no longer belongs to this DC. Reload the page. Nothing was saved.",
    duplicateLine: "A line was sent twice. Reload the page. Nothing was saved.",
    badUnit: "{component}: choose g or kg. Nothing was saved.",
    badNumber: "{component}: a weight or rate is not a number. Nothing was saved.",
    missing: "{component}: enter both weights. Nothing was saved.",
    negative: "{component}: weights and rate cannot be negative. Nothing was saved.",
    finishedOverRough:
      "{component}: finished weight cannot be more than rough weight. Nothing was saved.",
    noLines: "No changes to save.",
    generic: "Weights could not be saved. Nothing was saved.",
    genericWithDetail: "Weights could not be saved: {detail}. Nothing was saved.",
  },
};
