// /verify — public Compliance Receipt verification tool.
//
// Server Component: loads the published public key and the example receipts at
// request time, hands them to the interactive Client Component.
//
// Bubble 15: Echo OS chrome. `body` is overflow-hidden under the design system,
// so this standalone page owns its own scroll container.

import { loadPublicKey } from '@/lib/verify/load-public-key';
import examples from '@/data/verify/example-receipts.json';
import { VerifyClient } from './verify-client';

export const dynamic = 'force-dynamic';

export default async function VerifyPage() {
  const { info } = await loadPublicKey();

  return (
    <main style={{ height: '100vh', overflow: 'auto', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px 64px' }}>
        <h1 className="page-title" style={{ fontSize: 22 }}>
          Verify a Compliance Receipt
        </h1>
        <p
          style={{
            marginTop: 10,
            maxWidth: 680,
            fontSize: 13,
            lineHeight: 1.7,
            color: 'var(--text-2)',
          }}
        >
          Every AgentMarshal decision is emitted as a signed Compliance Receipt (customer-touching
          agents) or Internal Audit envelope (internal agents). Paste one below and this tool
          verifies its Ed25519 signature against AgentMarshal&apos;s published public key, then
          surfaces the receipt&apos;s contents. Verification is independent — you do not have to
          trust AgentMarshal to confirm a receipt is authentic and unmodified.
        </p>

        <div style={{ marginTop: 28 }}>
          <VerifyClient publicKey={info} examples={examples as never} />
        </div>
      </div>
    </main>
  );
}
