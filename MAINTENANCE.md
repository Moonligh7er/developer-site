# MAINTENANCE

Dated data files, external dependencies, and review cadence for this site.

**The rule:** every value below has a source URL and a review cadence. If a value hasn't been checked within its cadence, a tool built on top of it is quietly rotting. Set a reminder — this is the 15-minute-per-quarter ritual that keeps the accuracy promise real.

Last full audit: **2026-09-05**.

---

## Dated JSON data files

### `tools/tax-data-2026.json` — Federal income tax
**Used by:** `tools/paycheck-calculator.html`, `tools/freelancer-tax-calculator.html`, `tools/freelance-rate-calculator.html`
**Cadence:** annual (November/December for next tax year)
**Sources:**
- Brackets & standard deduction: [IRS Rev. Proc. 2025-32](https://www.irs.gov/pub/irs-drop/rp-25-32.pdf) (or the current-year revenue procedure)
- FICA rates & SS wage base: [SSA Cost-of-Living Adjustment announcement](https://www.ssa.gov/cola/) (typically October)
**When to update:**
- Late October: SSA announces the following year's Social Security wage base.
- November/December: IRS publishes annual Revenue Procedure with brackets + std deduction.
- Rename the file (`tax-data-2027.json`) and update the constant reference in each consumer HTML file (search `TAX_DATA` or the year-in-filename).

### `tools/llm-pricing.json` — LLM API pricing (32 models)
**Used by:** `tools/llm-cost-calculator.html`
**Cadence:** **quarterly** (LLM pricing shifts monthly; quarterly is the minimum honest refresh)
**Sources (per-entry URLs in the file):**
- Anthropic: <https://claude.com/pricing>
- OpenAI: <https://developers.openai.com/api/docs/pricing>
- Google: <https://ai.google.dev/gemini-api/docs/pricing>
- DeepSeek: <https://api-docs.deepseek.com/quick_start/pricing/>
- xAI: <https://docs.x.ai/docs/models>
**When to update:**
- Every 3 months, fetch each provider page, diff against `models[]` entries.
- Update `retrieved` field to today's date.
- Add new models with new IDs; deprecate models the provider removes.
- Watch for promotional pricing (Google 3.7/3.8 Flash, OpenAI 5.6 Sol) that expires — update the `notes` field to flag expiration dates.

### `tools/solar-defaults.json` — State peak-sun-hours, electricity rates, federal credit status
**Used by:** `tools/solar-savings-estimator.html`
**Cadence:** annual (spring — after EIA publishes prior-year state averages)
**Sources:**
- Peak sun hours: [NREL Solar Resource Maps](https://www.nrel.gov/gis/solar-resource-maps.html) — state averages don't shift year-to-year meaningfully; the annual check is the electricity rate.
- Electricity rates: [EIA Electric Power Monthly](https://www.eia.gov/electricity/monthly/) — Table 5.6.A, "Average Price of Electricity to Ultimate Customers by End-Use Sector".
- Federal credit status: [IRS Residential Clean Energy Credit page](https://www.irs.gov/credits-deductions/residential-clean-energy-credit).
**Critical watch item — federal credit:**
- Section 25D was **terminated for property placed in service after 2025-12-31** by OBBBA (2025). Current default is `federal_credit_pct_2026: 0`.
- **If Congress restores or amends this credit**, update `federal_credit_pct_2026` and `federal_credit_note` immediately — the tool's federal alert banner reads from these fields.
- State/utility incentives are NOT maintained in this file; the tool links to DSIRE.

### (implicit) `tools/paycheck-calculator.html` inline `TAX_DATA` constant
**Cadence:** annual, in lockstep with `tax-data-2026.json`
**Note:** this file duplicates the 2026 constants inline (for zero-dependency reliability). When the JSON is renamed for 2027, update the inline constant AND the header comment referencing it. The paycheck calculator has three documented end-to-end test cases (T1/T2/T3) with hand-computed take-home values — re-run those after any tax data change.

---

## Live external APIs

### Frankfurter (currency rates)
**Used by:** `tools/currency-converter.html`
**Endpoint:** `https://api.frankfurter.dev/v1/latest`
**Cadence:** quarterly — check that the endpoint is up and the response schema hasn't changed.
**Fallback:** the tool caches rates in `localStorage` for offline fallback (see cache header at top of currency-converter.html). If Frankfurter goes down, users get last-known rates with an "offline / cached" badge.
**Alternatives if Frankfurter is discontinued:** ExchangeRate-API (free tier requires signup), Fixer.io (paid), ECB direct XML feed (no CORS).

---

## Third-party libraries (self-hosted per house rule)

### `tools/lib/qrcode-generator.js` + `LICENSE-qrcode-generator.txt`
**Package:** [kazuhikoarase/qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT)
**Used by:** `tools/qr-code-generator.html`
**Cadence:** none required (library is stable, no security surface — pure client-side QR encoding)

### (planned) `tools/lib/` OpenAI tokenizer
**Not currently shipped.** `tools/llm-cost-calculator.html` uses per-family chars-per-token heuristics with clear "estimate" labeling. If byte-exact OpenAI counts become important, options are `js-tiktoken` (pure JS, ~500KB for cl100k) or `@dqbd/tiktoken` (WASM, ~400KB). Ship self-hosted with license file per house rule.

---

## Content that references dated legislation or IRS rules

Any tool that describes tax rules, credits, or legal thresholds inline in its SEO content section can go stale. Search for these when doing an annual audit:

- `tools/paycheck-calculator.html` — 2026 brackets, FICA, SS wage base
- `tools/freelancer-tax-calculator.html` — SE tax rates, quarterly estimated tax due dates
- `tools/freelance-rate-calculator.html` — 2026 constants inline in JS; mirrors paycheck calc
- `tools/solar-savings-estimator.html` — **§25D federal credit termination reference**; if credit is restored, update the SEO content section too
- `tools/auto-insurance-coverage-calculator.html` — state minimum liability requirements (do change; audit annually)
- `tools/mortgage-calculator.html` / `tools/rent-vs-buy-calculator.html` — if referencing specific loan-limit thresholds or property-tax typical ranges

**Grep helper:** `grep -rn "2026\|IRS\|IRC \S25\|OBBBA" tools/`

---

## The 15-minute quarterly ritual

1. Open `MAINTENANCE.md` (this file). Read the top.
2. Check each quarterly-cadence item's source URL — has anything moved or changed shape?
3. For `llm-pricing.json`: diff at least 2 provider pages against current entries. Full 5-provider audit at least twice a year.
4. For `currency-converter.html`: hit the Frankfurter endpoint in browser DevTools, confirm 200 + schema unchanged.
5. Update `retrieved` dates on any JSON files you touched.
6. Commit: `chore(maintenance): quarterly data-freshness audit YYYY-QN`.

## The annual ritual (November/December)

1. Watch for IRS Revenue Procedure release (typically mid-November for the following tax year).
2. Rename `tax-data-2026.json` → `tax-data-{next-year}.json`, update constants.
3. Update inline `TAX_DATA` in `tools/paycheck-calculator.html`, `tools/freelance-rate-calculator.html`.
4. Re-run the documented T1/T2/T3 test cases in `paycheck-calculator.html` — verify take-home values match hand-computed math for the new brackets.
5. Update the year in any `<title>` tags, `<h1>` tags, or copy that names the year explicitly.
6. Check the federal solar credit status (Section 25D) — if Congress has restored/amended it, update `solar-defaults.json` and the SEO content in `solar-savings-estimator.html`.
7. Refresh EIA electricity rates in `solar-defaults.json` (spring is fine if December is busy — EIA data lags anyway).
8. Commit: `chore(maintenance): annual tax data + federal credit audit YYYY`.

---

## Ownership

Solo — maintained by Michael Wylde (moonligh7er). If handing off, this document is the source of truth; do not trust an LLM's summary of pricing/tax/credit state without verifying against the source URLs listed here.
