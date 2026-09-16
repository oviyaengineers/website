import { I18nProvider } from "@/components/i18n-provider";
import { getTranslator } from "@/lib/i18n/server";

/** Sign-in pages, in whichever language this browser last chose. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { lang } = await getTranslator();
  return (
    <I18nProvider lang={lang}>
      <div lang={lang} className="contents">
        {children}
      </div>
    </I18nProvider>
  );
}
