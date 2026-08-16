# Oviya Engineers — Internal Operations System

A Next.js app for Oviya Engineers combining a public marketing site with an
internal dashboard for managing customers, delivery challans (DCs),
invoices/billing, and job costing. Built with Next.js App Router, Supabase
(Postgres + Auth + RLS), Tailwind CSS, and shadcn/ui components.

## Features

- **Public site**: Home, About, Services, Portfolio, Contact — dark
  industrial aesthetic, SEO metadata, server components.
- **Dashboard** (auth required): metrics overview, revenue vs. cost chart
  (admin only).
- **Customers**: CRUD with search.
- **Delivery Challans (DC)**: create/edit with dynamic item rows, auto DC
  numbering via a Postgres RPC, status flow Draft → Dispatched → Delivered,
  dedicated A4 print view, and PDF download (`@react-pdf/renderer`).
- **Invoices**: create/edit with line items, optional pull of items from a
  linked DC, auto GST/discount/grand-total calculation, payment status
  tracking, A4 print + PDF download, and an admin-only Outstanding Payments
  report.
- **Job Costs**: log material, machine hours × rate, labor, tooling, and
  overhead per job, optionally linked to a DC or invoice (`total_cost` is a
  Postgres generated column).
- **Roles**: `admin` and `staff` profiles, enforced both in the UI and via
  Postgres Row Level Security policies.

## Tech stack

- Next.js 16 (App Router, Turbopack, Server Actions)
- Supabase (Postgres, Auth, RLS) via `@supabase/ssr`
- Tailwind CSS v4 + shadcn/ui (base-ui primitives)
- recharts (revenue vs. cost chart)
- @react-pdf/renderer (PDF generation for DCs and invoices)

## Prerequisites

- Node.js 20+
- A free [Supabase](https://supabase.com) account/project
- The [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) (optional, for running migrations locally or against a hosted project)

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Note down, from **Project Settings → API**:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep secret; only used server-side)

## 2. Run the database migrations

Migrations live in `supabase/migrations/` and must be applied in order:

1. `0001_initial_schema.sql` — tables: `profiles`, `customers`,
   `delivery_challans`, `delivery_challan_items`, `invoices`,
   `invoice_items`, `job_costs`.
2. `0002_rls_and_triggers.sql` — Row Level Security policies (admin vs.
   staff) and `updated_at` triggers.
3. `0003_rpc_functions.sql` — `generate_dc_number()`,
   `generate_invoice_number()`, `is_admin()`, plus grants.

Apply them with the Supabase CLI:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

Or paste each file's contents into the Supabase Dashboard's **SQL Editor**
and run them in order (0001 → 0002 → 0003).

## 3. Configure environment variables

Copy the example file and fill in your project's values:

```bash
cp .env.local.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`.env.local` is gitignored — never commit real credentials.

## 4. Install dependencies and run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the public site, and
[http://localhost:3000/auth/login](http://localhost:3000/auth/login) for the
staff dashboard.

## 5. Create your first admin user

The `profiles` table is populated automatically for new signups (see the
trigger in `0002_rls_and_triggers.sql`), defaulting new users to the `staff`
role. To create the first admin:

1. Sign up a user — either through the app's login page (if a sign-up flow
   is enabled) or by creating one directly in **Supabase Dashboard →
   Authentication → Users → Add user**.
2. In the Supabase **SQL Editor**, promote that user to admin:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = '<the-user-uuid-from-auth.users>';
   ```

3. Log in at `/auth/login` with that account — the sidebar and dashboard
   will now show admin-only views (Costs, Reports, profitability chart).

## 6. Deploying to Vercel

1. Push this repository to GitHub/GitLab/Bitbucket.
2. In [Vercel](https://vercel.com), **New Project** → import the repo.
3. Add the same three environment variables from step 3 in **Project
   Settings → Environment Variables** (for Production, Preview, and
   Development as needed).
4. Deploy. Vercel will run `next build` automatically.
5. In Supabase **Authentication → URL Configuration**, add your Vercel
   deployment URL(s) to the allowed redirect URLs/site URL so auth works in
   production.

## Project structure

```
src/
  app/
    (public)                     -> /, /about, /services, /portfolio, /contact
    auth/login/                  -> staff login
    dashboard/
      layout.tsx                 -> sidebar shell (auth-gated)
      page.tsx                   -> metrics overview
      customers/                 -> customer CRUD
      dc/                        -> delivery challans (list/new/[id]/edit/print)
      invoices/                  -> invoices (list/new/[id]/edit/print)
      costs/                     -> job cost logging
      reports/outstanding/       -> admin-only outstanding payments report
  components/                    -> shared UI (forms, tables, item-row editors, ui/*)
  lib/
    actions/                     -> Server Actions (auth, customers, dc, invoices, costs)
    pdf/                         -> @react-pdf/renderer documents for DC/invoice
    supabase/                    -> client/server/middleware Supabase clients
  types/database.ts              -> hand-written Supabase Database types
supabase/migrations/             -> SQL migrations (schema, RLS, RPCs)
```

## Notes

- No live Supabase credentials are included in this repo — all env vars are
  placeholders until you complete steps 1–3 above.
- Print views (`/dashboard/dc/[id]/print`, `/dashboard/invoices/[id]/print`)
  render an A4-formatted document with `Print` (browser print dialog) and
  `Download PDF` (client-side PDF generation) actions.
