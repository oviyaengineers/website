import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PUBLIC_DC_TOKEN } from "@/lib/dc-public-link";
import { formatDate } from "@/lib/i18n/dates";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return {
    title: t("dcPublic.pageTitle"),
    // A challan link is private to whoever holds the paper.
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

/** Exactly what get_public_dc returns; the database decides these fields. */
type PublicDc = {
  dc_number: string;
  dc_date: string;
  customer_name: string | null;
  customer_dc_number: string[];
  customer_dc_date: (string | null)[];
  items: {
    component: string;
    material: string | null;
    sent_qty: number;
    material_problem_qty: number;
    rejection_qty: number;
    total_qty: number | null;
  }[];
};

const CELL = "border border-slate-300 px-2 py-1.5";

/**
 * The public, read-only view of one delivery challan, opened from its QR code.
 *
 * Nothing here can change anything: it calls one read-only database function
 * by the token in the link, and shows only the fields that function returns.
 */
export default async function PublicDcPage({ params }: { params: Promise<{ token: string }> }) {
  const [{ token }, { lang, t }] = await Promise.all([params, getTranslator()]);

  let dc: PublicDc | null = null;
  if (PUBLIC_DC_TOKEN.test(token)) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_public_dc", { p_token: token });
    dc = (data as PublicDc | null) ?? null;
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 text-[#172033] sm:py-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div>
          <p className="text-lg font-bold tracking-wide">OVIYA ENGINEERS</p>
          <p className="text-xs text-slate-500">
            40, Ashok Metha Street, K.K. Palayam, Vellalore, Coimbatore - 641111
          </p>
        </div>
        <LanguageSwitcher />
      </header>

      {!dc ? (
        <section className="rounded-lg border bg-white p-6 text-center">
          <h1 className="text-xl font-semibold">{t("dcPublic.notFoundTitle")}</h1>
          <p className="mt-2 text-sm text-slate-600">{t("dcPublic.notFoundBody")}</p>
        </section>
      ) : (
        <section className="space-y-5 rounded-lg border bg-white p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h1 className="text-2xl font-semibold">{t("dcPublic.pageTitle")}</h1>
              <p className="text-sm text-slate-600">{t("dcPublic.intro")}</p>
            </div>
            <span className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {t("dcPublic.readOnly")}
            </span>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">{t("dcPublic.dcNumber")}</dt>
              <dd className="font-medium">{dc.dc_number}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t("dcPublic.date")}</dt>
              <dd className="font-medium">{formatDate(dc.dc_date, "dd MMM yyyy", lang)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t("dcPublic.customerName")}</dt>
              <dd className="font-medium">{dc.customer_name ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t("dcPublic.customerDcNumbers")}</dt>
              <dd className="font-medium">
                {dc.customer_dc_number.length > 0
                  ? dc.customer_dc_number.map((num, i) => (
                      <span key={i} className="block">
                        {num || "-"}
                        {dc.customer_dc_date[i]
                          ? ` (${formatDate(dc.customer_dc_date[i] as string, "dd MMM yyyy", lang)})`
                          : ""}
                      </span>
                    ))
                  : "-"}
              </dd>
            </div>
          </dl>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold">{t("dcPublic.items")}</h2>
            {dc.items.length === 0 ? (
              <p className="text-sm text-slate-600">{t("dcPublic.noItems")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead className="bg-slate-50 text-xs">
                    <tr>
                      <th className={`${CELL} text-center`}>{t("dcPrint.sNo")}</th>
                      <th className={`${CELL} text-left`}>{t("dcPrint.description")}</th>
                      <th className={`${CELL} text-left`}>{t("dcPrint.material")}</th>
                      <th className={`${CELL} text-right`}>{t("dcPrint.qty")}</th>
                      <th className={`${CELL} text-right`}>{t("dcPrint.matProblem")}</th>
                      <th className={`${CELL} text-right`}>{t("dcPrint.rejection")}</th>
                      <th className={`${CELL} text-right`}>{t("dcPrint.total")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dc.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className={`${CELL} text-center`}>{idx + 1}</td>
                        <td className={CELL}>{item.component}</td>
                        <td className={CELL}>{item.material ?? "-"}</td>
                        <td className={`${CELL} text-right tabular-nums`}>{item.sent_qty}</td>
                        <td className={`${CELL} text-right tabular-nums`}>
                          {item.material_problem_qty}
                        </td>
                        <td className={`${CELL} text-right tabular-nums`}>{item.rejection_qty}</td>
                        <td className={`${CELL} text-right tabular-nums`}>
                          {item.total_qty ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      <p className="mt-6 text-center text-xs text-slate-500">{t("dcPublic.contact")}</p>
    </main>
  );
}
