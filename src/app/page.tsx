import Link from "next/link";
import { Cog, Gauge, ShieldCheck, Truck } from "lucide-react";
import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";

const highlights = [
  { icon: Cog, title: "Precision Machining", desc: "CNC turning, milling, and fabrication to tight tolerances." },
  { icon: Gauge, title: "Fast Turnaround", desc: "Streamlined job tracking from quote to delivery challan." },
  { icon: ShieldCheck, title: "Quality Assured", desc: "Rigorous inspection at every stage of production." },
  { icon: Truck, title: "Reliable Delivery", desc: "On-time dispatch with full delivery challan tracking." },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <SiteNav />
      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-zinc-800">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.12),transparent_60%)]" />
          <div className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
            <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-amber-400">
              Precision Engineering &amp; Fabrication
            </p>
            <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-white sm:text-5xl">
              Engineered to spec. Delivered on time.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-zinc-400">
              Oviya Engineers is a job-shop manufacturing partner for precision machining,
              fabrication, and assembly — trusted by manufacturers who need consistent quality
              and dependable delivery.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/contact"
                className="rounded-md bg-amber-500 px-6 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-amber-400"
              >
                Request a Quote
              </Link>
              <Link
                href="/services"
                className="rounded-md border border-zinc-700 px-6 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:border-amber-500 hover:text-amber-400"
              >
                Our Services
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {highlights.map((h) => (
              <div key={h.title} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
                <h.icon className="mb-4 h-8 w-8 text-amber-400" />
                <h3 className="mb-2 text-lg font-semibold text-white">{h.title}</h3>
                <p className="text-sm text-zinc-400">{h.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-zinc-800 bg-zinc-900/40">
          <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">
              Ready to start your next job?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-zinc-400">
              Reach out with your drawings or requirements and we&apos;ll get back to you with a
              detailed quote.
            </p>
            <Link
              href="/contact"
              className="mt-8 inline-block rounded-md bg-amber-500 px-6 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-amber-400"
            >
              Get in Touch
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
