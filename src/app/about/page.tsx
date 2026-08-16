import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/marketing/site-nav";
import { SiteFooter } from "@/components/marketing/site-footer";
import { ArrowRight, Target, Users, Wrench } from "lucide-react";
import { GridGlow } from "@/components/marketing/decor";

export const metadata: Metadata = {
  title: "About Us",
  description: "Learn about Oviya Engineers, our mission, values, and manufacturing capabilities.",
};

const values = [
  {
    icon: Target,
    title: "Precision First",
    desc: "Every job is machined and inspected to exact customer specifications, with no shortcuts.",
    accent: "amber" as const,
  },
  {
    icon: Users,
    title: "Customer Partnership",
    desc: "We work closely with clients from drawing review through delivery to ensure zero surprises.",
    accent: "cyan" as const,
  },
  {
    icon: Wrench,
    title: "Skilled Craftsmanship",
    desc: "Our team combines decades of hands-on machining experience with modern process discipline.",
    accent: "amber" as const,
  },
];

const timeline = [
  { year: "Founded", desc: "Started as a small precision turning job-shop." },
  { year: "Grew", desc: "Expanded into welding, fabrication, and sheet metal work." },
  { year: "Scaled", desc: "Built long-term partnerships with manufacturers across industries." },
  { year: "Today", desc: "A full-service job-shop trusted for quality and dependable delivery." },
];

export default function AboutPage() {
  return (
    <div className="flex flex-1 flex-col bg-zinc-950 text-zinc-100">
      <SiteNav />
      <main className="flex-1">
        <section className="relative overflow-hidden border-b border-white/10">
          <GridGlow />
          <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-amber-400">
              About Us
            </p>
            <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              A job-shop built on{" "}
              <span className="bg-gradient-to-r from-amber-300 to-cyan-400 bg-clip-text text-transparent">
                precision and trust
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-zinc-400">
              Oviya Engineers provides precision machining and fabrication services for
              manufacturers who need dependable quality and delivery. From prototypes to
              production runs, we treat every job with the same rigor.
            </p>
          </div>
        </section>

        <section className="border-b border-white/10 bg-zinc-900/40">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="mb-12 max-w-2xl">
              <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-cyan-400">
                What We Stand For
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Values that show up in every job
              </h2>
            </div>
            <div className="grid gap-8 sm:grid-cols-3">
              {values.map((v) => (
                <div
                  key={v.title}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/60 p-6 transition-colors hover:border-white/20"
                >
                  <div
                    className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${
                      v.accent === "amber" ? "bg-amber-500/15" : "bg-cyan-500/15"
                    }`}
                  >
                    <v.icon className={`h-5 w-5 ${v.accent === "amber" ? "text-amber-400" : "text-cyan-400"}`} />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-white">{v.title}</h3>
                  <p className="text-sm text-zinc-400">{v.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-white/10">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="mb-12 max-w-2xl">
              <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-amber-400">
                Our Journey
              </p>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                From job-shop to full-service partner
              </h2>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {timeline.map((t, i) => (
                <div key={t.year} className="relative rounded-2xl border border-white/10 bg-zinc-900/50 p-6">
                  <span
                    className={`text-3xl font-extrabold ${
                      i % 2 === 0 ? "text-amber-400" : "text-cyan-400"
                    }`}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="mt-3 font-semibold text-white">{t.year}</p>
                  <p className="mt-1 text-sm text-zinc-400">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-transparent to-cyan-500/10" />
          <div className="relative mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Want to work with a team that gets it right?
            </h2>
            <Link
              href="/contact"
              className="group mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-8 py-3.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-amber-500/25 transition-all hover:shadow-xl hover:shadow-amber-500/35"
            >
              Start a Conversation
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
