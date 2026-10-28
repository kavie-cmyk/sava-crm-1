# Game & Publishing workbook integration

## Scope

`publishing.html` is the BD workspace; `mkt.html` is Marketing. Both read the
same immutable market snapshot and the same browser-local Publishing store.
The CRM company/game drawers link to the corresponding assessment. AI and
Metaverse retain their existing workflows.

- Both views add/revise market observations with a date, geography, platform,
  source, evidence type, confidence and author.
- BD creates company/game requests from existing CRM entities, assigns Marketing,
  supplies build evidence, maintains hard gates and Deal Fit, and requests a new
  review. Marketing does not manage leads or commercial terms in this workspace.
- Marketing scores studio production capability and individual games separately.
  Request progress is distinct from score-based recommendation.
- Every save appends an immutable revision. A new game build sent for re-review
  clears active product scores and gate approval; the old revision remains intact.
- Concurrent edits reject a stale revision instead of silently overwriting it.

## Allowed source data

The supplied workbook snapshots are inputs, never modified. No exact-source
refresh was requested. No Google Drive originals were changed.

`tools/import-market.py` opens only four allowlisted sheets in
`SAVA_Mobile_Game_Decision.xlsx`:

| Sheet | Use |
| --- | --- |
| `20_ALL_MECHANIC_MARKET_20260815` | 12 US Puzzle mechanic Top100 snapshots, daily downloads/revenue and concentration |
| `02_MECHANIC_MARKET` | Cached source history, observed-cohort growth, source URL, confidence and limitations |
| `28_UA_MECH_SUMMARY` | Paid-install CPI percentiles and title coverage, US Google Play, May–Jul 2026 |
| `31_SIM_MARKET_20260825` | 11 US Simulation vendor-tag families, explicitly provisional, 2026-08-25 |

Imported market records include source sheet/cell coordinates and the workbook
SHA-256. Historical observations are coverage-limited, not whole-market totals.
RPD is not LTV; Top Free/Grossing shares are not revenue per download. A missing
value stays null, distinct from a real zero. New dated observations do not inherit
old CPI, concentration or growth. Prior snapshots remain available for inspection.

No `01_Partner_Master` rows, partner IDs, commercial commitments, game intake
records, decision examples or existing workbook scores are imported. The initial
assessment queue is empty. Existing CRM demo data is unchanged, independent of
these workbooks. Test fixtures are synthetic and run only in test storage.

## Exact scoring mapping

Game source: `10_SCORECARD!B4:B11`, `E4:E9`, `I4:I8`.

- Market weights: 12,12,18,15,14,10,10,9 (sum 100).
- Prototype weights: 20,22,12,15,20,11 (sum 100).
- Each block = SUMPRODUCT(score,weight)/5. Missing inputs contribute zero to a
  partial block, never cause weight renormalization; an entirely missing block
  remains null. Final = Market*0.4 + Prototype*0.6.
- Completeness = valid scores among 14 criteria plus Evidence Quality /15.
- Gate FAIL → NO-GO; pending → HOLD. Completeness below 80% or an absent block
  → HOLD. Otherwise final >=80 GREENLIGHT, >=65 TEST MORE, below65 NO-GO.

Company source: `02_Hard_Gate`, `03_Evidence`, and
`04_Scorecard!D7:K7,L9:N9` in `Publishing_Partner_Selection_Playbook.xlsx`.

- Seven Partner Fit weights: Track10, Team15, Production15, Data10,
  Collaboration15, Strategic15, Long-term10. Normalize by90: sum(score*weight)/5/90*100,
  rounded to one decimal. All seven scores are required. Deal Fit is separate.
- Production = mean(Capacity,Cadence,Milestone,LiveOps), rounded to one decimal;
  all four evidence-backed scores required. Production evidence coverage requires
  at least3/4 groups, matching `03_Evidence!AC9`.
- Partner classification >=85 Priority, >=75 Pass, >=65 Conditional, else Review.
- One failing hard gate blocks the result; all six must pass to be cleared.
- Minimum Evidence = passed hard gate + Team + all4 Production + Data +
  Collaboration + Deal evidence, matching `03_Evidence!AE9`.
- Coverage uses the workbook's eight evidence groups (including Deal evidence).
  Confidence uses 13 evidence statuses, including supporting Publisher History
  and Legal/IP: <50% coverage is Low; >=75% coverage and >=50% independently
  verified is High; otherwise >=50% verified/partner-supplied is Medium, else Low.

There is a source inconsistency: `05_Decision` and older help text still include
Deal10% in the pillar list, while the current `04_Scorecard!L9` explicitly excludes
Deal and normalizes90. The implementation follows the current scorecard formula,
and exposes that choice in the framework screen. It does not average those rules.

Input integrity additions: a counted score requires a nonempty evidence note and
source plus a usable verification status. Gate PASS requires evidence and source.
No evidence is NE, never an automatic3. This adds explicit validation without
changing workbook weights. No evidence-independent automatic conversion from raw
market revenue into a qualitative score is invented. Old CRM /10 scores stay
historical and are not converted into /5 scores.

This partner rubric evaluates studios/indie developers. It must not be applied to
publisher capability without a separate approved rubric.

## Data and security boundary

`sava_publishing_v1` stores assessments and market updates separately from
`sava_crm_shared_v1`, so legacy CRM saves cannot erase assessments. Browser tabs
on the same origin share it; different devices/users do not. No test writes are
sent to Supabase. Existing `pubos.js` behavior is unchanged.

Role-based page controls are workflow separation, **not server authorization**.
The page explains this. No claim is made that Supabase RLS or BD/MKT account
roles have been installed. Real multi-device collaboration still requires access
to the correct Supabase project, migrations, role mapping, server policies and a
data migration. New results are not automatically pushed to the old Publishing OS.

## Validation

`node --test tests/publishing-score.test.cjs` checks exact weights, formulas,
thresholds, NE, gate precedence, Production completeness, Deal exclusion,
minimum evidence, and confidence. `tests/publishing-flow.cjs` is a local-only
Playwright scenario covering market updates, BD/MKT handoff, revisions,
concurrent edits, legacy drawers and responsive behavior. It requires a separately
available Chromium installation and static server on port8765. Never run it
against production because it intentionally uses and clears local test storage.
