# Claude Code — Batch A: AI provider abstraction + read-only tools

You are adding a conversational AI booking assistant to the existing Grace Nails
production system. This batch covers **Phases 1–3 only**. Stop at the end and wait
for review. Do not build UI. Do not build booking.

The full specification is in the repo docs as the AI build spec. Read it, but this
document overrides it where they disagree.

---

## Before you write any code

1. Read `README.md`.
2. Read `docs/spabookingbuildspec2.md`.
3. Read the handoff.
4. Read the AI build specification.
5. Inspect, without editing:
   - `lib/availability.ts` — the slot algorithm
   - `lib/booking.ts` — write path, cancel, reschedule, erase
   - `lib/db.ts` — pool and transaction handling
   - `lib/public-data.ts` — including `hasDemoData()`
   - `lib/site.ts`, `lib/time.ts`, `lib/health.ts`
   - existing service / staff / business data access
   - existing API routes under `app/api/`
   - `tests/`
6. Run the full existing test suite. **Confirm the baseline is green — 92 booking
   tests and 13 v2 acceptance tests — and report the result before continuing.**
   If it is not green, stop and say so.

Do not modify anything in `lib/` that already exists. If you believe an existing
file must change, stop and explain why instead of changing it.

---

## What this batch delivers

```
lib/ai/
  types.ts          shared types
  provider.ts       AIProvider interface
  gemini.ts         GeminiProvider implementation
  system-prompt.ts  prompt construction (see rules below)
  tools.ts          the four read-only tools
  validation.ts     strict argument validation

tests/ai/
  provider.test.ts
  tools.test.ts
  prompt.test.ts
```

No API route. No React components. No booking tool.

---

## Provider abstraction

The application depends on an internal interface, never on Gemini directly:

```
AIProvider
  generateResponse()
  generateToolCall()
  supportsToolCalling()
```

`GeminiProvider implements AIProvider`. Model name comes from an environment
variable, never a literal in code.

```
AI_PROVIDER=gemini
AI_MODEL=
GEMINI_API_KEY=
```

Server-side only. Never `NEXT_PUBLIC_`. Never expose the key to the browser.

Handle and test: missing key, invalid key, timeout, provider rate limit,
malformed response, provider unavailable. Every failure must be recoverable —
no retry storms, no unbounded loops, bounded timeouts throughout.

---

## The four read-only tools

1. `get_business_info` — name, address, phone, opening hours, website
2. `get_services` — id, name, duration, price, active, resource requirement, description
3. `get_staff` — name, active, services performed. **Nothing else.**
4. `check_availability` — calls `lib/availability.ts`

Rules that apply to all four:

- Read from the existing data layer. Never build a parallel catalogue, and never
  put prices, hours, treatments or staff names in the system prompt.
- `check_availability` **calls the existing availability engine**. Do not write a
  second slot algorithm, do not reimplement any part of it, do not "adapt" it.
- Validate every argument server-side before use. Model-generated IDs, dates and
  times are untrusted input. Reject anything malformed.
- Times use the business timezone from the `businesses` row. Never the browser's.

`get_staff` must not return internal IDs to the model where a name suffices, and
must never return staff email, phone, notes or auth data.

---

## Two notes on the AI spec

**1. Prompt contents.** The business name may be a literal in the prompt — this is
built for one business and the name does not change. Everything that *can* change
stays out: no prices, durations, treatments, therapist names, opening hours or
address in the prompt. Those come from the tools, so that an owner edit in Admin
takes effect without a code change and the assistant can never contradict the site.

**2. Demo data is presented, not deflected.** The spec says to tell customers that
treatment information is being updated. Do not implement that. While
`hasDemoData()` is true, the assistant presents the services normally and labels
them clearly as sample data, consistent with the existing site banner. Do not
remove, bypass or weaken the demo-data mechanism.

---

## Personal information

Name and phone must never enter the model's context. The assistant may *ask* for
them; the client captures them and passes them directly to the booking route in a
later batch. No customer records, no appointment history, no other customers, no
admin data, no credentials reach the model at any point.

Logs may contain operational facts only — tool failed, provider timed out,
validation rejected. Never phone numbers, names, booking details, prompts, keys or
provider request bodies. Sanitise external error objects before logging, the same
way `safeError()` already does in `lib/email.ts`.

---

## Tests for this batch

- Provider: every failure mode listed above.
- `get_services` returns only active services.
- `get_staff` returns public fields only, and no inactive staff.
- `get_business_info` returns configured data, not literals.
- `check_availability` returns only slots the real engine produced, respects
  turnaround, minimum notice, closed days, and the empty-resource-set rule from
  v2 §6 — a service requiring a resource with every resource inactive returns
  **zero** slots, never a slot with `resource_id NULL`.
- Prompt construction contains no price, duration, treatment, staff name, opening
  hour or address.

Then re-run the existing suite and confirm it is still green.

---

## Stop conditions

Stop and ask rather than proceeding if:

- the baseline test suite is not green
- any change to existing `lib/` code appears necessary
- the availability engine's interface does not fit the tool cleanly
- a schema change appears necessary

## Do not

Do not touch the booking engine, exclusion constraints, advisory lock, idempotency
or `pg` usage. Do not add Landbot, Make.com, customer accounts, payments,
analytics, an AI-specific database table, or a second email path. Do not
reorganise unrelated files.

---

## Report at the end

1. Baseline test result before your changes.
2. Files created.
3. Test result after.
4. Anything in the AI spec that did not fit the existing code, and what you did
   about it.
