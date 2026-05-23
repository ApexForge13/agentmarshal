# Voice agent (sample) — `lib/voice/`

> **This is a SAMPLE agent.** It lives in the `agentmarshal` repo as a hackathon
> concession so the v0.2 demo can show mid-call Marshal integration end-to-end
> in one codebase. **The production Voice agent lives in `echo-os`** (a separate
> codebase); this scaffold demonstrates the AgentMarshal integration contract,
> not the production agent.

## What this demonstrates

A **state-transition-triggered** mid-call compliance check. The Voice agent
greets an inbound caller, captures basic info, and — when the caller revokes
recording consent — its continued `record_call` attempt is caught by Marshal,
which emits a **signed Compliance Receipt** citing the consent transition. The
call then recovers gracefully and hands off to a human.

Scope is **intentionally narrow**: triage + escalation only — greet, capture
basic info (name, callback, address, intent), and escalate to a human. No
qualification logic, no appointment booking, no calendar integration. Anything
complex → "let me have someone call you back." This matches both demo simplicity
and a production-safe TCPA triage shape.

## Stack (configured Vapi-side, not in this code)

- **Vapi** sandbox phone number → posts to `POST /api/voice/vapi/webhook` each turn
- **ElevenLabs** TTS via Vapi voice settings
- **OpenAI Whisper** transcription via Vapi transcriber settings
- **Custom LLM** = our webhook: we return the next assistant utterance

## Modules

| File | Role |
|------|------|
| `types.ts` | `CallState`, `ConversationTurn`, `StateTransition`, `CallPhase` |
| `call-state.ts` | In-memory `Map<callId, CallState>` store + mutation helpers |
| `transition-detector.ts` | Caller utterance → `StateTransition` (tight keyword/regex) |
| `conversation-flow.ts` | Scripted utterance bank selector (`data/voice/demo-flow.json`) |
| `marshal-integration.ts` | In-process `/api/access/v1/evaluation` call (Track C pattern) |
| `vapi-adapter.ts` | Vapi webhook payload ⇄ internal events / custom-LLM response |

## Marshal integration contract

`marshal-integration.evaluateAction(callState, actionName)` builds an AuthZEN
request, calls the real PDP **in-process** (no network, no `setContractOverride`),
and returns `{ allowed, receipt_id, reason, reason_code }`. Live call state
(`consent_status`, `recording_active`, `caller_state`, `call_id`) rides the
request's `action.properties`; the upgraded
`voice_recording_consent_state_resolved` composite reads `consent_status` from
`EvalContext.action_properties`.

> Note: the `voice_v1` Scope Contract still bundles three Bubble-3 voice
> composite **stubs** (`voice_abandonment_rate_compliant`,
> `voice_caller_id_accurate`, `voice_prerecorded_disclosure_present`), which
> return `stub` and therefore also block `allow` under the fail-safe policy. A
> `voice-001` evaluation thus denies on multiple grounds today; the
> **consent composite is the meaningful, demo-cited signal** and is the one
> upgraded to real logic in Bubble 9. Upgrading the remaining three is future work.

## Environment variables

See `.env.local.example` at the repo root:

- `VAPI_API_KEY` — Vapi API key (Conner provisions)
- `VAPI_PHONE_NUMBER_ID` — Vapi sandbox phone number id
- `AGENTMARSHAL_AGENT_ID` — agent identity this voice agent reports as (`voice-001`)
- `VOICE_WEBHOOK_PUBLIC_URL` — public URL Vapi calls back to (ngrok in dev, fly.io for staging)
