import type { Metadata } from "next";
import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { Target, Users, Wrench } from "lucide-react";

export const metadata: Metadata = {
  title: "About Us",
  description: "Learn about Oviya Engineers, our mission, values, and manufacturing capabilities.",
};

const values = [
  {
    icon: Target,
    title: "Precision First",
    desc: "Every job is machined and inspected to exact customer specifications, with no shortcuts.",
  },
  {
    icon: Users,
    title: "Customer Partnership",
    desc: "We work closely with clients from drawing review through delivery to ensure zero surprises.",
  },
  {
    icon: Wrench,
    title: "Skilled Craftsmanship",
    desc: "Our team combines decades of hands-on machining experience with modern process discipline.",
  },
];

export default function AboutPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <SiteNav />
      <main className="flex-1">
        <section className="border-b border-zinc-800 bg-zinc-900/40">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-amber-400">
              About Us
            </p>
            <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-white">
              A job-shop built on precision and trust
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-zinc-400">
              Oviya Engineers provides precision machining and fabrication services for
              manufacturers who need dependable quality and delivery. From prototypes to
              production runs, we treat every job with the same rigor.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-8 sm:grid-cols-3">
            {values.map((v) => (
              <div key={v.title} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
                <v.icon className="mb-4 h-8 w-8 text-amber-400" />
                <h3 className="mb-2 text-lg font-semibold text-white">{v.title}</h3>
                <p className="text-sm text-zinc-400">{v.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
