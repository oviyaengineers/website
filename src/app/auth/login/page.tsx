import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = {
  title: "Login | Oviya Engineers",
  description: "Sign in to the Oviya Engineers internal management system.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600 text-xl font-bold text-white">
            OE
          </div>
          <h1 className="text-xl font-semibold text-white">Oviya Engineers</h1>
          <p className="text-sm text-slate-400">Internal management system</p>
        </div>
        <LoginForm redirectTo={params.redirect ?? "/dashboard"} />
      </div>
    </div>
  );
}
