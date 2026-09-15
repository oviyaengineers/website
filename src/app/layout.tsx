import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Tamil } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Tamil letters for the ERP when Tamil is chosen, on screen and in browser
// print, so vowel signs and conjuncts render the same on every device. Not
// preloaded: the browser fetches it only when Tamil text is on the page, so
// the English marketing site never downloads it.
const notoSansTamil = Noto_Sans_Tamil({
  variable: "--font-noto-tamil",
  subsets: ["tamil"],
  preload: false,
});

export const metadata: Metadata = {
  title: {
    default: "Oviya Engineers | Precision Engineering & Fabrication",
    template: "%s | Oviya Engineers",
  },
  description:
    "Oviya Engineers delivers precision machining, fabrication, and job-shop manufacturing services with reliable delivery and quality you can trust.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansTamil.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Every toast in the app went nowhere without this: a dozen
            components call toast.success and toast.error, and with no host
            mounted none of it ever rendered. Confirmations went unseen and,
            worse, so did failures — a refused write looked like nothing at
            all had happened. */}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
