import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-800 bg-zinc-950 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 text-sm text-zinc-400 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>&copy; {new Date().getFullYear()} Oviya Engineers. All rights reserved.</p>
        <div className="flex gap-6">
          <Link href="/about" className="hover:text-amber-400">
            About
          </Link>
          <Link href="/services" className="hover:text-amber-400">
            Services
          </Link>
          <Link href="/contact" className="hover:text-amber-400">
            Contact
          </Link>
          <Link href="/auth/login" className="hover:text-amber-400">
            Staff Login
          </Link>
        </div>
      </div>
    </footer>
  );
}
