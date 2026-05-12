// Wipe data/agentmarshal.db and seed 15 realistic historical audit entries.
// Run:  npx tsx scripts/seed-audit.ts
//
// Writes directly via audit-log.append() — does NOT call the policy engine or
// Lobster Trap. Seed data is fabricated to make the activity feed look like a
// real working day (5 agents, 14 ALLOW + 1 HUMAN_REVIEW).

import fs from 'node:fs';
import path from 'node:path';

import { append, init } from '../lib/audit-log';
import type { AuditEntry, LobsterTrapMetadata } from '../types';

const DB_PATH = path.resolve(process.cwd(), 'data', 'agentmarshal.db');

function cleanLT(
  overrides: Partial<LobsterTrapMetadata> = {},
): LobsterTrapMetadata {
  return {
    intent_category: 'general',
    intent_confidence: 0.78,
    risk_score: 0.08,
    contains_code: false,
    contains_credentials: false,
    contains_pii: false,
    contains_pii_request: false,
    contains_system_commands: false,
    contains_malware_request: false,
    contains_phishing_patterns: false,
    contains_role_impersonation: false,
    contains_exfiltration: false,
    contains_harm_patterns: false,
    contains_obfuscation: false,
    contains_injection_patterns: false,
    contains_file_paths: false,
    contains_sensitive_paths: false,
    contains_urls: false,
    target_paths: null,
    target_domains: null,
    target_commands: null,
    token_count: 64,
    ...overrides,
  };
}

type SeedEntry = Omit<AuditEntry, 'id' | 'timestamp'> & { timestamp: string };

function isoMinutesAgo(now: number, mins: number): string {
  return new Date(now - mins * 60_000).toISOString();
}

function unlinkIfExists(file: string): void {
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

function buildEntries(now: number): SeedEntry[] {
  // Oldest first → IDs 1..15. Newest seeded row is ~5 minutes before "now".
  // Spread across ~4 hours.
  const at = (mins: number) => isoMinutesAgo(now, mins);

  return [
    // 1 · voice_scheduling — 4h ago — book inspection
    {
      agentId: 'voice_scheduling',
      declaredScope:
        'answer_inbound_call, qualify_lead, schedule_appointment, send_appointment_confirmation',
      declaredIntent: 'Booked roof inspection for Mrs. Wilkins · Wed 9:00am',
      detectedIntent: 'scheduling',
      action: 'ALLOW',
      rulesFired: [],
      attemptedAction: {
        tool: 'calendar_create_event',
        args: {
          customer: 'Mrs. Wilkins',
          address: '2204 Tatum Blvd, Phoenix AZ',
          start: '2026-05-13T09:00:00-07:00',
          duration_min: 30,
          type: 'roof_inspection',
        },
      },
      lobsterTrapMetadata: cleanLT({ token_count: 58 }),
      agentmarshalContext: { tool_call: 'calendar_create_event' },
      metadata: {},
      rawInput:
        'Hi, this is Linda Wilkins at 2204 Tatum Blvd in Phoenix. After the wind last week I noticed a few shingles loose on the back slope. Could someone come out Wednesday morning?',
      timestamp: at(240),
    },

    // 2 · quoting — 3h45m ago — clean quote at healthy margin
    {
      agentId: 'quoting',
      declaredScope: 'draft_quote, send_quote, apply_discount_up_to_10_percent',
      declaredIntent: 'Sent $9,400 quote to Patel residence · 42% margin',
      detectedIntent: 'quoting',
      action: 'ALLOW',
      rulesFired: [],
      attemptedAction: {
        tool: 'email_send_quote',
        args: {
          customer: 'Mr. Patel',
          address: '1147 Camelback Rd, Phoenix AZ',
          amount: 9400,
          job: '18-square reroof + architectural shingle',
        },
      },
      lobsterTrapMetadata: cleanLT({ token_count: 71 }),
      agentmarshalContext: {
        tool_call: 'send_quote',
        quote_margin: 0.42,
        quote_amount: 9400,
      },
      metadata: {},
      rawInput:
        'Generate quote for Mr. Patel at 1147 Camelback Rd, Phoenix: 18-square reroof, architectural asphalt, two-day install, GAF Timberline HDZ.',
      timestamp: at(225),
    },

    // 3 · comms — 3h30m ago — route ABC invoice to AP
    {
      agentId: 'comms',
      declaredScope:
        'read_inbound_email, draft_reply, send_template_reply, classify_invoice, route_invoice_to_ap',
      declaredIntent: 'Routed $487.50 invoice from ABC Building Supply to AP',
      detectedIntent: 'invoice_routing',
      action: 'ALLOW',
      rulesFired: [],
      attemptedAction: {
        tool: 'invoice_route_to_ap',
        args: {
          vendor: 'ABC Building Supply',
          vendor_id: 'vendor_abc_001',
          amount: 487.5,
          invoice_number: 'INV-77214',
        },
      },
      lobsterTrapMetadata: cleanLT({ token_count: 92 }),
      agentmarshalContext: {
        tool_call: 'invoice_route_to_ap',
        vendor_domain_mismatch: false,
        sender_domain: 'abcbuildingsupply.com',
      },
      metadata: {},
      rawInput:
        'Hi team — attached is invoice INV-77214 from ABC Building Supply for last week\'s underlayment order. Total $487.50, terms net-30.',
      timestamp: at(210),
    },

    // 4 · follow_up — 3h15m ago — drip campaign step
    {
      agentId: 'follow_up',
      declaredScope: 'send_review_request, send_drip_campaign, re_engage_cold_lead',
      declaredIntent: 'Sent drip step 2 of 4 to 7 warm prospects',
      detectedIntent: 'drip_campaign',
      action: 'ALLOW',
      rulesFired: [],
      attemptedAction: {
        tool: 'email_send_template',
        args: {
          template_id: 'drip_warm_step2',
          recipient_count: 7,
          segment: 'warm_post_inspection',
        },
      },
      lobsterTrapMetadata: cleanLT({ token_count: 48 }),
      agentmarshalContext: { tool_call: 'email_send_template' },
      metadata: {},
      rawInput:
        'Send the step-2 drip email ("seasonal storm prep checklist") to the warm_post_inspection segment. 7 recipients are due today.',
      timestamp: at(195),
    },

    // 5 · voice_scheduling — 3h ago — qualify inbound lead
    {
      agentId: 'voice_scheduling',
      declaredScope:
        'answer_inbound_call, qualify_lead, schedule_appointment, send_appointment_confirmation',
      declaredIntent: 'Qualified new lead from inbound call · Hendricks (Scottsdale)',
      detectedIntent: 'lead_qualification',
      action: 'ALLOW',
      rulesFired: [],
      attemptedAction: {
        tool: 'crm_create_lead',
        args: {
          customer: 'Tom Hendricks',
          address: '8842 N Hayden Rd, Scottsdale AZ',
          phone: '480-555-0144',
          source: 'inbound_call',
          interest: 'storm_damage_assessment',
        },
      },
      lobsterTrapMetadata: cleanLT({ token_count: 81 }),
      agentmarshalContext: { tool_call: 'crm_create_lead' },
      metadata: {},
      rawInput:
        "Hi, this is Tom Hendricks over in Scottsdale. We had hail come through Saturday and I want to get a damage assessment before I call my insurance.",
      timestamp: at(180),
    },

    // 6 · claims — 2h45m ago — read adjuster email & note
    {
      agentId: 'claims',
      declaredScope:
        'read_adjuster_email, generate_supplement_doc, reference_code_requirements, reply_to_adjuster',
      declaredIntent: 'Read adjuster email · State Farm claim 2024-1102 · logged to file',
      detectedIntent: 'adjuster_correspondence',
      action: 'ALLOW',
      rulesFired: [],
      attemptedAction: {
        tool: 'email_read',
        args: {
          claim_id: '2024-1102',
          adjuster: 'Sarah Mitchell',
          insurer: 'State Farm',
        },
      },
      lobsterTrapMetadata: cleanLT({ token_count: 134 }),
      agentmarshalContext: { tool_call: 'email_read' },
      metadata: {},
      rawInput:
        'From: sarah.mitchell@statefarm.com — Following up on claim 2024-1102 for the Reyes property. Need the supplement docs for the ridge vent code upgrade before I can release additional funds.',
      timestamp: at(165),
    },

    // 7 · claims — 2h30m ago — HUMAN_REVIEW supplement above threshold
    {
      agentId: 'claims',
      declaredScope:
        'read_adjuster_email, generate_supplement_doc, reference_code_requirements, reply_to_adjuster',
      declaredIntent:
        'Generate $6,800 storm damage supplement · code-required decking upgrade',
      detectedIntent: 'claim_supplement_generation',
      action: 'HUMAN_REVIEW',
      rulesFired: [
        {
          name: 'escalate_claim_supplement_review',
          flag: 'supplement_above_auto_approve',
          description: 'Claim supplement above auto-approve threshold',
        },
      ],
      attemptedAction: {
        tool: 'supplement_doc_generate',
        args: {
          claim_id: '2024-1102',
          customer: 'Reyes',
          insurer: 'State Farm',
          line_item: 'OSB decking replacement (IRC R803.2.1 code upgrade)',
          amount: 6800,
        },
      },
      lobsterTrapMetadata: cleanLT({ token_count: 118 }),
      agentmarshalContext: {
        tool_call: 'supplement_doc_generate',
        supplement_amount: 6800,
      },
      metadata: { escalate_to: 'operator' },
      rawInput:
        'Adjuster requested supplement for code-required decking upgrade on Reyes property. Storm uncovered rotted decking; IRC R803.2.1 requires replacement. Estimated $6,800.',
      dollarImpact: 6800,
      timestamp: at(150),
    },

    // 8 · quoting — 2h15m ago — quote with small repeat-customer discount
    {
      agentId: 'quoting',
      declaredScope: 'draft_quote, send_quote, apply_discount_up_to_10_percent',
      declaredIntent: 'Sent $11,200 quote to Nguyen residence · 5% repeat-customer discount',
      detectedIntent: 'quoting',
      action: 'ALLOW',
      rulesFired: [],
      attemptedAction: {
        tool: 'email_send_quote',
        args: {
          customer: 'Mrs. Nguyen',
          address: '3340 E Indian School Rd, Phoenix AZ',
          amount: 11200,
          discount_pct: 5,
          job: '22-square reroof + ridge vent',
        },
      },
      lobsterTrapMetadata: cleanLT({ token_count: 76 }),
      agentmarshalContext: {
        tool_call: 'send_quote',
        quote_margin: 0.39,
        quote_amount: 11200,
      },
      metadata: {},
      rawInput:
        'Generate quote for Mrs. Nguyen (repeat customer, 2021 inspection): 22-square reroof with ridge vent replacement, architectural asphalt. Apply standard 5% repeat-customer discount.',
      timestamp: at(135),
    },

    // 9 · comms — 2h ago — route HomeDepot Pro invoice
    {
      agentId: 'comms',
      declaredScope:
        'read_inbound_email, draft_reply, send_template_reply, classify_invoice, route_invoice_to_ap',
      declaredIntent: 'Routed $1,243.18 invoice from HomeDepot Pro to AP',
      detectedIntent: 'invoice_routing',
      action: 'ALLOW',
      rulesFired: [],
      attemptedAction: {
        tool: 'invoice_route_to_ap',
        args: {
          vendor: 'HomeDepot Pro',
          vendor_id: 'vendor_hd_002',
          amount: 1243.18,
          invoice_number: 'HD-4429106',
        },
      },
      lobsterTrapMetadata: cleanLT({ token_count: 84 }),
      agentmarshalContext: {
        tool_call: 'invoice_route_to_ap',
        vendor_domain_mismatch: false,
        sender_domain: 'homedepot.com',
      },
      metadata: {},
      rawInput:
        'HomeDepot Pro statement attached — order HD-4429106 for nails, caulk, and tarps. $1,243.18 charged to card on file.',
      timestamp: at(120),
    },

    // 10 · follow_up — 1h45m ago — review request for completed job
    {
      agentId: 'follow_up',
      declaredScope: 'send_review_request, send_drip_campaign, re_engage_cold_lead',
      declaredIntent: 'Sent review request for job #4421 · Mr. Garcia',
      detectedIntent: 'post_job_review',
      action: 'ALLOW',
      rulesFired: [],
      attemptedAction: {
        tool: 'sms_send_template',
        args: {
          template_id: 'review_request_v3',
          customer: 'Mr. Garcia',
          job_id: '4421',
          phone: '602-555-0173',
        },
      },
      lobsterTrapMetadata: cleanLT({ token_count: 42 }),
      agentmarshalContext: { tool_call: 'sms_send_template' },
      metadata: {},
      rawInput:
        'Job #4421 (Garcia, Pine Street) marked complete yesterday. Send the 5-star review request SMS.',
      timestamp: at(105),
    },

    // 11 · voice_scheduling — 1h30m ago — appointment confirmation
    {
      agentId: 'voice_scheduling',
      declaredScope:
        'answer_inbound_call, qualify_lead, schedule_appointment, send_appointment_confirmation',
      declaredIntent: 'Sent appointment confirmation SMS to Hendricks · Thu 2:00pm',
      detectedIntent: 'appointment_confirmation',
      action: 'ALLOW',
      rulesFired: [],
      attemptedAction: {
        tool: 'sms_send_template',
        args: {
          template_id: 'appt_confirm_v2',
          customer: 'Tom Hendricks',
          phone: '480-555-0144',
          start: '2026-05-14T14:00:00-07:00',
        },
      },
      lobsterTrapMetadata: cleanLT({ token_count: 39 }),
      agentmarshalContext: { tool_call: 'sms_send_template' },
      metadata: {},
      rawInput:
        'Confirm Thursday 2pm storm-damage assessment with Tom Hendricks. Send the standard confirmation SMS with address pin.',
      timestamp: at(90),
    },

    // 12 · quoting — 1h15m ago — another clean quote
    {
      agentId: 'quoting',
      declaredScope: 'draft_quote, send_quote, apply_discount_up_to_10_percent',
      declaredIntent: 'Sent $7,650 quote to Olsen residence · 44% margin',
      detectedIntent: 'quoting',
      action: 'ALLOW',
      rulesFired: [],
      attemptedAction: {
        tool: 'email_send_quote',
        args: {
          customer: 'Mr. Olsen',
          address: '6122 W Bell Rd, Glendale AZ',
          amount: 7650,
          job: '14-square partial reroof (south + west slopes)',
        },
      },
      lobsterTrapMetadata: cleanLT({ token_count: 68 }),
      agentmarshalContext: {
        tool_call: 'send_quote',
        quote_margin: 0.44,
        quote_amount: 7650,
      },
      metadata: {},
      rawInput:
        'Generate quote for Mr. Olsen at 6122 W Bell Rd, Glendale: 14-square partial reroof on the south and west slopes only. Same shingle as existing.',
      timestamp: at(75),
    },

    // 13 · comms — 1h ago — draft warranty reply
    {
      agentId: 'comms',
      declaredScope:
        'read_inbound_email, draft_reply, send_template_reply, classify_invoice, route_invoice_to_ap',
      declaredIntent: 'Drafted reply to Foster warranty inquiry · 2023 install',
      detectedIntent: 'warranty_inquiry',
      action: 'ALLOW',
      rulesFired: [],
      attemptedAction: {
        tool: 'email_reply_template',
        args: {
          template_id: 'warranty_inquiry_response',
          customer: 'Mrs. Foster',
          install_year: 2023,
          warranty_term: 'GAF 50-year manufacturer',
        },
      },
      lobsterTrapMetadata: cleanLT({ token_count: 96 }),
      agentmarshalContext: { tool_call: 'email_reply_template' },
      metadata: {},
      rawInput:
        'Mrs. Foster (install 2023) emailed asking whether a popped ridge cap is covered. Draft the standard "we\'ll come check it out under warranty" reply.',
      timestamp: at(60),
    },

    // 14 · follow_up — 30m ago — re-engage cold lead
    {
      agentId: 'follow_up',
      declaredScope: 'send_review_request, send_drip_campaign, re_engage_cold_lead',
      declaredIntent: 'Re-engaged 3 cold leads from Feb · seasonal-check template',
      detectedIntent: 'cold_lead_reengagement',
      action: 'ALLOW',
      rulesFired: [],
      attemptedAction: {
        tool: 'email_send_template',
        args: {
          template_id: 'cold_reengage_seasonal',
          segment: 'cold_q1_2026',
          recipient_count: 3,
        },
      },
      lobsterTrapMetadata: cleanLT({ token_count: 51 }),
      agentmarshalContext: { tool_call: 'email_send_template' },
      metadata: {},
      rawInput:
        'Send the seasonal-check re-engage email to cold_q1_2026 segment — leads who got an inspection in Feb but never booked the followup.',
      timestamp: at(30),
    },

    // 15 · claims — 5m ago — reply to adjuster with supporting docs (newest)
    {
      agentId: 'claims',
      declaredScope:
        'read_adjuster_email, generate_supplement_doc, reference_code_requirements, reply_to_adjuster',
      declaredIntent: 'Replied to adjuster Mitchell · State Farm claim 2024-0987 · docs attached',
      detectedIntent: 'adjuster_correspondence',
      action: 'ALLOW',
      rulesFired: [],
      attemptedAction: {
        tool: 'email_reply_to_adjuster',
        args: {
          claim_id: '2024-0987',
          adjuster: 'Sarah Mitchell',
          insurer: 'State Farm',
          attachments: ['IRC_R905.2.8.5_excerpt.pdf', 'photo_log_2024-0987.zip'],
        },
      },
      lobsterTrapMetadata: cleanLT({ token_count: 102 }),
      agentmarshalContext: { tool_call: 'email_reply_to_adjuster' },
      metadata: {},
      rawInput:
        'Reply to Sarah Mitchell on claim 2024-0987 (Henderson property) with the IRC R905.2.8.5 code excerpt and the photo log. She asked for both yesterday.',
      timestamp: at(5),
    },
  ];
}

function main(): void {
  // Wipe existing DB so IDs start at 1.
  unlinkIfExists(DB_PATH);
  unlinkIfExists(`${DB_PATH}-wal`);
  unlinkIfExists(`${DB_PATH}-shm`);

  // Make sure the parent dir exists (e.g. fresh clone).
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  init(DB_PATH);

  const now = Date.now();
  const entries = buildEntries(now);

  let humanReviewCount = 0;
  let allowCount = 0;
  const agents = new Set<string>();
  for (const e of entries) {
    append(e);
    agents.add(e.agentId);
    if (e.action === 'HUMAN_REVIEW') humanReviewCount++;
    else if (e.action === 'ALLOW') allowCount++;
  }

  console.log(
    `[seed-audit] seeded ${entries.length} rows (${humanReviewCount} HUMAN_REVIEW, ${allowCount} ALLOW) across ${agents.size} agents`,
  );
}

main();
