import { describe, it, expect, beforeEach } from 'vitest';
import { registerAllCanspamComposites } from '../../../lib/compliance/predicates/canspam';
import { clearComposites, getComposite } from '../../../lib/authzen/composite-dispatch';

const EXPECTED_NAMES = [
  'canspam_unsubscribe_link_present',
  'canspam_unsubscribe_mechanism_working',
  'canspam_postal_address_present',
  'canspam_sender_id_truthful',
  'canspam_subject_line_not_deceptive',
  'canspam_advertisement_disclosure_present',
];

describe('CAN-SPAM composite registry', () => {
  beforeEach(() => {
    clearComposites();
  });

  it('registerAllCanspamComposites populates 6 entries in the registry', () => {
    registerAllCanspamComposites();
    const resolved = EXPECTED_NAMES.map((name) => getComposite(name));
    expect(resolved.filter(Boolean).length).toBe(6);
  });

  it('each CAN-SPAM predicate name resolves to a predicate with a callable evaluate', () => {
    registerAllCanspamComposites();
    for (const name of EXPECTED_NAMES) {
      const predicate = getComposite(name);
      expect(predicate, `predicate ${name} should be registered`).toBeDefined();
      expect(predicate?.name).toBe(name);
      expect(typeof predicate?.evaluate).toBe('function');
    }
  });
});
