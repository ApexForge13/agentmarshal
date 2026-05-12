// The 5-agent demo fleet. Each entry is the agent's declared role and scope;
// scenarios.ts drives them with scripted activity, and the policy engine
// compares declared scope against the detected intent that LT extracts from
// the actual prompt/tool call.

import type { Agent } from '@/types';

export const FLEET: Agent[] = [
  // TODO: fill in real declared_scope for each agent.
  // Sketch:
  // {
  //   id: 'voice-scheduling',
  //   name: 'Voice & Scheduling',
  //   role: 'Books appointments and answers phone inquiries.',
  //   declared_scope: {
  //     can: ['read:calendar', 'write:calendar', 'send:sms_confirmation'],
  //     cannot: ['send:marketing', 'modify:pricing', 'exfiltrate:customer_data'],
  //     tools: ['calendar.create', 'calendar.read', 'sms.send_confirmation'],
  //     constraints: { max_sms_per_hour: 20 },
  //   },
  // },
];

export function getAgent(id: string): Agent | undefined {
  return FLEET.find((a) => a.id === id);
}
