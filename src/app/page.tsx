import Link from "next/link";
import {
  ArrowRight,
  Cog,
  Drill,
  Flame,
  Gauge,
  Layers,
  ShieldCheck,
  Sparkles,
  Truck,
  Zap,
} from "lucide-react";
import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { CircuitIllustration, GridGlow } from "@/components/marketing/decor";

const highlights = [
  { icon: Cog, title: "Precision Machining", desc: "CNC turning, milling, and fabrication to tight tolerances." },
  { icon: Gauge, title: "Fast Turnaround", desc: "Streamlined job tracking from quote to delivery challan." },
  { icon: ShieldCheck, title: "Quality Assured", desc: "Rigorous inspection at every stage of production." },
  { icon: Truck, title: "Reliable Delivery", desc: "On-time dispatch with full delivery challan tracking." },
];

const services = [
  { icon: Cog, title: "CNC Turning & Milling", desc: "High-precision components across a wide range of metals.", accent: "amber" as const },
  { icon: Flame, title: "Welding & Fabrication", desc: "Structural and precision fabrication — MIG, TIG, and arc.", accent: "cyan" as const },
  { icon: Layers, title: "Sheet Metal Work", desc: "Cutting, bending, and forming for enclosures and brackets.", accent: "amber" as const },
  { icon: Drill, title: "Drilling & Tapping", desc: "Accurate hole-making and threading for any batch size.", accent: "cyan" as const },
];

const stats = [
  { value: "15+", label: "Years in operation" },
  { value: "1200+", label: "Jobs delivered" },
  { value: "98%", label: "On-time dispatch" },
  { value: "40+", label: "Manufacturing partners" },
];

const accentClasses = {
  amber: {
    icon: "text-amber-400",
    ring: "group-hover:border-amber-500/40 group-hover:shadow-amber-500/10",
    glow: "from-amber-500/10",
  },
  cyan: {
    icon: "text-cyan-400",
    ring: "group-hover:border-cyan-500/40 group-hover:shadow-cyan-500/10",
    glow: "from-cyan-500/10",
  },
};

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <SiteNav />
      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-white/10">
          <GridGlow />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-32">
            <div>
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-amber-300">
                <Sparkles className="h-3.5 w-3.5" />
                Precision Engineering &amp; Fabrication
              </p>
              <h1 className="max-w-xl text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
                Engineered to spec.{" "}
                <span className="bg-gradient-to-r from-amber-300 via-orange-400 to-cyan-400 bg-clip-text text-transparent">
                  Delivered on time.
                </span>
              </h1>
              <p className="mt-6 max-w-lg text-lg text-zinc-400">
                Oviya Engineers is a job-shop manufacturing partner for precision machining,
                fabrication, and assembly — trusted by manufacturers who need consistent
                quality and dependable delivery.
              </p>
              <div className="mt-9 flex flex-wrap gap-4">
                <Link
                  href="/contact"
                  className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-7 py-3.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-amber-500/25 transition-all hover:shadow-xl hover:shadow-amber-500/35"
                >
                  Request a Quote
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="/services"
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-semibold text-zinc-200 backdrop-blur transition-colors hover:border-cyan-400/40 hover:text-cyan-300"
                >
                  Our Services
                </Link>
              </div>

              <div className="mt-14 grid max-w-lg grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
                {stats.map((s) => (
                  <div key={s.label}>
                    <p className="text-2xl font-extrabold text-white sm:text-3xl">{s.value}</p>
                    <p className="mt-1 text-xs text-zinc-500">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative hidden lg:block">
              <CircuitIllustration className="mx-auto w-full max-w-md" />
            </div>
          </div>
        </section>

        {/* What we do */}
        <section className="border-b border-white/10 bg-gradient-to-b from-zinc-950 to-zinc-900/60">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="mb-12 max-w-2xl">
              <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-cyan-400">
                What We Do
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                End-to-end manufacturing capabilities
              </h2>
              <p className="mt-4 text-zinc-400">
                From raw material to finished part, we handle machining, fabrication, and
                finishing under one roof.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {services.map((s) => {
                const a = accentClasses[s.accent];
                return (
                  <div
                    key={s.title}
                    className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50 p-6 shadow-lg shadow-black/20 transition-all hover:-translate-y-1 ${a.ring}`}
                  >
                    <div
                      className={`absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${a.glow} to-transparent blur-xl transition-opacity group-hover:opacity-100`}
                    />
                    <s.icon className={`mb-4 h-8 w-8 ${a.icon}`} />
                    <h3 className="mb-2 text-lg font-semibold text-white">{s.title}</h3>
                    <p className="text-sm text-zinc-400">{s.desc}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-8">
              <Link
                href="/services"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-400 hover:text-amber-300"
              >
                View all services
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* Why us */}
        <section className="border-b border-white/10 bg-zinc-900/40">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="mb-12 max-w-2xl">
              <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-amber-400">
                Why Oviya Engineers
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Built for manufacturers who can&apos;t afford surprises
              </h2>
            </div>
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {highlights.map((h) => (
                <div key={h.title} className="rounded-2xl border border-white/10 bg-zinc-950/60 p-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-cyan-500/20">
                    <h.icon className="h-5 w-5 text-amber-400" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-white">{h.title}</h3>
                  <p className="text-sm text-zinc-400">{h.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Portfolio teaser */}
        <section className="border-b border-white/10 bg-gradient-to-b from-zinc-900/60 to-zinc-950">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-cyan-400">
                  Our Work
                </p>
                <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Trusted across industries
                </h2>
              </div>
              <Link
                href="/portfolio"
                className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-cyan-400 hover:text-cyan-300"
              >
                See full portfolio
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-10 grid gap-6 sm:grid-cols-3">
              {["Automotive", "Industrial Equipment", "Tooling"].map((industry, i) => (
                <div
                  key={industry}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50 p-6"
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(245,158,11,0.08),transparent_60%)] transition-opacity group-hover:opacity-150" />
                  <div className="relative">
                    <Zap className={`mb-4 h-7 w-7 ${i % 2 === 0 ? "text-amber-400" : "text-cyan-400"}`} />
                    <p className="text-lg font-semibold text-white">{industry}</p>
                    <p className="mt-1 text-sm text-zinc-400">
                      Precision parts and fabrication delivered to spec.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-transparent to-cyan-500/10" />
          <div className="relative mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to start your next job?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-zinc-400">
              Reach out with your drawings or requirements and we&apos;ll get back to you with
              a detailed quote.
            </p>
            <Link
              href="/contact"
              className="group mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-8 py-3.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-amber-500/25 transition-all hover:shadow-xl hover:shadow-amber-500/35"
            >
              Get in Touch
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
