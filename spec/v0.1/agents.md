# AgentMarshal Agent Inventory & Contract Architecture v0.2

Normative product-architecture specification for the ten-agent AgentMarshal
v0.2 deployment that runs against the v0.1 contract and receipt artifacts
(`scope-contract.schema.json`, `compliance-receipt.schema.json`,
`audit-record.schema.json`). This document is the human-readable source of
truth for: which agents exist, what they may do, which contracts govern
them, and which composite predicates are queued for implementation.

**Version-label distinction.** This document lives under `spec/v0.1/`
alongside the other normative artifacts because it builds on v0.1 contract
and receipt semantics. The product surface it describes — agent inventory,
layered contracts, the Bright Data integration model — is the v0.2 product
release. v0.1 = artifact/schema version (locked). v0.2 = product release
(in progress, this branch).

**Authority.** Where this document and a downstream implementation
disagree, this document wins until amended here. Subsequent bubbles
implement against these sections; predicate stubs are queued by the names
declared in Section 3. Renaming a predicate retroactively requires an
amendment to this document.

## 1. Agent inventory

Ten agents compose the AgentMarshal v0.2 outbound stack. Each row of the
table below declares the agent's role, the action surface it touches
externally, the layered contracts that govern it (Section 2), whether its
direct actions emit Compliance Receipts (vs. internal-audit envelopes, see
Section 7), and a one-line summary of how it consumes Bright Data (Section
4).

| Agent | Role | Outbound action surface | Governing contracts | Compliance Receipts? | BD usage |
|---|---|---|---|---|---|
| **LeadScraper** | Sources roofing-contractor leads across the 15 launch states | Data acquisition from BD (SERP, datasets, Web Unlocker) + public APIs (state licensing boards, FMCSA SAFER, OSHA, SoS, NOAA); writes lead store with per-field provenance | `sourcing_v1` | No — internal audit only | SERP discovery, LinkedIn Company dataset pulls, Web Unlocker on public-record cross-checks |
| **Validator** | 3-tier email validation + line-type detection | Tier (a) BD LinkedIn People email field if present; tier (b) DIY SMTP probe with pattern enumeration; tier (c) NeverBounce on catch-alls and probe failures; Hunter discovery for high-value tail; wireless vs. landline line-type | `sourcing_v1`, `operational_v1` | No — internal audit only | LinkedIn People dataset (email field) when needed |
| **InboxAllocator** | Sender selection from the 105-domain pool; inbound reply routing | Selects sender respecting per-inbox cap, warmup state, reputation score, blocklist, quiet-hours window; routes inbound replies back to the originating inbox with conversational context preserved | `operational_v1` | No — internal audit only | Minimal/none (operational metrics) |
| **Personalizer** | Per-lead enrichment producing segmentation + slot-fill vectors | Pulls LinkedIn Company/People, Maps, Yelp, Facebook, manufacturer cert locators (Web Unlocker), insurance preferred-network checks; emits segmentation vector (cohort assignment) and slot-fill vector (template variables) | `sourcing_v1` | No — internal audit only | Deep enrichment across LinkedIn + Maps + Yelp + Facebook + Web Unlocker |
| **CampaignManager** | Template authoring, A/B variants, cohort routing, send execution | 4-email drip on Days 1, 3, 7, 12; cohort-routed micro-campaigns (5–8 cohorts at full maturity, 2–3 A/B variants per cohort); per-send Marshal authorization | `outreach_v1`, `email_v1` | **Yes** — every send emits a Compliance Receipt | None directly (consumes Personalizer outputs) |
| **ResponseHandler** | Inbound reply classification + propagation | Opt-out detection runs autonomously (no human gate, ever); positive replies drafted for human review via Twilio SMS ping with 4-hour SLA; negative responses archived; complaints escalated | `response_v1` (inverse) | **Yes** — every classified inbound emits a Compliance Receipt under the inverse contract | Real-time enrichment at reply time (Web Unlocker on company-news / role-change context) |
| **COO** | Portfolio orchestrator + pipeline controller | Owns buffer-driven pull rate (Section 5), inbox health monitoring, BD budget pacing, campaign pause/resume; emits daily cost + pipeline ops report (Section 5 template) | `operational_v1` | No — internal audit only | None (consumes BD spend reports from other agents) |
| **InboxProvisioner** | Operational mailbox/DNS surface for hackathon demo | DNS edits, mailbox creation, warmup pacing; production warming handled externally (MailForge + Instantly); included in v0.2 to demonstrate AgentMarshal enforcement on operational surfaces | `operational_v1` | No — internal audit only | None |
| **Voice** | Inbound voice (Day-10 hackathon demo, recorded) | Twilio Voice + Vapi + ElevenLabs + Whisper; handles leads who initiate calls from email CTAs; mid-call Scope Contract re-evaluation on state transitions (revocation, recording-consent change) | `outreach_v1`, `voice_v1` | **Yes** — call accept + mid-call re-evaluations each emit Compliance Receipts | Real-time mid-call grounding via Web Unlocker on context-driven queries |
| **RegulatoryMonitor** | Weekly regulatory drift surveillance | BD scrapes FCC + PACER + state AG sites + FTC; produces `regulatory_state` hash for receipts; emits drift feed to CampaignManager (content patterns), AgentMarshal (predicate updates), COO (operational adjustments) | `sourcing_v1` | No — internal audit only | Weekly Web Unlocker scrape across FCC, PACER, state AG, FTC |

**Receipts vs. internal audit.** An agent emits Compliance Receipts when
its direct action goes through a Marshal authorization with a
customer-touching effect (send, call, opt-out propagation). Agents whose
actions are internal-only (scraping, enrichment, orchestration,
provisioning) emit internal-audit envelopes — same signing/chaining
substrate, different `record_type` (see Section 7 open items).

## 2. Layered contract model

Contracts are layered so that channel-specific obligations stack on top of
universal obligations rather than duplicating them. A given action is
authorized against the union of every layer that applies.

### 2.1 Base contract

**`outreach_v1`** — universals applying to any customer-touching contact
action regardless of channel. Required obligations:
- TCPA quiet-hours window respected for the recipient's local timezone
- Consent state valid for the contact action being attempted
- Revocation honored (no contact after a recorded opt-out)
- Identification disclosed (sender or caller identity present and truthful)
- Abandonment rate compliant where applicable (voice channels)

The TCPA predicates registered today (`tcpa_quiet_hours_respected`,
`tcpa_consent_present`, `tcpa_revocation_honored`,
`tcpa_caller_id_disclosed`, `tcpa_robocall_disclosure_present`,
`tcpa_dnc_registry_clear`) satisfy `outreach_v1` for any channel that
adopts them. Two of those six are stubs today
(`tcpa_dnc_registry_clear`, `tcpa_revocation_honored`) and are tracked
against Day 6 implementation work.

### 2.2 Channel contracts (layer on `outreach_v1`)

**`email_v1`** — CAN-SPAM specifics, layered ON TOP of `outreach_v1`.
Required obligations: header accuracy, subject-line accuracy, sender
identification present, physical postal address present, opt-out mechanism
present, opt-out mechanism working. Satisfied by the six CAN-SPAM
predicates registered today (`canspam_unsubscribe_link_present`,
`canspam_unsubscribe_mechanism_working`, `canspam_postal_address_present`,
`canspam_sender_id_truthful`, `canspam_subject_line_not_deceptive`,
`canspam_advertisement_disclosure_present`). One stub
(`canspam_unsubscribe_mechanism_working`) is tracked against Day 6.

**`voice_v1`** — voice-channel obligations, layered on `outreach_v1`.
Required obligations: recording consent state resolved for the caller's
state, abandonment rate compliant, prerecorded disclosure present where
applicable, caller-ID accurate (anti-spoofing). The four voice predicates
declared in Section 3.3 satisfy this contract. Note that `voice_v1`'s
caller-ID predicate (`voice_caller_id_accurate`) is the runtime accuracy
check (the displayed caller ID matches the operator's authorized caller
ID); it stacks with and does not duplicate `tcpa_caller_id_disclosed`
(presence check at policy issuance).

### 2.3 Inverse contract

**`response_v1`** — semantics for inbound reply handling, used only by
ResponseHandler. The contract is "inverse" in that its primary
obligations are about correctly receiving and propagating customer
intent rather than executing outbound contact. Required obligations:
opt-out detection completeness, revocation propagation across all
agents/inboxes for that recipient, complaint escalation. The Day-6
TCPA `tcpa_revocation_honored` stub will gain its propagation path
through this contract.

### 2.4 Internal contract

**`operational_v1`** — non-customer-touching obligations binding
operational agents (LeadScraper's pacing, InboxAllocator's capacity
decisions, COO's orchestration, InboxProvisioner's mailbox operations).
Required obligations: sender reputation above threshold, bounce rate
compliant, complaint rate compliant, pipeline buffer within band, BD
budget within cap, inbox send capacity above floor.

### 2.5 Sourcing contract

**`sourcing_v1`** — data-acquisition obligations binding any agent that
fetches data from external sources (LeadScraper, Validator, Personalizer,
ResponseHandler's enrichment path, RegulatoryMonitor, Voice's mid-call
grounding). Required obligations: data source provenance recorded, BD
subscription/proxy session logged, data-acquisition ToS compliant,
robots.txt honored where the source publishes one, public-record status
verified for any source claimed to be public record, source attribution
retained in the lead store, PII field handling documented per source.

### 2.6 Stacking rules

- An action evaluated against multiple contracts requires every contract's
  obligations to pass. Composite predicate results are unioned in
  `composite_evaluations` on the receipt.
- A `stub` result anywhere in the union is treated as non-allow by
  `isAllowable()` (matches existing fail-safe in
  `lib/authzen/composite-dispatch.ts`). Stubbed predicates therefore
  cannot accidentally allow an action; the operator must explicitly
  permit the stub via an evaluation_path or replace the stub with a real
  implementation.
- Channel contracts MUST NOT bypass `outreach_v1`. A future SMS channel
  contract (deferred to v0.3) layers on `outreach_v1` the same way
  `email_v1` and `voice_v1` do.

## 3. New predicate inventory

All twenty predicates below are declared as STUBS in this document and
queued for implementation in subsequent code bubbles. They are additive to
the twelve composites currently registered (six TCPA, six CAN-SPAM). When
implemented, they MUST register through `registerComposite()` in
`lib/authzen/composite-dispatch.ts` and follow the
`registerAllXyzComposites()` pattern established by the existing TCPA and
CAN-SPAM libraries.

### 3.1 Bright Data provenance (5)

Bind any sourcing agent to BD-acquisition evidence so that downstream
auditors can trace any data point to a logged BD operation.

| Predicate | Description |
|---|---|
| `data_source_provenance_recorded` | The lead store row carries a non-null `source` field naming the originating dataset/endpoint/URL and a timestamp |
| `bd_dataset_subscription_active` | The BD dataset referenced by the source was subscribed and within its billing window at acquisition time |
| `bd_proxy_session_logged` | The Web Unlocker / proxy session ID used for the fetch is captured in the BD audit log and joinable to the lead row |
| `data_acquisition_tos_compliant` | The source's ToS classification (public-record / public-web / vendor-licensed) matches the acquisition method used |
| `pii_field_handling_documented` | Any PII field pulled from the source is annotated with its handling tier (retain / hash / drop-after-use) per the documented PII policy |

### 3.2 Pipeline control (4)

Bind the COO's pull-rate decisions and BD budget pacing so that send
capacity, validated buffer, and BD spend remain within declared bands.

| Predicate | Description |
|---|---|
| `pipeline_buffer_within_target_band` | Validated-lead count is between the floor (3,200) and the ceiling (9,500); see Section 5 thresholds |
| `pull_rate_calibrated_to_send_rate` | Today's pull plan derives from the buffer-driven formula in Section 5 using the rolling 7-day fallthrough rate |
| `scrape_budget_within_monthly_cap` | Month-to-date BD spend plus today's projected spend does not exceed the declared monthly cap |
| `inbox_send_capacity_above_floor` | Aggregate send capacity across the 105-domain pool (warmed senders × per-inbox cap) exceeds the target send rate for the day |

### 3.3 Voice channel (4)

Voice-specific obligations stacking on `voice_v1` for any Voice agent
action. The voice predicates are runtime/operational checks against the
live call rather than declarative inputs at policy issuance, so they do
not duplicate the TCPA predicates that share adjacent names.

| Predicate | Description |
|---|---|
| `voice_recording_consent_state_resolved` | The caller's state has been mapped to its recording-consent regime (one-party / two-party / federal default) and the resolved value is recorded |
| `voice_abandonment_rate_compliant` | The agent's abandonment rate (rolling window) is below the regulatory threshold for the call's recipient state |
| `voice_prerecorded_disclosure_present` | The call transcript confirms the prerecorded disclosure was actually played (runtime check against transcript), distinct from `tcpa_robocall_disclosure_present` (declarative input check) |
| `voice_caller_id_accurate` | The displayed caller ID matches the operator's authorized caller ID for this campaign; anti-spoofing runtime check distinct from `tcpa_caller_id_disclosed` (presence-only check) |

### 3.4 Sourcing (3)

Operational sourcing obligations layering on `sourcing_v1` to enforce
behavior at the source-fetch boundary.

| Predicate | Description |
|---|---|
| `source_robots_txt_honored` | The fetch respected the source's robots.txt directives at the time of acquisition (cached and joined to the fetch log) |
| `source_public_record_status_verified` | Any source claimed to be public-record has its public-record status verified against a non-self-reported authority (state SoS index, regulatory registry, etc.) |
| `source_attribution_retained` | The originating source attribution (publisher, license, retrieval URL) is retained on the lead-store row through downstream merges |

### 3.5 Operational (3)

Sender-health obligations binding InboxAllocator and CampaignManager to
the per-inbox health envelope.

| Predicate | Description |
|---|---|
| `sender_reputation_above_threshold` | The selected sender's reputation score is above the per-ESP threshold at send time |
| `bounce_rate_compliant` | The selected sender's rolling-7-day bounce rate is below the operational threshold for its warmup tier |
| `complaint_rate_compliant` | The selected sender's rolling-7-day complaint rate is below the operational threshold for its warmup tier |

### 3.6 SMS (1, deferred to v0.3)

| Predicate | Description |
|---|---|
| `sms_express_written_consent_recorded` | Recipient has an SMS-specific express-written-consent record (TCPA §227(b)(1)(A)) on file with timestamp and capture mechanism. **Stubbed in v0.2 with no SMS surface; full implementation lands with the v0.3 SMS channel contract.** |

**Total: 20 new predicates queued.** Combined with the existing 12, the
full composite registry at v0.2 GA target is 32 predicates.

## 4. Bright Data integration model

### 4.1 Configuration

- **MCP server.** `@brightdata/mcp` invoked via `npx`, with the
  environment variable `PRO_MODE=true` to expose the full 60+-tool
  surface (SERP, Web Unlocker, datasets, Scraping Browser).
- **Required zones.** `mcp_unlocker` (Web Unlocker) is required.
  `mcp_browser` (Scraping Browser) is optional and used only when an
  agent needs interactive page state (Personalizer manufacturer-cert
  flows that require JS execution).
- **Credentials.** API token and zone identifiers are loaded via the
  standard secret-injection path; no token may appear in any agent's
  declared scope.

### 4.2 Tiered enrichment

Enrichment depth is tiered to control per-lead cost. Agents declare which
tier they operate at; the COO's daily report (Section 5) breaks down BD
spend by tier so deviations are visible.

| Tier | Applies to | Per-lead cost (approx) | Operations |
|---|---|---|---|
| 1 | All pulled leads | ~$0.01 | SERP discovery, public-record cross-check via Web Unlocker, LinkedIn Company dataset pulls |
| 2 | Validated leads only | ~$0.025 | LinkedIn People dataset (email + role), Maps / Yelp / Facebook enrichment, validation auxiliary fetches |
| 3 | Engaged leads only (opened / replied / clicked) | ~$0.04 | LinkedIn People deep, manufacturer-cert verification, insurance preferred-network check, Voice mid-call grounding |

### 4.3 Per-agent BD usage

| Agent | BD operations | Typical tier |
|---|---|---|
| LeadScraper | SERP discovery, LinkedIn Company dataset, Web Unlocker public-record cross-check | 1 |
| Validator | LinkedIn People dataset for email field when present | 2 |
| Personalizer | LinkedIn Company + People deep, Maps, Yelp, Facebook, manufacturer-cert locators, insurance preferred-network (Web Unlocker) | 2–3 |
| ResponseHandler | Real-time Web Unlocker on company news / role changes at reply time | 3 |
| RegulatoryMonitor | Web Unlocker weekly scrapes (FCC, PACER, state AG, FTC); cost is per-scrape, not per-lead | N/A |
| Voice | Mid-call Web Unlocker on context-driven queries | 3 |

CampaignManager, COO, InboxAllocator, and InboxProvisioner have no direct
BD usage.

### 4.4 Verification gating

BD MCP integration verification is **queued for 2026-05-25** when the
hackathon credits land. All pre-2026-05-25 work on this branch is
BD-spend-free: predicate stubs, contract scaffolds, and pull-controller
math may be written and tested without invoking any BD endpoint. The
verification plan is four dry-run queries (Section 7).

## 5. Buffer-driven pull controller

The COO owns a buffer-driven pull controller that keeps the validated-lead
buffer within a declared band by adjusting daily raw-pull volume against
the rolling validation pass rate. The controller has two phases.

### 5.1 Phases

- **Initial fill.** Day 0 through the day the validated-lead count
  reaches the setpoint (~6,400). A one-time burst run pulling and
  validating enough raw leads to fill the buffer to setpoint. Projected
  cost ~$258, against the $250 hackathon credit; the small overage is
  absorbed by the operating budget.
- **Steady state.** From buffer-hit forward. Daily backfill calibrated
  to the prior day's actual send rate and the rolling 7-day validation
  pass rate. Projected operating cost ~$25–$30/day.

### 5.2 Thresholds

| Level | Validated-lead count | Behavior |
|---|---|---|
| Ceiling | 9,500 | Pause non-essential pulls until buffer drops back toward setpoint |
| Setpoint | 6,400 | Target steady-state buffer |
| Floor | 3,200 | Increase pull-rate multiplier; alert COO |
| Critical | 1,600 | Pause low-priority campaigns; surge-pull until buffer recovers above floor |

### 5.3 Pull-multiplier formula

The daily pull plan is derived from the send-rate target, the current
buffer surplus, and the rolling 7-day fallthrough rate. In plain
arithmetic:

    pulls_today =
      (send_rate_target - buffer_surplus_today)
      /
      (1 - fallthrough_rate_rolling_7d)

Where:

- `send_rate_target` is the planned outbound send count for today
- `buffer_surplus_today` is the validated-lead count above the floor
  (negative if below)
- `fallthrough_rate_rolling_7d` is the rolling 7-day fraction of raw
  leads that fail validation (so `1 - fallthrough` is the validation
  pass rate)

Result is the number of raw leads to pull such that, after expected
validation losses, the buffer is replenished to within band.

### 5.4 Self-tuning (Loop 6)

The `fallthrough_rate_rolling_7d` is recomputed daily from the prior
seven days of Validator outcomes (Loop 6 in Section 6). The pull
controller therefore self-tunes: a sustained drop in pass rate
(e.g., a new dataset's data quality is lower) automatically widens the
pull volume without manual intervention, and a sustained rise narrows it.

### 5.5 Daily cost + pipeline-ops report

COO emits the following report end-of-day. Fields in `{}` are populated
at emit time.

```
# Daily Cost & Pipeline Ops Report — {YYYY-MM-DD}

## Summary
- Validated lead buffer (start → end): {start} → {end}
  (band 3,200–9,500; setpoint 6,400)
- Pulls executed today: {N_raw} raw → {N_validated} validated
  (fallthrough {pct}%)
- Sends executed today: {S} (target {T}, delta {Δ})
- Inbound replies: {R} (positive {p}, negative {n}, opt-out {o}, complaint {c})

## BD spend
- SERP: ${X.XX}
- Web Unlocker: ${Y.YY}
- Datasets (LinkedIn Company + People): ${Z.ZZ}
- Total today: ${TOTAL}
  (monthly cap ${CAP}, MTD ${MTD}, headroom ${HEADROOM})
- Spend by tier: T1 ${t1} / T2 ${t2} / T3 ${t3}

## Inbox health
- Active senders: {A}/105 (warmed {W}, warming {warming}, paused {P})
- Reputation distribution: green {g} / yellow {y} / red {r}
- Bounce rate (rolling 7d): {pct}% (threshold {THR}%)
- Complaint rate (rolling 7d): {pct}% (threshold {THR}%)

## Pull controller
- Current fallthrough multiplier: {M}×
  (rolling 7d validation pass rate {pct}%)
- Tomorrow's pull plan: {N} raw scrapes
  (calibrated to send target {S})
- Buffer projection: {pred} validated by EoD tomorrow

## Anomalies & auto-actions
- {paused campaigns, blocklist additions, threshold breaches}

## Compliance receipt volume
- Issued today: {N} ({allow} / {deny} / {escalate})
- regulatory_state anchor coverage: {pct}% (pending {n})
```

## 6. Six self-improvement loops

Each loop closes a feedback path between an observed outcome and the
agent that produced it. All loops emit internal-audit envelopes for their
adjustments so that retraining/tuning decisions are themselves auditable.

| # | Loop | Trigger | Signal source | Output artifact | Feedback target |
|---|---|---|---|---|---|
| 1 | Reply-rate optimization | Weekly cron | Send + reply log (per cohort × variant × template) | Ranked template/variant scoreboard; promote winners, retire losers | CampaignManager template + variant weights |
| 2 | Personalization quality | Per-reply (positive) | Outcome label joined to personalization vector | Feature-importance vector; under-delivering template variables | Personalizer slot-fill weighting; CampaignManager variant scaffolds |
| 3 | Classification accuracy | Per human-correction on the 4-hour SLA review queue | Human override on a ResponseHandler classification | Gold-standard training set for classifier re-tune | ResponseHandler classifier (rules or model) |
| 4 | Inbox health | Daily morning report | Per-inbox bounce / complaint / reputation, blocklist hits, ESP feedback loops | Per-inbox action set (pause, warm-down, retire, replace) | InboxAllocator capacity table; InboxProvisioner replacement pipeline |
| 5 | Compliance drift | Weekly RegulatoryMonitor scrape | FCC + PACER + state AG + FTC scrape diffs | regulatory_state hash + drift advisories per channel × state | CampaignManager content patterns; AgentMarshal predicate updates; COO operational adjustments |
| 6 | Pipeline economics | End-of-day rollup | Validation pass rate, BD spend, send/reply counts | Updated fallthrough multiplier; BD budget projection; send-rate recommendations | COO pull controller (multiplier); CampaignManager send-rate cap when needed |

## 7. Open items & verification

### 7.1 BD MCP dry-run verification (2026-05-25)

Four dry-run queries to confirm the MCP integration works end-to-end on
the day hackathon credits arrive. Each query exercises a different BD
surface against a representative sourcing flow.

1. **SERP** — query for "roofing contractors in Lubbock TX" via the
   SERP endpoint; confirm result shape and quota debit.
2. **Web Unlocker on manufacturer cert** — fetch a known
   manufacturer-cert directory page (e.g., GAF Master Elite locator)
   and confirm successful unblock + parseable HTML.
3. **Dataset on LinkedIn Company** — request a single LinkedIn Company
   record by URL via the dataset endpoint; confirm record completeness
   and field-level provenance.
4. **Web Unlocker on insurance preferred-network** — fetch a known
   insurer's preferred-contractor lookup result and confirm
   parseability.

A failure on any of the four halts BD-dependent work until the cause is
identified.

### 7.2 Stubbed predicates pending real lookups

The following stubs in this document and in the existing registry require
upstream data sources before they can be promoted from `stub` to a real
implementation:

- `tcpa_dnc_registry_clear` — needs DNC registry lookup (Day 6)
- `tcpa_revocation_honored` — needs revocation registry / propagation
  store (Day 6, ties to `response_v1` propagation)
- `voice_recording_consent_state_resolved` — needs per-state
  consent-regime table (one-party / two-party / federal default)
- `source_public_record_status_verified` — needs non-self-reported
  public-record classifier (state SoS index, etc.)

### 7.3 Naming decisions locked

- `InboxAllocator` (was `Router`). Final.
- `CampaignManager` (was `CampaignWriter`). Final.

Subsequent code bubbles MUST use these names. References in code,
schemas, or downstream specs to the prior names are a documentation bug
to be corrected when found.

### 7.4 SMS scope

SMS is **deferred entirely to v0.3**. v0.2 has no SMS-touching surface.
The single SMS predicate (`sms_express_written_consent_recorded`,
Section 3.6) is queued only to reserve the predicate name and the
contract-layering pattern; it is stubbed and unreachable in v0.2.

### 7.5 Internal-audit envelope

Agents whose direct actions do not emit Compliance Receipts (LeadScraper,
Validator, InboxAllocator, Personalizer, COO, InboxProvisioner,
RegulatoryMonitor — see Section 1) emit **internal-audit envelopes**
instead. The envelope reuses the receipt signing/chaining substrate but
carries `record_type: 'internal_audit'` rather than the implicit
`compliance_receipt` type.

The internal-audit envelope spec — schema additions, signing path,
chaining semantics — lands in a subsequent bubble. Until then, agents
that would emit internal-audit records emit nothing for those actions
(no silent fallback to Compliance Receipts); the audit gap is tracked.

### 7.6 Authoritative-spec rule

When a subsequent bubble disagrees with this document, this document
wins until amended here. Amendments are made by editing this file in a
focused PR with the rationale captured in CHANGELOG under
`docs(spec):`.
