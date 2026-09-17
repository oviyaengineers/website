import type { Metadata } from "next";
import { QrScanner } from "@/components/qr-scanner";
import { getTranslator } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: `${t("qrScan.title")} | Oviya Engineers` };
}

/** Scan the QR code on a printed DC and open its secure public page. */
export default async function ScanQrPage() {
  const { t } = await getTranslator();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{t("qrScan.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("qrScan.intro")}</p>
      </div>
      <QrScanner />
    </div>
  );
}
