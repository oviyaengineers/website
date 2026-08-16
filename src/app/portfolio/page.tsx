import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { ArrowRight, Factory } from "lucide-react";
import { GridGlow } from "@/components/marketing/decor";

export const metadata: Metadata = {
  title: "Portfolio",
  description: "A look at the industries and project types Oviya Engineers has delivered for.",
};

const projects = [
  { title: "Automotive Component Batch", industry: "Automotive", desc: "High-volume CNC-turned components with tight tolerance and finish requirements.", accent: "amber" as const },
  { title: "Industrial Enclosure Fabrication", industry: "Industrial Equipment", desc: "Sheet metal fabrication and welding for custom control panel enclosures.", accent: "cyan" as const },
  { title: "Machine Tooling Prototypes", industry: "Tooling", desc: "Rapid prototyping of jigs and fixtures for a mid-size manufacturing client.", accent: "amber" as const },
  { title: "Structural Steel Brackets", industry: "Construction", desc: "Fabricated and finished structural brackets for site installation.", accent: "cyan" as const },
  { title: "Precision Shaft Machining", industry: "Machinery", desc: "Turned and ground shafts to sub-millimeter tolerances for rotating equipment.", accent: "amber" as const },
  { title: "Custom Assembly Line Parts", industry: "Manufacturing", desc: "Mixed-lot machining and assembly support for an OEM production line.", accent: "cyan" as const },
];

export default function PortfolioPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <SiteNav />
      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-white/10">
          <GridGlow />
          <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-amber-400">
              Portfolio
            </p>
            <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Work across{" "}
              <span className="bg-gradient-to-r from-amber-300 to-cyan-400 bg-clip-text text-transparent">
                industries
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-zinc-400">
              A sample of the project types we support for our manufacturing partners.
            </p>
          </div>
        </section>

        <section className="border-b border-white/10 bg-zinc-900/40">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <div
                  key={p.title}
                  className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/60 p-6 shadow-lg shadow-black/20 transition-all hover:-translate-y-1 ${
                    p.accent === "amber"
                      ? "hover:border-amber-500/40 hover:shadow-amber-500/10"
                      : "hover:border-cyan-500/40 hover:shadow-cyan-500/10"
                  }`}
                >
                  <div
                    className={`mb-4 flex h-32 items-center justify-center overflow-hidden rounded-xl border border-white/10 ${
                      p.accent === "amber"
                        ? "bg-gradient-to-br from-amber-500/15 via-zinc-900 to-zinc-900"
                        : "bg-gradient-to-br from-cyan-500/15 via-zinc-900 to-zinc-900"
                    }`}
                  >
                    <Factory
                      className={`h-10 w-10 ${p.accent === "amber" ? "text-amber-400/80" : "text-cyan-400/80"}`}
                    />
                  </div>
                  <p
                    className={`mb-1 text-xs font-semibold uppercase tracking-wide ${
                      p.accent === "amber" ? "text-amber-400" : "text-cyan-400"
                    }`}
                  >
                    {p.industry}
                  </p>
                  <h3 className="mb-2 text-lg font-semibold text-white">{p.title}</h3>
                  <p className="text-sm text-zinc-400">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-transparent to-cyan-500/10" />
          <div className="relative mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Got a project like these?
            </h2>
            <Link
              href="/contact"
              className="group mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-8 py-3.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-amber-500/25 transition-all hover:shadow-xl hover:shadow-amber-500/35"
            >
              Let&apos;s Talk
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
