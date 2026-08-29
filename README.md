# RFQ Copilot

RFQ Copilot is a B2B SaaS workspace for Chinese industrial exporters. Teams can import a private product catalog, analyze customer RFQs, match line items, and prepare quotations for human review.

## Stack

Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth/Postgres/Storage, SheetJS, Papa Parse, Zod and Vercel.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set these variables in `.env.local`: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Optional: `AI_GATEWAY_API_KEY` for LLM extraction, plus `RESEND_API_KEY` and `RESEND_FROM` to send quotation emails from the app. Heuristic matching still works without AI. Without Resend, the app opens the user's mail app and can mark the quote as sent.

## Supabase setup

1. Create a Supabase project and enable email/password Auth.
2. Apply the SQL files in `supabase/migrations/` with the Supabase CLI or SQL migration workflow. They create all tables, RLS policies, the private `company-documents` bucket and Storage policies.
3. Configure Auth email confirmation behavior appropriate for local testing.

The application uses a private bucket path of `{company_id}/product-imports/{uuid}/{filename}`. Database and Storage policies check the authenticated user's membership in the company.

## Sample import

Use `sample-data/industrial-products.csv` from `/products/import`. It contains 20 industrial products across Valve, Bearing, Fastener, Pump, Motor and Fitting categories.

Use `sample-data/sample-rfq.csv` from `/rfqs` to try extraction, catalog matching and quotation draft.

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

`/login`, `/signup`, `/onboarding`, `/dashboard`, `/products`, `/products/import`, `/products/[id]`, `/rfqs`, `/rfqs/[id]`, `/rfqs/[id]/quote`, `/settings`.

RFQ extraction uses a deterministic parser first. If `AI_GATEWAY_API_KEY` (or Vercel OIDC) is configured, the server can refine extraction with an LLM. Selling prices are never invented: quotation drafts copy catalog cost and stay in draft until a person fills empty prices and marks the quote ready. Ready quotes can be downloaded as a PDF and sent as an email after human review.
