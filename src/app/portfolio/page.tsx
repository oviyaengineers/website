import type { Metadata } from "next";
import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Factory } from "lucide-react";

export const metadata: Metadata = {
  title: "Portfolio",
  description: "A look at the industries and project types Oviya Engineers has delivered for.",
};

const projects = [
  { title: "Automotive Component Batch", industry: "Automotive", desc: "High-volume CNC-turned components with tight tolerance and finish requirements." },
  { title: "Industrial Enclosure Fabrication", industry: "Industrial Equipment", desc: "Sheet metal fabrication and welding for custom control panel enclosures." },
  { title: "Machine Tooling Prototypes", industry: "Tooling", desc: "Rapid prototyping of jigs and fixtures for a mid-size manufacturing client." },
  { title: "Structural Steel Brackets", industry: "Construction", desc: "Fabricated and finished structural brackets for site installation." },
  { title: "Precision Shaft Machining", industry: "Machinery", desc: "Turned and ground shafts to sub-millimeter tolerances for rotating equipment." },
  { title: "Custom Assembly Line Parts", industry: "Manufacturing", desc: "Mixed-lot machining and assembly support for an OEM production line." },
];

export default function PortfolioPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <SiteNav />
      <main className="flex-1">
        <section className="border-b border-zinc-800 bg-zinc-900/40">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-amber-400">
              Portfolio
            </p>
            <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-white">
              Work across industries
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-zinc-400">
              A sample of the project types we support for our manufacturing partners.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <div key={p.title} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
                <div className="mb-4 flex h-32 items-center justify-center rounded-md bg-zinc-800/60">
                  <Factory className="h-10 w-10 text-amber-400/70" />
                </div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-400">
                  {p.industry}
                </p>
                <h3 className="mb-2 text-lg font-semibold text-white">{p.title}</h3>
                <p className="text-sm text-zinc-400">{p.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
