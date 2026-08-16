"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, ArrowRight } from "lucide-react";

const links = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/contact", label: "Contact" },
];

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-zinc-950/80 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-sm font-extrabold text-zinc-950 shadow-lg shadow-amber-500/25 transition-transform group-hover:scale-105">
            OE
          </div>
          <span className="text-lg font-bold tracking-tight text-white">
            Oviya Engineers
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`relative text-sm font-medium transition-colors hover:text-amber-400 ${
                pathname === link.href ? "text-amber-400" : "text-zinc-300"
              }`}
            >
              {link.label}
              {pathname === link.href && (
                <span className="absolute -bottom-[21px] left-0 right-0 h-0.5 bg-gradient-to-r from-amber-400 to-cyan-400" />
              )}
            </Link>
          ))}
          <Link
            href="/contact"
            className="group inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-5 py-2 text-sm font-semibold text-zinc-950 shadow-md shadow-amber-500/20 transition-all hover:shadow-lg hover:shadow-amber-500/30"
          >
            Get a Quote
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </nav>

        <button
          className="text-zinc-300 md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <nav className="flex flex-col gap-1 border-t border-white/10 bg-zinc-950 px-4 py-3 md:hidden">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                pathname === link.href
                  ? "bg-white/5 text-amber-400"
                  : "text-zinc-300"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/contact"
            onClick={() => setOpen(false)}
            className="mt-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-2 text-center text-sm font-semibold text-zinc-950"
          >
            Get a Quote
          </Link>
          <Link
            href="/auth/login"
            onClick={() => setOpen(false)}
            className="mt-1 rounded-md px-3 py-2 text-center text-sm font-medium text-zinc-400"
          >
            Staff Login
          </Link>
        </nav>
      )}
    </header>
  );
}
