import { describe, it, expect, beforeEach } from 'vitest';
import { registerAllTcpaComposites } from '../../../lib/compliance/predicates/tcpa';
import { clearComposites, getComposite } from '../../../lib/authzen/composite-dispatch';

const EXPECTED_NAMES = [
  'tcpa_quiet_hours_respected',
  'tcpa_dnc_registry_clear',
  'tcpa_consent_present',
  'tcpa_revocation_honored',
  'tcpa_caller_id_disclosed',
  'tcpa_robocall_disclosure_present',
];

describe('TCPA composite registry', () => {
  beforeEach(() => {
    clearComposites();
  });

  it('registerAllTcpaComposites populates 6 entries in the registry', () => {
    registerAllTcpaComposites();
    const resolved = EXPECTED_NAMES.map((name) => getComposite(name));
    expect(resolved.filter(Boolean).length).toBe(6);
  });

  it('each TCPA predicate name resolves to a predicate with a callable evaluate', () => {
    registerAllTcpaComposites();
    for (const name of EXPECTED_NAMES) {
      const predicate = getComposite(name);
      expect(predicate, `predicate ${name} should be registered`).toBeDefined();
      expect(predicate?.name).toBe(name);
      expect(typeof predicate?.evaluate).toBe('function');
    }
  });
});
