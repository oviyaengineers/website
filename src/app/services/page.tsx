import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { ArrowRight, Cog, Drill, Flame, Layers, Ruler, Wrench } from "lucide-react";
import { GridGlow } from "@/components/marketing/decor";

export const metadata: Metadata = {
  title: "Services",
  description: "CNC machining, fabrication, welding, and finishing services offered by Oviya Engineers.",
};

const services = [
  { icon: Cog, title: "CNC Turning & Milling", desc: "High-precision turning and milling for complex components in a wide range of metals.", accent: "amber" as const },
  { icon: Flame, title: "Welding & Fabrication", desc: "Structural and precision fabrication including MIG, TIG, and arc welding.", accent: "cyan" as const },
  { icon: Layers, title: "Sheet Metal Work", desc: "Cutting, bending, and forming for enclosures, brackets, and custom assemblies.", accent: "amber" as const },
  { icon: Drill, title: "Drilling & Tapping", desc: "Accurate hole-making and threading services for production and prototype parts.", accent: "cyan" as const },
  { icon: Ruler, title: "Quality Inspection", desc: "Dimensional inspection and quality checks against customer drawings and specs.", accent: "amber" as const },
  { icon: Wrench, title: "Assembly Services", desc: "Sub-assembly and finishing work to deliver ready-to-use components.", accent: "cyan" as const },
];

const process = [
  { step: "01", title: "Share Drawings", desc: "Send your specs, drawings, or samples for review." },
  { step: "02", title: "Get a Quote", desc: "We assess feasibility and respond with pricing and lead time." },
  { step: "03", title: "Production", desc: "Machining, fabrication, and inspection under one roof." },
  { step: "04", title: "Delivery", desc: "On-time dispatch with full delivery challan tracking." },
];

export default function ServicesPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <SiteNav />
      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-white/10">
          <GridGlow />
          <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-amber-400">
              Services
            </p>
            <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              End-to-end{" "}
              <span className="bg-gradient-to-r from-amber-300 to-cyan-400 bg-clip-text text-transparent">
                manufacturing
              </span>{" "}
              capabilities
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-zinc-400">
              From raw material to finished part, we handle machining, fabrication, and
              finishing under one roof.
            </p>
          </div>
        </section>

        <section className="border-b border-white/10 bg-zinc-900/40">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((s) => (
                <div
                  key={s.title}
                  className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/60 p-6 shadow-lg shadow-black/20 transition-all hover:-translate-y-1 ${
                    s.accent === "amber"
                      ? "hover:border-amber-500/40 hover:shadow-amber-500/10"
                      : "hover:border-cyan-500/40 hover:shadow-cyan-500/10"
                  }`}
                >
                  <div
                    className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${
                      s.accent === "amber" ? "bg-amber-500/15" : "bg-cyan-500/15"
                    }`}
                  >
                    <s.icon className={`h-5 w-5 ${s.accent === "amber" ? "text-amber-400" : "text-cyan-400"}`} />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-white">{s.title}</h3>
                  <p className="text-sm text-zinc-400">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-white/10">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="mb-12 max-w-2xl">
              <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-cyan-400">
                How It Works
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                From drawing to delivery
              </h2>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {process.map((p) => (
                <div key={p.step} className="relative rounded-2xl border border-white/10 bg-zinc-900/50 p-6">
                  <span className="bg-gradient-to-r from-amber-300 to-cyan-400 bg-clip-text text-3xl font-extrabold text-transparent">
                    {p.step}
                  </span>
                  <p className="mt-3 font-semibold text-white">{p.title}</p>
                  <p className="mt-1 text-sm text-zinc-400">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-transparent to-cyan-500/10" />
          <div className="relative mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Have a job in mind?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-zinc-400">
              Send your drawings and we&apos;ll come back with a detailed quote.
            </p>
            <Link
              href="/contact"
              className="group mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-8 py-3.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-amber-500/25 transition-all hover:shadow-xl hover:shadow-amber-500/35"
            >
              Request a Quote
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
