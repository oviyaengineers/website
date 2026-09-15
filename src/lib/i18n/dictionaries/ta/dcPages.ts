import type { Dictionary } from "../../types";

/** DC விவரம், DC வரலாறு, அச்சிடும் DC பட்டியல், சேமித்த சலான் தேடல். */

export const dcDetail: Dictionary["dcDetail"] = {
  pageTitle: "டெலிவரி சலான்",
  customerDcNo: "வாடிக்கையாளர் DC எண்: {value}",
  authorization: "அங்கீகாரம்",
  authorizedBy: "அங்கீகரித்தவர்: {name}",
  balanceErrorOne: "1 வரிசையில் மீதப் பிழை",
  balanceError: "{count} வரிசைகளில் மீதப் பிழை",
  rowPrefix: "வரிசை {row}",
  rowFigures: ": பெற்றது {received}, வெளியே கணக்கிடப்பட்டது {outward}",
  followUpOf: "இதன் தொடர்ச்சி:",
  draftNote: "அங்கு இப்போதைய மீதம் {now}. இதை உறுதிசெய்தால் {here} அனுப்பப்படும், மீதம் {after}.",
  confirmedNote: "இந்தச் சலான் {here} அனுப்பியது. அங்கு இப்போதைய மீதம் {now}.",
  overRemaining:
    "இது மீதமுள்ளதை விட {count} அதிகம், எனவே உறுதிசெய்வது மறுக்கப்படும். முதலில் திருத்தவும்.",
  materialDetails: "பொருள் / உதிரிபாக விவரங்கள்",
  receivedQty: "பெற்ற அளவு",
  sentQty: "அனுப்பிய அளவு",
  materialProblem: "பொருள் குறைபாடு",
  onDraftNotCounted: "வரைவில் {count}, இன்னும் கணக்கிடப்படவில்லை",
  billingMonth: "பில்லிங் மாதம் {month}",
  billThisDc: "இந்த DC-க்கு பில் செய்",
  componentMaterial: "உதிரிபாகம் / பொருள்",
  sentBillable: "அனுப்பியது (பில் செய்யக்கூடியது)",
  billed: "பில் செய்தது",
  unbilled: "பில் செய்யாதது",
  invoices: "இன்வாய்ஸ்கள்",
  cancelled: "ரத்து செய்யப்பட்டது",
  followUpHistory: "தொடர்ச்சி DC வரலாறு",
  followUpCountOne:
    "இதற்கு எதிராக 1 தொடர்ச்சி சலான் உருவாக்கப்பட்டது. ஒவ்வொன்றும் தனியாகத் திறக்கும்.",
  followUpCount:
    "இதற்கு எதிராக {count} தொடர்ச்சி சலான்கள் உருவாக்கப்பட்டன. ஒவ்வொன்றும் தனியாகத் திறக்கும்.",
  followUpDcNo: "தொடர்ச்சி DC எண்",
  remainingBalance: "மீதமுள்ளது",
  pendingStatus: "நிலுவையில்",
  confirmedAgainst: "இந்தச் சலானுக்கு எதிராக உறுதிசெய்யப்பட்டது",
  onDraftsNotCounted: "வரைவுகளில், இன்னும் கணக்கிடப்படவில்லை",
  sentAfterMachining: "இயந்திர வேலைக்குப் பின் அனுப்பப்பட்டது",
  anEarlierChallan: "முந்தைய சலான்",
};

export const billingStatus: Dictionary["billingStatus"] = {
  notBillable: "எதுவும் அனுப்பப்படவில்லை",
  unbilled: "பில் செய்யப்படவில்லை",
  partial: "பகுதியாக பில் செய்யப்பட்டது",
  billed: "பில் செய்யப்பட்டது",
};

export const dcHistory: Dictionary["dcHistory"] = {
  title: "DC வரலாறு",
  intro:
    "ஒரு தேதி வரம்பில் உள்ள அனைத்து DC பதிவுகளும், பழையது முதலில். எங்கள் சலான்கள் எங்கள் DC தேதியின்படி; ஸ்கேன் செய்த வாடிக்கையாளர் DCகள் வாடிக்கையாளர் DC தேதியின்படி, தேதி படிக்கப்படாவிட்டால் ஸ்கேன் செய்த நாளின்படி.",
  printHistory: "வரலாற்றை அச்சிடு",
  kindScanned: "ஸ்கேன் - நிலுவை",
  kindDispatchedPending: "அனுப்பியது - நிலுவை",
  kindCompleted: "முடிந்தது",
  sourceDcDate: "எங்கள் DC தேதி",
  sourceCustomerDcDate: "வாடிக்கையாளர் DC தேதி",
  sourceScannedAt: "ஸ்கேன் செய்த நாள் (DC தேதி படிக்கப்படவில்லை)",
  fromDate: "தொடக்கத் தேதி",
  toDate: "இறுதித் தேதி",
  searchPlaceholder: "எங்கள் DC எண், வாடிக்கையாளர் DC எண், வாடிக்கையாளர், உதிரிபாகம் அல்லது பொருள்",
  applyFilter: "வடிகட்டு",
  clearFilter: "வடிகட்டியை அழி",
  fromAfterTo:
    "தொடக்கத் தேதி இறுதித் தேதிக்குப் பிறகு உள்ளது. இறுதித் தேதி அல்லது அதற்கு முந்தைய தொடக்கத் தேதியைத் தேர்ந்தெடுக்கவும்.",
  range: "{from} முதல் {to} வரை, இரு நாட்களும் சேர்த்து.",
  earliest: "தொடக்கம்",
  latest: "சமீபத்தியது",
  allDates:
    "அனைத்து தேதிகளும். வரலாற்றைக் குறைக்க தொடக்க மற்றும் இறுதித் தேதியைத் தேர்ந்தெடுக்கவும்.",
  totalRecords: "மொத்தப் பதிவுகள்",
  totalReceived: "மொத்தம் பெற்றது",
  totalSent: "மொத்தம் அனுப்பியது",
  totalMaterialProblem: "மொத்தப் பொருள் குறைபாடு",
  totalRejection: "மொத்த நிராகரிப்பு",
  totalBalance: "மொத்த மீதம்",
  totalsNote:
    "அனுப்பியது, பொருள் குறைபாடு, நிராகரிப்பு ஆகியவை அவற்றை உருவாக்கிய சலானில் கணக்கிடப்படுகின்றன. மீதம் ஒவ்வொரு மூல லாட்டையும் ஒருமுறை மட்டுமே கணக்கிடுகிறது, அதன் தொடர்ச்சிகள் எத்தனை இருந்தாலும், மேலும் எங்கள் சலானுக்காகக் காத்திருக்கும் ஸ்கேன் செய்த DCகளில் பெற்றதும் சேர்க்கப்படுகிறது.",
  dcNoCustomerDc: "DC எண் / வாடிக்கையாளர் DC",
  notYetRaised: "இன்னும் உருவாக்கப்படவில்லை",
  followUpOf: "இதன் தொடர்ச்சி:",
  followUpOfDc: "{dc} இன் தொடர்ச்சி",
  onFollowUps: "தொடர்ச்சிகளில் +{count}",
  noRange: "காட்ட வரம்பு இல்லை.",
  noMatch: "இந்த வடிகட்டிகளுக்குப் பொருந்தும் DC பதிவு இல்லை.",
  noRecords: "இன்னும் DC பதிவுகள் இல்லை.",
  customerDcInline: "வாடிக்கையாளர் DC {refs}",
  printTitle: "DC வரலாறு (உள் பயன்பாடு)",
  datedBy:
    "எங்கள் DC தேதியின்படி, அல்லது இன்னும் உருவாக்கப்படாத ஸ்கேன் DCகளுக்கு வாடிக்கையாளர் DC தேதியின்படி.",
  printed: "அச்சிட்டது {when}",
  summaryLineOne:
    "1 பதிவு · ஸ்கேன் நிலுவை {scanned} · அனுப்பியது நிலுவை {dispatched} · முடிந்தது {completed}",
  summaryLine:
    "{count} பதிவுகள் · ஸ்கேன் நிலுவை {scanned} · அனுப்பியது நிலுவை {dispatched} · முடிந்தது {completed}",
  printButton: "இந்த வரலாற்றை அச்சிடு",
  dcNumber: "DC எண்",
  customerDcNumber: "வாடிக்கையாளர் DC எண்",
  followUpOfInline: "({dc} இன் தொடர்ச்சி)",
  pendingCount: "{count} நிலுவையில்",
  totalCountedOnce: "மொத்தம் (ஒவ்வொரு அளவும் ஒருமுறை மட்டும்)",
  rangeLower: "{from} முதல் {to} வரை",
  earliestLower: "தொடக்கம்",
  allDatesShort: "அனைத்து தேதிகளும்",
  matching: "“{q}” உடன் பொருந்துபவை",
};

export const dcPrintList: Dictionary["dcPrintList"] = {
  pageTitle: "DC பட்டியலை அச்சிடு",
  title: "டெலிவரி சலான் பட்டியல்",
  printed: "அச்சிட்டது {when}",
  allChallans: "அனைத்து சலான்கள்",
  range: "{from} முதல் {to} வரை",
  fromOnly: "{from} முதல்",
  upTo: "{to} வரை",
  matching: "“{q}” உடன் பொருந்துபவை",
};

export const dcLookup: Dictionary["dcLookup"] = {
  customerDc: "வாடிக்கையாளர் DC: {refs}",
  noItems: "உருப்படிகள் எதுவும் பதிவு செய்யப்படவில்லை.",
  storedOne: "1 சேமித்த டெலிவரி சலான்",
  stored: "{count} சேமித்த டெலிவரி சலான்கள்",
  recordedAgainstRef: "“{ref}” க்கு எதிராக ஏற்கனவே பதிவு செய்யப்பட்டுள்ளது.",
  recordedAgainstRefOn: "{date} அன்று “{ref}” க்கு எதிராக ஏற்கனவே பதிவு செய்யப்பட்டுள்ளது.",
  recordedAgainstDate: "இந்தத் தேதிக்கு எதிராக ஏற்கனவே பதிவு செய்யப்பட்டுள்ளது.",
  hide: "சேமித்த சலான் விவரங்களை மறை",
  readOnly: "படிக்க மட்டும். இங்குள்ள எதுவும் சேமித்த சலான்களை மாற்றாது.",
  dialogLabel: "சேமித்த டெலிவரி சலான் விவரங்கள்",
  showStored: "இந்தக் குறிப்புக்கான {count} சேமித்த டெலிவரி சலான்களைக் காட்டு",
  hideStored: "இந்தக் குறிப்புக்கான {count} சேமித்த டெலிவரி சலான்களை மறை",
};
