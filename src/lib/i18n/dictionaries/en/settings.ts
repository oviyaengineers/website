/** Settings screens that are not billing, and the sign-in screen. */

export const settings = {
  // DC numbering
  dcNumbersTitle: "DC Number Settings",
  dcNumbersIntro: "Choose the financial year and the serial the next delivery challan takes.",
  seriesCard: "Numbering series",
  notSetUp: "The numbering series is not set up in the database yet.",
  notSetUpHelp:
    "Run migration 0015_dc_number_series.sql in Supabase, then reload this page. Challans can still be created in the meantime — they keep taking numbers from the old calendar-year series.",
  changeCard: "What a change does",
  changeNote1:
    "Challans already issued keep the numbers they have. Nothing on this screen rewrites them.",
  changeNote2:
    "Moving the serial back over a number that was already used is allowed. The next challan steps past anything taken, so a run of numbers burned by mistake can be reclaimed without a clash.",
  financialYear: "Financial year",
  financialYearHelp: "This year is {year}. April starts a new one.",
  nextSerial: "Next serial",
  nextSerialHelp: "The number the next challan takes. Already-issued numbers are skipped.",
  serialDigits: "Serial digits",
  serialDigitsHelp: "3 prints 1 as 001.",
  prefix: "Prefix (optional)",
  prefixPlaceholder: "none",
  prefixHelp: "Printed before the year.",
  nextNumbered: "Next challan will be numbered",
  saveNumbering: "Save numbering",
  numberingSaved: "DC numbering saved.",

  // Components & materials
  picklistTitle: "Component & Material Settings",
  picklistIntro: "Manage the dropdown options used on Delivery Challan item rows.",
  picklistSearch: "Search component or material names...",
  components: "Components",
  materials: "Materials",
  addComponent: "Add component...",
  addMaterial: "Add material...",
  add: "Add",
  noComponents: "No components added yet.",
  noMaterials: "No materials added yet.",
  noComponentMatch: "No component matches “{q}”.",
  noMaterialMatch: "No material matches “{q}”.",

  // Renaming and removing an entry
  renameAria: "Rename {name}",
  saveName: "Save name",
  cancelRename: "Cancel rename",
  nameEmpty: "Name cannot be empty.",
  renamed: "Renamed.",
  renamedRowsOne: "Renamed, and updated 1 challan row that used it.",
  renamedRows: "Renamed, and updated {count} challan rows that used it.",
  removeAria: "Remove {name}",
  removeComponentTitle: "Remove component?",
  removeMaterialTitle: "Remove material?",
  removeBody:
    "“{name}” will no longer be offered on delivery challan item rows. This cannot be undone.",
  inUseOne: "In use on 1 stored challan row",
  inUse: "In use on {count} stored challan rows",
  inUseNote: "Those rows keep this name, but it cannot be chosen on a new challan once removed.",
  removing: "Removing…",
  remove: "Remove",
  removed: "Removed “{name}”",
  removeFailed: "Failed to remove",

  // Names on challans that the lists are missing
  missingOne: "1 name used on challans but missing from these lists",
  missing: "{count} names used on challans but missing from these lists",
  missingNote:
    "These are recorded on stored challans, so they cannot be picked on a new one until they are added here. Nothing already listed is touched and nothing is duplicated.",
  addAll: "Add all {count}",
  adding: "Adding…",
  addedOne: "Added 1 name to the dropdowns.",
  added: "Added {count} names to the dropdowns.",

  // Possible duplicates
  duplicatesOne: "1 possible duplicate in this list",
  duplicates: "{count} possible duplicate sets in this list",
  duplicatesNote:
    "These read as the same {kind} spelled differently. Keep the correct spelling and the rest are removed, with any challan rows moved across. Check each one — two genuinely different parts can differ by a single character.",
  kindComponent: "component",
  kindMaterial: "material",
  notUsed: "not used on any challan",
  usedOne: "used on 1 challan row",
  used: "used on {count} challan rows",
  merging: "Merging…",
  keepRemove: "Keep this, remove {count}",
  notDuplicates: "Not duplicates",
  removedDuplicatesOne: "Removed 1 duplicate.",
  removedDuplicates: "Removed {count} duplicates.",
  removedAndMoved: "Removed {removed}, and moved {rows} challan rows onto the kept spelling.",

  // Messages the server sends back when a change is refused.
  errorEnterFy: "Enter the financial year, for example 26-27.",
  errorFyChars: "The financial year may only contain letters, digits, - and /.",
  errorPrefixLong: "Keep the prefix to 12 characters or fewer.",
  errorDigitsRange: "Serial digits must be between 1 and 8.",
  errorSerialMin: "The next serial must be 1 or more.",
  errorAdminOnly: "Nothing was saved. Only an admin can change DC numbering.",
  errorNameRequired: "Name is required.",
  errorAlreadyListed: "Already listed as “{name}”.",
  errorNameExists: "That name already exists.",
  errorEntryGone: "That entry no longer exists.",
  errorRenameRefused: "The database refused the rename. Migration 0012 may not be applied yet.",
  errorKeepGone: "The entry to keep no longer exists.",
  errorNothingToRemove: "Nothing to remove.",
};

export const auth = {
  signIn: "Sign in",
  email: "Email",
  password: "Password",
  signingIn: "Signing in...",
};
