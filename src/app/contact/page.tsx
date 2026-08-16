import type { Metadata } from "next";
import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Mail, MapPin, Phone } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Oviya Engineers for quotes, questions, or project inquiries.",
};

export default function ContactPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <SiteNav />
      <main className="flex-1">
        <section className="border-b border-zinc-800 bg-zinc-900/40">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-amber-400">
              Contact
            </p>
            <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-white">
              Let&apos;s discuss your next job
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-zinc-400">
              Send us your requirements and we&apos;ll respond with a quote or next steps.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-2">
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <Phone className="mt-1 h-5 w-5 text-amber-400" />
                <div>
                  <p className="font-semibold text-white">Phone</p>
                  <p className="text-sm text-zinc-400">+91 00000 00000</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Mail className="mt-1 h-5 w-5 text-amber-400" />
                <div>
                  <p className="font-semibold text-white">Email</p>
                  <p className="text-sm text-zinc-400">info@oviyaengineers.com</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <MapPin className="mt-1 h-5 w-5 text-amber-400" />
                <div>
                  <p className="font-semibold text-white">Workshop</p>
                  <p className="text-sm text-zinc-400">
                    Industrial Estate, Tamil Nadu, India
                  </p>
                </div>
              </div>
            </div>

            <form className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm text-zinc-300" htmlFor="name">
                    Name
                  </label>
                  <input
                    id="name"
                    name="name"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none"
                    placeholder="Your name"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-zinc-300" htmlFor="phone">
                    Phone
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none"
                    placeholder="Phone number"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-sm text-zinc-300" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none"
                  placeholder="you@company.com"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-zinc-300" htmlFor="message">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={4}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none"
                  placeholder="Tell us about your project..."
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-amber-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-amber-400"
              >
                Send Message
              </button>
              <p className="text-xs text-zinc-500">
                This form is a placeholder — connect it to your preferred email/CRM service.
              </p>
            </form>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
