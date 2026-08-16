import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { LogoMark } from "./logo";

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-zinc-950">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <LogoMark className="h-8 w-8 shrink-0" />
              <span className="text-base font-bold text-white">Oviya Engineers</span>
            </div>
            <p className="mt-3 text-sm text-zinc-400">
              Precision machining and fabrication for manufacturers who need dependable
              quality and delivery.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-white">Company</p>
            <div className="mt-3 flex flex-col gap-2 text-sm text-zinc-400">
              <Link href="/about" className="w-fit transition-colors hover:text-amber-400">
                About
              </Link>
              <Link href="/services" className="w-fit transition-colors hover:text-amber-400">
                Services
              </Link>
              <Link href="/portfolio" className="w-fit transition-colors hover:text-amber-400">
                Portfolio
              </Link>
              <Link href="/contact" className="w-fit transition-colors hover:text-amber-400">
                Contact
              </Link>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-white">Get in touch</p>
            <div className="mt-3 flex flex-col gap-2.5 text-sm text-zinc-400">
              <span className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-cyan-400" /> +91 00000 00000
              </span>
              <span className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-cyan-400" /> info@oviyaengineers.com
              </span>
              <span className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" /> Industrial Estate,
                Tamil Nadu, India
              </span>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-white">Access</p>
            <div className="mt-3 flex flex-col gap-2 text-sm text-zinc-400">
              <Link href="/auth/login" className="w-fit transition-colors hover:text-amber-400">
                Staff Login
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Oviya Engineers. All rights reserved.</p>
          <p>Engineered to spec. Delivered on time.</p>
        </div>
      </div>
    </footer>
  );
}
