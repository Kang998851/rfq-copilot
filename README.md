# RFQ Copilot

RFQ Copilot is a Phase 1 B2B SaaS foundation for Chinese industrial exporters. It provides a private company workspace where teams can upload, validate, import and maintain their product catalog.

## Stack

Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth/Postgres/Storage, SheetJS, Papa Parse, Zod and Vercel.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set these variables in `.env.local`: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Phase 1 does not require a service-role or secret key.

## Supabase setup

1. Create a Supabase project and enable email/password Auth.
2. Apply `supabase/migrations/20260829000100_initial_schema.sql` with the Supabase CLI or SQL migration workflow. The migration creates all tables, RLS policies, the private `company-documents` bucket and Storage policies.
3. Configure Auth email confirmation behavior appropriate for local testing.

The application uses a private bucket path of `{company_id}/product-imports/{uuid}/{filename}`. Database and Storage policies check the authenticated user's membership in the company.

## Sample import

Use `sample-data/industrial-products.csv` from `/products/import`. It contains 20 industrial products across Valve, Bearing, Fastener, Pump, Motor and Fitting categories.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Live RLS isolation requires a configured Supabase project and two authenticated users in separate companies. Test that each user can only select/update their own company's rows and Storage objects.

## Deployment

Import the repository into Vercel, set the environment variables (the service role key is not required by the Phase 1 browser flows), and deploy. Apply the migration to the target Supabase project before using the app.

## Routes

`/login`, `/signup`, `/onboarding`, `/dashboard`, `/products`, `/products/import`, `/products/[id]`, `/settings`.

RFQ parsing, AI extraction, quote generation, email replies and PDF quotation generation are intentionally deferred to Phase 2.
