import type { Metadata } from "next";
import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Cog, Drill, Flame, Layers, Ruler, Wrench } from "lucide-react";

export const metadata: Metadata = {
  title: "Services",
  description: "CNC machining, fabrication, welding, and finishing services offered by Oviya Engineers.",
};

const services = [
  { icon: Cog, title: "CNC Turning & Milling", desc: "High-precision turning and milling for complex components in a wide range of metals." },
  { icon: Flame, title: "Welding & Fabrication", desc: "Structural and precision fabrication including MIG, TIG, and arc welding." },
  { icon: Layers, title: "Sheet Metal Work", desc: "Cutting, bending, and forming for enclosures, brackets, and custom assemblies." },
  { icon: Drill, title: "Drilling & Tapping", desc: "Accurate hole-making and threading services for production and prototype parts." },
  { icon: Ruler, title: "Quality Inspection", desc: "Dimensional inspection and quality checks against customer drawings and specs." },
  { icon: Wrench, title: "Assembly Services", desc: "Sub-assembly and finishing work to deliver ready-to-use components." },
];

export default function ServicesPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <SiteNav />
      <main className="flex-1">
        <section className="border-b border-zinc-800 bg-zinc-900/40">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-amber-400">
              Services
            </p>
            <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-white">
              End-to-end manufacturing capabilities
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-zinc-400">
              From raw material to finished part, we handle machining, fabrication, and
              finishing under one roof.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s) => (
              <div key={s.title} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
                <s.icon className="mb-4 h-8 w-8 text-amber-400" />
                <h3 className="mb-2 text-lg font-semibold text-white">{s.title}</h3>
                <p className="text-sm text-zinc-400">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
