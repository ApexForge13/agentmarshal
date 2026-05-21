import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const REPO_ROOT = join(__dirname, '..', '..', '..');
const VERIFIER = join(REPO_ROOT, 'tools', 'verify-receipt.py');
const GOLDEN_RECEIPT = join(REPO_ROOT, 'tests', 'vectors', 'golden-receipt.json');
const GOLDEN_JWKS = join(REPO_ROOT, 'tests', 'vectors', 'golden-jwks.json');

function pythonReady(): boolean {
  try {
    execSync('python3 --version', { stdio: 'ignore' });
    execSync('python3 -c "import jcs, cryptography"', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const PYTHON_AVAILABLE = pythonReady();
const skipIfNoPython = PYTHON_AVAILABLE ? it : it.skip;

function runVerifier(receiptPath: string): { status: number | null; stderr: string; stdout: string } {
  const result = spawnSync('python3', [VERIFIER, receiptPath, '--jwks', GOLDEN_JWKS], {
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
  };
}

describe('cross-implementation Python verifier', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'agentmarshal-cross-impl-'));
  });

  afterEach(() => {
    if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true });
  });

  skipIfNoPython('accepts the unmodified golden receipt', () => {
    const { status, stdout, stderr } = runVerifier(GOLDEN_RECEIPT);
    expect(status, `stderr: ${stderr}`).toBe(0);
    expect(stdout).toContain('OK');
  });

  skipIfNoPython('rejects a receipt with a tampered body field', () => {
    const receipt = JSON.parse(readFileSync(GOLDEN_RECEIPT, 'utf8'));
    receipt.decision.reason = 'TAMPERED reason';
    const tamperedPath = join(tempDir, 'tampered-body.json');
    writeFileSync(tamperedPath, JSON.stringify(receipt));
    const { status, stderr } = runVerifier(tamperedPath);
    expect(status).toBe(1);
    expect(stderr).toMatch(/(receipt_hash mismatch|signature did not verify)/);
  });

  skipIfNoPython('rejects a receipt with a tampered receipt_hash', () => {
    const receipt = JSON.parse(readFileSync(GOLDEN_RECEIPT, 'utf8'));
    receipt.receipt_hash = 'b'.repeat(64);
    const tamperedPath = join(tempDir, 'tampered-hash.json');
    writeFileSync(tamperedPath, JSON.stringify(receipt));
    const { status, stderr } = runVerifier(tamperedPath);
    expect(status).toBe(1);
    expect(stderr).toMatch(/receipt_hash mismatch/);
  });
});
