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
};
