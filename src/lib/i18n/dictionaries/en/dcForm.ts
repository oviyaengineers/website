/** Entering and editing a delivery challan: the form, its rows, pickers and messages. */

export const dcForm = {
  newTitle: "New Delivery Challan",
  nextTitle: "Next Delivery Challan",
  newIntro: "Fill in the details below.",
  nextIntro: "Completing work that is still outstanding on an earlier challan.",
  editPageTitle: "Edit Delivery Challan",
  editTitle: "Edit {dc}",
  editIntro: "Update delivery challan details.",
  completedTitle: "{dc} is completed",
  completedIntro: "Every piece received on this challan has been accounted for.",
  completedBody:
    "Completed challans are not edited in place, because the figures on them have usually been billed. Open the challan and choose Reopen to put it back into draft, make the correction, then confirm it again.",
  openChallan: "Open the challan",
  completingFrom: "Completing work from {dc}",
  receivedOriginal: "Received {received} on the original challan. Outstanding now {remaining}.",
  onDraftFollowUp:
    "{onDraft} of that is already on a draft follow-up, so up to {bookable} can go on this one.",
  enterOutgoing:
    "Enter what is going out on this challan. The received quantity stays on the original, so the same pieces are never counted twice.",
  ourDcNumber: "Our DC Number",
  assignedOnSave: "Assigned on save",
  dateRequired: "Date *",
  customerNameRequired: "Customer Name *",
  signature: "Signature",
  authorizedBySignature: "Authorized By / Signature",
  duplicateRefTitle: "Duplicate customer DC number",
  duplicateRefOne: "{refs} is listed more than once. Remove the extra row before saving.",
  duplicateRefMany: "{refs} are listed more than once. Remove the extra row before saving.",
  overDeliveredTitleOne: "1 row with more going out than came in",
  overDeliveredTitle: "{count} rows with more going out than came in",
  overDeliveredFigures:
    ": received {received}, but sent + material problem + rejection is {outward}.",
  overDeliveredNote: "Correct these before saving — you cannot return more pieces than came in.",
  alreadyConvertedTitle: "This scanned customer DC has already been entered",
  alreadyConvertedBody:
    "A delivery challan was already created from it. Creating another would record the same inward lot twice.",
  alreadyConvertedBodyDc:
    "A delivery challan was already created from it ({dc}). Creating another would record the same inward lot twice.",
  openDc: "Open {dc}",
  openTheDc: "Open the delivery challan",
  mayBeEnteredTitle: "This challan may already be entered",
  saveAnyway: "Save it anyway — this is a second despatch against the same customer challan.",
  overContinuedTitle: "More than remains outstanding",
  overContinuedLine:
    "{component} has {room} left to despatch, but {entered} is entered here. Reduce it before saving.",
  chooseComponentTitle: "Choose the component",
  unnamedOne:
    "1 row has quantities but no component. Pick it from the list, which holds only the components in Settings, or remove the row.",
  unnamedMany:
    "{count} rows have quantities but no component. Pick it from the list, which holds only the components in Settings, or remove the row.",
  saveChanges: "Save changes",
  createDc: "Create delivery challan",
  nothingSelected: "Nothing was selected to apply.",
  filledIn: "Filled in {what}. Please check before saving.",
  appliedCustomer: "customer",
  appliedRef: "customer DC ref",
  appliedItemsOne: "1 item",
  appliedItems: "{count} items",
  noComponentsToCopy: "{source} has no components to copy.",
  filledItemsOne: "Filled 1 item from {source}. Check the quantities before saving.",
  filledItems: "Filled {count} items from {source}. Check the quantities before saving.",
  alreadyOnChallan: "Those components are already on this challan.",
  challansDated: "challans dated {date}",
  searchComponents: "Search components...",
  addComponentsInSettings: "Add components in Settings",
  noComponentMatch: "No component matches. Add it in Settings first.",
  searchMaterials: "Search materials...",
  addMaterialsInSettings: "Add materials in Settings",
  noMaterialMatch: "No material matches. Add it in Settings first.",
  addComponent: "Add Component",
  removeRow: "Remove row",
  customerDcNumbers: "Customer DC Number(s)",
  customerDcNoPlaceholder: "Customer DC No.",
  addAnotherRef: "Add another Customer DC No.",
  chooseFromOne: "Choose from 1 stored customer DC number",
  chooseFrom: "Choose from {count} stored customer DC numbers",
  storedNumbers: "Stored customer DC numbers",
  onFileDated: "On file for this customer dated {date}.",
  onFile: "On file for this customer. Pick a date to narrow the list.",
  itemsOne: "1 item",
  items: "{count} items",
  hide: "Hide",
  use: "Use",
  useNote:
    "“Use” fills the reference and copies the stored components and received quantities. Nothing is saved until you submit this form.",
  checkingDate: "Checking what is still pending on {date}…",
  pendingOnDate: "{total} pending on {date}",
  unfinishedAcross:
    "Unfinished rows {rows} · Challans {challans}. Settled challans are not listed.",
  fillAll: "Fill all {count}",
  done: "Done",
  dateNote:
    "Pending is received minus sent, material problem and rejection. Filling copies the pending count; sent, material problem and rejection stay at zero for you to enter. Nothing is saved until you submit this form.",
  selectCustomer: "Select customer...",
  searchCustomers: "Search customers...",
  noCustomers: "No customers found.",
  select: "Select...",
  typeToSearch: "Type to search...",
  nothingMatches: "Nothing matches.",
  pickDate: "Pick a date",
  printThisList: "Print this list",
};

/** Why a save or a status change was refused. Values in {braces} are passed through. */
export const dcErrors = {
  scanDiscarded:
    "This scanned customer DC was discarded, so a delivery challan cannot be created from it.",
  scanConvertedTo:
    "A delivery challan has already been created from this scanned customer DC ({dc}). Open it from Scanned DCs rather than creating another.",
  scanConverted:
    "A delivery challan has already been created from this scanned customer DC. Open it from Scanned DCs rather than creating another.",
  overDispatch:
    "More is being despatched than remains outstanding: {component} has {left} left to despatch but {entered} is entered. Nothing was saved.",
  belowFollowUps:
    "{component}: follow-up DCs already account for {qty}, so the received quantity cannot be reduced below that. Nothing was saved.",
  belowBilled:
    "{component}: {qty} is already billed on issued invoices, so Sent cannot be reduced below that. Cancel the invoice first if it is wrong. Nothing was saved.",
  billedLineRemoved:
    "{component} is billed on an invoice, so it cannot be removed from this DC. Nothing was saved.",
  weighedLineRemoved:
    "{component}: This line has weight/scrap recorded. Remove its weight on the Weight / Scrap screen first. Nothing was saved.",
  billedMonthLocked:
    "{dc} is billed for {month}, so its date cannot move to another month. Cancel the invoice first if the date is wrong. Nothing was saved.",
  billedCustomerLocked:
    "This DC is billed on an issued invoice, so its customer cannot change. Cancel the invoice first. Nothing was saved.",
  billedCannotReopen:
    "This DC is billed on an issued invoice, so it cannot be reopened. Cancel the invoice first.",
  parentLineMissing: "The line this follow-up continues no longer exists. Nothing was saved.",
  dcNotFound: "That delivery challan no longer exists.",
  noItems: "Add at least one item.",
  noCustomer: "Please select a customer.",
  followUpLineInUse:
    "A line with follow-up DCs raised against it cannot be removed. Nothing was saved.",
  notAllowed: "You are not signed in, or not allowed to save delivery challans. Nothing was saved.",
  genericWithDetail: "The delivery challan could not be saved, and nothing was kept. ({detail})",
  generic: "The delivery challan could not be saved, and nothing was kept. Please try again.",
  unnamedRowsOne:
    "1 row has quantities but no component. Choose the component from Settings, or remove the row.",
  unnamedRows:
    "{count} rows have quantities but no component. Choose the component from Settings, or remove the row.",
  negative: "Quantities cannot be negative ({component}).",
  duplicateRefs:
    "The same customer DC number appears more than once: {refs}. Each reference may only be listed once.",
  overDelivered: "More pieces go out than came in on: {rows}.",
  extraRow: "{component} ({count} extra)",
  overContinued: "More is being despatched than remains outstanding: {lines}.",
  overContinuedLine: "{component} has {left} left to despatch but {entered} is entered",
  duplicateWarning:
    "This customer reference is already recorded: {listed}. Tick the box below and save again if that is correct.",
  refOnDc: "{ref} (on {dc})",
  confirmOver:
    "Confirming this would despatch more than was received: {lines}. Reduce the quantity first.",
  overLine: "{component} ({count} over)",
  aLine: "a line",
  signedOutScan: "You are signed out. Sign in and scan again.",
  notInSettings:
    "Not in Settings → Components & Materials: {names}. Pick the correct component instead.",
  notInSettingsList:
    "Not in Settings → Components & Materials: {names}. Pick the correct component from the list.",
  correctionsNotSaved: "The corrections were not saved: {error}",
  scanNoLongerPending: "That scan is no longer pending, so it cannot be edited.",
  imagePrepare: "Could not prepare the image on this device.",
};
