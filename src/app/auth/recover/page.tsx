import type { Metadata } from "next";
import { StaffRecoveryForm } from "@/components/staff-recovery-form";

export const metadata: Metadata = {
  title: "Forgot User ID / Password | Oviya Engineers",
  description: "Recover your Oviya Engineers staff login.",
  robots: { index: false, follow: false },
};

/** Forgot User ID / Password, reached from Staff Login. */
export default function RecoverPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600 text-xl font-bold text-white">
            OE
          </div>
          <h1 className="text-xl font-semibold text-white">Oviya Engineers</h1>
          <p className="text-sm text-slate-400">Internal management system</p>
        </div>
        <StaffRecoveryForm />
      </div>
    </div>
  );
}
