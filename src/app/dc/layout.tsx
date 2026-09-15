import { I18nProvider } from "@/components/i18n-provider";
import { getTranslator } from "@/lib/i18n/server";

/**
 * Public challan pages, opened from a printed QR code. No sign-in and no app
 * menu: only the challan, in the visitor's chosen language.
 */
export default async function PublicDcLayout({ children }: { children: React.ReactNode }) {
  const { lang } = await getTranslator();
  return (
    <I18nProvider lang={lang}>
      <div lang={lang} className="contents">
        {children}
      </div>
    </I18nProvider>
  );
}
