import type { Metadata } from "next";
import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Mail, MapPin, Phone, Send } from "lucide-react";
import { GridGlow } from "@/components/marketing/decor";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Oviya Engineers for quotes, questions, or project inquiries.",
};

export default function ContactPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <SiteNav />
      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-white/10">
          <GridGlow />
          <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-amber-400">
              Contact
            </p>
            <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Let&apos;s discuss{" "}
              <span className="bg-gradient-to-r from-amber-300 to-cyan-400 bg-clip-text text-transparent">
                your next job
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-zinc-400">
              Send us your requirements and we&apos;ll respond with a quote or next steps.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="flex items-start gap-4 rounded-2xl border border-white/10 bg-zinc-900/50 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
                  <Phone className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="font-semibold text-white">Phone</p>
                  <p className="text-sm text-zinc-400">+91 00000 00000</p>
                </div>
              </div>
              <div className="flex items-start gap-4 rounded-2xl border border-white/10 bg-zinc-900/50 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15">
                  <Mail className="h-5 w-5 text-cyan-400" />
                </div>
                <div>
                  <p className="font-semibold text-white">Email</p>
                  <p className="text-sm text-zinc-400">info@oviyaengineers.com</p>
                </div>
              </div>
              <div className="flex items-start gap-4 rounded-2xl border border-white/10 bg-zinc-900/50 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
                  <MapPin className="h-5 w-5 text-amber-400" />
                </div>
                <div>
                  <p className="font-semibold text-white">Workshop</p>
                  <p className="text-sm text-zinc-400">
                    Industrial Estate, Tamil Nadu, India
                  </p>
                </div>
              </div>
            </div>

            <form className="relative space-y-4 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50 p-6">
              <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl" />
              <div className="relative grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm text-zinc-300" htmlFor="name">
                    Name
                  </label>
                  <input
                    id="name"
                    name="name"
                    className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
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
                    className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                    placeholder="Phone number"
                  />
                </div>
              </div>
              <div className="relative space-y-1">
                <label className="text-sm text-zinc-300" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                  placeholder="you@company.com"
                />
              </div>
              <div className="relative space-y-1">
                <label className="text-sm text-zinc-300" htmlFor="message">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={4}
                  className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                  placeholder="Tell us about your project..."
                />
              </div>
              <button
                type="submit"
                className="relative flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-amber-500/20 transition-all hover:shadow-xl hover:shadow-amber-500/30"
              >
                <Send className="h-4 w-4" />
                Send Message
              </button>
              <p className="relative text-xs text-zinc-500">
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
