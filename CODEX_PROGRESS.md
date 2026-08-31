# RFQ Copilot Development Progress

## Current Phase
PHASE 10 QUOTE ENGINE

## PHASE 10 Quote Engine
Deterministic pricing in `lib/quote/pricing.ts` (cents rounding). No LLM math.
Methods: margin `cost / (1 - margin)`, markup `cost × (1 + markup)`, cost (margin 0), manual override
Rule order: manual > product spec margin > category margin > company default
Company rules in Settings, stored per company in this browser (`rfq-copilot-pricing:{companyId}`). No new database column
Currency: customer header if present; otherwise company default labeled Suggested Default. Never silent USD-from-product as customer currency
FX: if cost currency ≠ quote currency, unit price stays empty — rate is not invented
Customer `target_price` is displayed as reference only and is never copied into `unit_price`
Below-minimum margin blocks Mark ready
PDF / email / versioning not rewritten
Helper asserts: margin 18.9@20% = 23.63; FX blocked
Deployment: IN PROGRESS with this commit

## PHASE 9 Missing Spec Detection
Category templates: valve, pump, bearing, motor, fastener, fitting
Flags specs the customer did not provide (Size, Pressure, Material, Connection, Seat, Certification, Voltage as applicable)
Does not invent values
UI: Fill manually / Ask buyer / Ignore on each missing spec
Filled values stored in `specs.filled_specs`; that spec is removed from `missing`
Detail page also merges category gaps live, so older RFQs show Seat/Connection without re-analyze
Helper asserts: valve without details flags Seat; filled Seat is not flagged
Quote engine not rewritten
Deployment: READY `dpl_EfdzPTV1kQnfpdVTkmqgeHR1iR1Y` commit `57a468e` on https://rfq-copilot-one.vercel.app

## PHASE 8 Product Matching
Layered scoring: exact SKU, model, MPN, name, category, material, size, specification overlap, plus history boost
Top 3 candidates stored on `rfq_items.specs.match_candidates` with reason codes
Human must confirm a match before it is accepted; No match, manual catalog pick, and create-product remain
History: accepted lines boost a similar future match (+10). Does not rewrite catalog or matching rules
AI semantic matching: NOT DONE (no extra model call in this slice)
Helper asserts: exact SKU reason
Acceptance: PARTIAL PASS — deterministic ranking and Top 3 UI. Semantic AI match still open
Deployment: READY `dpl_DSrVMgXj7vny8tEBYYnHAzWMFd8p` commit `859b372` on https://rfq-copilot-one.vercel.app

## PHASE 7 REVIEW UI

## PHASE 7 Review Center
`/rfqs/[id]` now has buyer summary, source document, line items, missing info, matches, and activity
Field actions: approve / edit / mark missing / ignore, stored on `rfq_items.specs.field_reviews`
Activity: stored on `extracted_header.__activity` (no extra table; live schema already has that jsonb)
Low extract confidence (< 0.70) is highlighted and stays Needs Review until accepted
Ask Buyer copies a clarification question; does not auto-email
Matching algorithm not rewritten
Helper asserts include ignore-filter and buyer question
Deployment: with this commit

## PHASE 6 AI Extraction
Production app was still the Phase 5 deploy until this commit. Schema already applied remotely as `phase6_ai_extraction`
Schema applied remotely as `phase6_ai_extraction`
`rfqs.extracted_header` jsonb (value / confidence / source per header field)
`rfqs.extraction_status` heuristic | ai | failed
`rfq_items.requested_sku`, `target_price` (customer-stated only), `extract_confidence`
Zod `extractedSchema` + `parseExtracted`; invalid JSON is not written
AI path: one repair retry; if both fail, status=`failed` and heuristic fields are kept
Heuristic header: phone, RFQ number, currency, incoterm, delivery, deadline, payment, certification when labeled in text
`target_price` is never copied into quotation `unit_price` (quotes still use catalog cost)
UI: header card, failed banner, customer target price note, low extract-confidence highlight
OCR / matching rewrite: NOT IN THIS PHASE
Helper asserts: PASS
Acceptance: PARTIAL PASS — structured header + validation/repair path exist. Live AI Gateway extraction not proven in this environment (no forced model call)
Deployment: with this commit

## PHASE 5 Real RFQ Ingestion
Production: https://rfq-copilot-one.vercel.app — READY `dpl_5v8EydBsSdYDjTArwYtGYV8hFTCQ` commit `5a89f8a`
Schema applied remotely as `phase5_rfq_ingestion` (`supabase/migrations/20260830000300_phase5_rfq_ingestion.sql`)
`documents`: checksum, processing_status, page_count, ocr_used
`rfqs`: source_checksum, possible_duplicate_of, source_type allows `image`
`rfq_items`: source_text, source_ref
Text PDF: extracts `Tj` / `TJ` literals (`lib/rfq/pdf-text.ts`). Empty/scan PDF is `empty` — file is stored, items are not guessed, paste is required
Images: stored, not OCR'd. Analyze without paste is blocked
Checksum: SHA-256 of file bytes. Same checksum sets `possible_duplicate_of` and shows an amber banner. Duplicate is not auto-deleted
Source traces: spreadsheet `row N`, text `line N`; AI extract keeps heuristic traces via `keepSourceTraces`
OCR: NOT DONE. No new OCR service. Scans and photos still need pasted text
UI: workspace accepts images; detail shows source ref/text and duplicate link
i18n: EN/ZH keys match (`noPdfText`, `noImageText`, `invalidFile`, `duplicateHint`, `rfqDetail.source`)
Helper asserts: PASS (`node --experimental-strip-types --import ./scripts/register-ts.mjs scripts/assert-rfq-ingestion.ts`)
`npm test` / vitest: ENVIRONMENT STALL (known)
Acceptance: text PDF / spreadsheet / paste work with source traces and duplicate hint. Scanned PDF and images do not invent line items. OCR remains open
Deployment: READY `dpl_5v8EydBsSdYDjTArwYtGYV8hFTCQ` on https://rfq-copilot-one.vercel.app
Homepage smoke: PASS (200)
Runtime errors last 1h: none

## PHASE 1B SECURITY VERIFICATION

## PHASE 1B Security Verification
Production: already live at https://rfq-copilot-one.vercel.app (P4 deploy dpl_CFAUCQPKaobNrGZuS5G2pYoYovpV)
All public business tables: RLS enabled (profiles, companies, company_members, products, product_imports, documents, rfqs, rfq_items, quotations, quotation_items, quotation_sends)
Storage: `company-documents` is private; object policies require `is_company_member` on the first path folder
Security-definer triggers: only `private.handle_new_user` and `private.handle_new_company_owner` (not in public)
`is_company_member`: SECURITY INVOKER
Browser client: publishable key only; no service-role in client bundles
Supabase security advisor: WARN only — leaked password protection is off (https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
Anon role: 0 product rows before grant harden; after harden, anon has no SELECT/TRUNCATE on public tables
Non-member authenticated JWT: 0 rows on companies, products, rfqs, quotations, documents
Grant harden applied: `harden_public_grants` — authenticated limited to SELECT/INSERT/UPDATE/DELETE; TRUNCATE revoked
Two-company A/B fixture matrix: SCRIPT READY (`scripts/verify-tenant-isolation.sql`); live run incomplete (SET ROLE + temp table privilege). Throwaway users were cleaned; real profile count unchanged at 2
Auth Admin signup script: still requires `SUPABASE_SECRET_KEY` (`npm run verify:phase1b`)
Storage object A/B: NOT RUN (bucket currently empty)
Acceptance: tenant read isolation verified for anon and non-members. Cross-company member A vs member B not yet proven with two live sessions.

## PHASE 4
Quote follow-up pipeline: COMPLETE (sent quotes, 3-day reminder, overdue list, won/lost)
Follow-up email: COMPLETE (draft + human click send; never auto-send; no invented prices)
Human-in-the-loop: Outcome is marked by a person; follow-up only after the quote is sent
Schema: quotations.outcome / follow_up_due / last_followed_up_at; rfqs status won|lost
UI: `/follow-ups`, dashboard overdue counts, RFQ outcome + follow-up draft

## PHASE 3
Quotation PDF: COMPLETE (A4 document at `/rfqs/[id]/quote`, downloadable PDF stored in company documents)
Email send: COMPLETE (compose + history; free mailbox SMTP from Settings; Resend when `RESEND_API_KEY` is set; otherwise mail app + mark as sent)
Human-in-the-loop: Send requires ready quote and filled unit prices
Settings: Company quote contact name/email for letterhead
Schema: buyer_email, quotation sent status, quotation_sends with RLS

## PHASE 2
RFQ Workspace: COMPLETE (upload CSV/Excel/text, extract line items, catalog match, human review, quotation draft)
AI Extraction: OPTIONAL (server `/api/rfqs/extract` uses AI Gateway when `AI_GATEWAY_API_KEY` or Vercel OIDC is present; heuristic parser always works)
Quote prices: Human-in-the-loop (catalog cost copied, never invented; ready state requires filled prices)
Email send / PDF file: MOVED TO PHASE 3
Schema: rfqs, rfq_items, quotations, quotation_items with RLS
Sample: `sample-data/sample-rfq.csv`

## PHASE 1C
Landing Page: COMPLETE
Demo Mode: COMPLETE
Demo Product Library: COMPLETE (read-only static dataset)
Demo RFQs: COMPLETE (3 fixed sample RFQs)
Production Dashboard: EXISTING AUTHENTICATED FLOW RETAINED
Responsive: COMPLETE (responsive navigation, tables and landing layout)
SEO: COMPLETE (metadata, OpenGraph, robots, sitemap, favicon)
Privacy: COMPLETE
Terms: COMPLETE (early-stage product terms)
Vercel Build: PASS (Next.js 15.5.24 production build, 42 routes)
Production Deployment: READY (GitHub-linked Vercel project `rfq-copilot` on team Kang / kangstudio)
Production URL: https://rfq-copilot-one.vercel.app
Smoke Test: PUBLIC HTTP PASS on production aliases
Known Issues: sitemap/robots still reference rfq-copilot.vercel.app; Phase 1B remains paused
GitHub Repository: https://github.com/Kang998851/rfq-copilot

## PHASE 1C Production Deployment
Vercel Authentication: PASS (Vercel MCP + GitHub Login Connection)
Vercel Project: rfq-copilot (prj_5XRFGYyEOmM2fRKoL9BDm8aDw3or) on Kang / kangstudio, linked to Kang998851/rfq-copilot
Production Environment: PASS — NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY present; redeploy dpl_2zmJR29TCHC7fXQPe6RhQymL3YQL inlined them at build time (no secret keys added)
Production Build: PASS (Vercel Node 24.x; latest READY dpl_2zmJR29TCHC7fXQPe6RhQymL3YQL)
Deployment Status: READY
Production URL: https://rfq-copilot-one.vercel.app
Homepage: PASS (200)
Demo: PASS (200)
Demo Products: PASS (200, including /demo/products/VLV-001)
Demo RFQs: PASS (200, including /demo/rfqs/RFQ-2026-001)
Login: PASS (200)
Private Route Protection: PASS — unauthenticated HTML is a generic shell with no company records; client JS redirects to /login (HTTP 200, not 302)
Privacy: PASS (200)
Terms: PASS (200)
Robots: PASS (200)
Sitemap: PASS (200)
404: PASS (404)
Responsive: HTML includes desktop/mobile nav breakpoints; live viewport check not completed (browser MCP unavailable)
Supabase Production Connection: PASS — login bundle contains project URL and publishable key prefix; Auth health 200 with production Origin CORS; no Vercel runtime errors in last 2h
Known Issues: sitemap/robots hardcoded to https://rfq-copilot.vercel.app while live host is https://rfq-copilot-one.vercel.app

## PHASE 1C Verification
- Node: PASS (v24.20.0)
- npm: PASS (11.16.0 under Node 24 runtime)
- Next.js: PASS (15.5.24)
- TypeScript: PASS (5.7.2)
- Clean install: PASS (`npm ci`, package-lock retained)
- TypeScript: PASS (`npm run typecheck`)
- ESLint: PASS (0 errors, 2 existing warnings in ImportWizard)
- Tests: PASS (5 passed, 0 failed, 5 total)
- Production build: PASS (`npm run build`; 42 routes generated)
- Local production smoke: PASS (all requested public/private route responses verified; unknown route returns 404)
- npm audit: 1 critical, 2 high, 5 moderate, 13 low (development-inclusive)
- npm audit --omit=dev: 1 high, 1 moderate; transitive production dependencies, no force fix used

## Toolchain Snapshot
- Initial `node -v`: v26.3.1
- Initial `npm -v`: 11.16.0
- Initial `npx next --version`: command stalled after npm/node output; local `next --version`: 15.5.7
- Initial `npx tsc --version`: command stalled in the combined probe; local `tsc --version`: 5.7.2
- nvm: NOT INSTALLED
- Node 24 verification runtime: v24.20.0
- npm 24-runtime verification: v11.19.0
- PHASE 1A.1 exact versions: Next 15.5.24, xlsx 0.20.3, postcss 8.4.31 (Next nested) / 8.5.26 (project tree), sharp 0.35.4

## Current Status
PHASE 10 PARTIAL PASS — deterministic margin/markup quote prices from catalog cost. Pricing rules are browser-local. Deploying with this commit.

## Completed
- Project scaffold with Next.js App Router, TypeScript and Tailwind CSS
- Supabase browser client and typed data layer
- Login, signup and company onboarding UI
- Dashboard, Product Library, product search, status toggle and edit flow
- CSV/XLS/XLSX upload, preview, automatic mapping, validation and import wizard
- Initial schema migration with RLS and private Storage bucket policies
- Sample industrial product CSV with 20 rows
- Unit tests for import normalization, mapping, validation and currency fallback
- Security dependency hardening: official SheetJS 0.20.3 tarball and patched Next 15.5.24
- CSV/XLSX/XLS parsing tests pass
- Dedicated Supabase project connected and migrations applied
- Auth profile trigger corrected using a private, restricted trigger function
- Created server-side-only `scripts/verify-phase1b.ts`; admin client is limited to fixture user create/delete, all authorization checks use publishable-key user sessions

## Currently Working On
- Deploying Phase 10 quote engine

## Remaining
- PDF (Master Prompt item 9; already exists, do not rebuild)
- OCR for scans and photos (must not invent text; paste remains the fallback)
- Complete two-company A/B isolation (`scripts/verify-tenant-isolation.sql` or `npm run verify:phase1b`) if a secret key is provided
- Verify the sample CSV end-to-end through the browser flow

## Tests
- import logic: PASS (5 passed, 0 failed, 5 total) — last full vitest run before this slice
- RFQ ingestion helper: PASS (text PDF, empty/invalid PDF, checksum, spreadsheet/text source refs, image does not invent text, AI source merge, i18n keys)
- vitest `tests/rfq.test.ts`: NOT RUN this slice — `npm test` stalls in this environment
- Auth/RLS/Storage two-user matrix: NOT VERIFIED (temporary test email rejected and signup rate-limited)
- Phase 1B verification script: NOT RUN — `SUPABASE_SECRET_KEY` absent from environment

## Build
- Node: PASS (v24.20.0; `.nvmrc` and package engines added)
- Clean install: PASS (`npm ci`, lockfile retained)
- TypeScript: PASS (`npx tsc --noEmit`)
- Lint: PASS (0 errors, 2 unused-variable warnings in ImportWizard)
- Production Build: PASS (default Next production build, 11 routes generated)
- Turbopack: FAIL / ENVIRONMENT STALL (cannot create process/bind port in sandbox)
- Webpack fallback: NOT AVAILABLE (Next 15.5.24 reports `--webpack` as unknown option; default build passed)

## Database
- Migrations: initial schema migration created
- RLS: implemented for all application tables and Storage objects; NOT VERIFIED against live project
- Storage: private `company-documents` bucket declared in migration
- `.env.local`: PRESENT with URL and publishable key; values never printed or recorded
- Supabase project: CONNECTED to dedicated `rfq-copilot`, ref `srpdshwdhaihymjluxuk`, region `ap-northeast-1`, status `ACTIVE_HEALTHY`
- Migration: applied and listed remotely as `initial_schema` and `fix_auth_profile_trigger`
- Live tables: all six present with RLS enabled
- Live Storage: `company-documents` exists and is private
- Supabase security advisors: no security lints; performance info notes unindexed foreign keys
- Auth isolation: NOT VERIFIED; signup test blocked by Supabase invalid test-email response and email rate limit

## Security Audit
- `npm audit` after non-force fix: 9 total — 1 critical, 2 high, 4 moderate, 2 low
- `npm audit --omit=dev`: 3 total — 1 high and 2 moderate, transitive Next/PostCSS findings; xlsx and sharp are absent
- No `npm audit fix --force` used

## Known Issues
- Turbopack cannot bind a port/create a process in this sandbox; panic log: `/var/folders/f6/zv0lpszj1l3d_p057tpyxcww0000gn/T/next-panic-a8ab9e9777c03c4b6aba7cea4fc49dc8.log`
- Production PostCSS advisory remains transitive under Next 15.5.24; audit recommends Next 16.3.3, which is a breaking major upgrade and was not applied. sharp was upgraded to 0.35.4 via non-force audit fix.

## Decisions
- Client-side spreadsheet parsing keeps original files out of the server and uses the Supabase publishable key only
- Duplicate products use the `(company_id, sku)` unique constraint and upsert strategy

## Files Changed
- Application scaffold, app routes, components, import libraries, migration, sample data, tests, README

## Next Action
- After this deploy: Master Prompt item 9 PDF (already exists; do not rebuild)
- Optional leftover: two-company A/B if `SUPABASE_SECRET_KEY` is provided
