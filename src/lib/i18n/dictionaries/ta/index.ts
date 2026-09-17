import type { Dictionary } from "@/lib/i18n/types";
import { common, dashboard, header, nav, search } from "@/lib/i18n/dictionaries/ta/shell";
import { dc } from "@/lib/i18n/dictionaries/ta/dc";
import {
  billingStatus,
  dcDetail,
  dcHistory,
  dcLookup,
  dcPrintList,
} from "@/lib/i18n/dictionaries/ta/dcPages";
import { dcViews } from "@/lib/i18n/dictionaries/ta/dcViews";
import { dcErrors, dcForm } from "@/lib/i18n/dictionaries/ta/dcForm";
import { dcPrint, dcScan } from "@/lib/i18n/dictionaries/ta/dcScan";
import { dcPublic } from "@/lib/i18n/dictionaries/ta/dcPublic";
import { dcCombined } from "@/lib/i18n/dictionaries/ta/dcCombined";
import { costs, customers } from "@/lib/i18n/dictionaries/ta/admin";
import { weight } from "@/lib/i18n/dictionaries/ta/weight";
import { security } from "@/lib/i18n/dictionaries/ta/security";
import { auth, settings } from "@/lib/i18n/dictionaries/ta/settings";

/** தமிழ் அகராதி: ஆங்கில அகராதியின் அதே விசைகள். */
export const ta: Dictionary = {
  common,
  nav,
  header,
  dashboard,
  search,
  dc,
  dcDetail,
  billingStatus,
  dcHistory,
  dcPrintList,
  dcLookup,
  dcViews,
  dcForm,
  dcErrors,
  dcScan,
  dcPrint,
  dcPublic,
  dcCombined,
  customers,
  costs,
  settings,
  auth,
  weight,
  security,
};
