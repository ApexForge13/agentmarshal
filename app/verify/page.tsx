// /verify — public Compliance Receipt verification tool.
//
// Server Component: loads the published public key and the example receipts at
// request time, hands them to the interactive Client Component. Demonstrates
// AgentMarshal's core differentiator — decisions are third-party-verifiable,
// cryptographically attestable, and checkable without trusting Marshal at all.

import { loadPublicKey } from '@/lib/verify/load-public-key';
import examples from '@/data/verify/example-receipts.json';
import { VerifyClient } from './verify-client';

export const dynamic = 'force-dynamic';

export default async function VerifyPage() {
  const { info } = await loadPublicKey();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-100">Verify a Compliance Receipt</h1>
      <p className="mt-2 max-w-2xl text-sm text-zinc-400">
        Every AgentMarshal decision is emitted as a signed Compliance Receipt (customer-touching
        agents) or Internal Audit envelope (internal agents). Paste one below and this tool
        verifies its Ed25519 signature against AgentMarshal&apos;s published public key, then
        surfaces the receipt&apos;s contents. Verification is independent — you do not have to
        trust AgentMarshal to confirm a receipt is authentic and unmodified.
      </p>

      <div className="mt-8">
        <VerifyClient publicKey={info} examples={examples as never} />
      </div>
    </main>
  );
}
