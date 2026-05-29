# Recording-day checklist

Run this sequence against the live demo immediately before you start recording.
It confirms the deployed environment serves the captured receipt chain and that
the cold-open verify/tamper beat works end to end. If any step does not match
its expected outcome, STOP and follow the halt instruction; do not record until
it passes.

Target: https://demo.agentmarshal.dev
App: agentmarshal-demo (Fly.io)

## Step 0 - machine is up

    fly status -a agentmarshal-demo

Expected: one machine, STATE = started, on the latest VERSION.
Halt if not: run `fly deploy -a agentmarshal-demo`, wait for health checks, retry.

## Step 1 - key parity (the cold open depends on this)

    curl -sS https://demo.agentmarshal.dev/api/verify/public-key

Expected: JSON with
  key_id = am-4FgvUVvFdHqy5mSta_Tyr3RjRO0P6Sk_yL2lGloxMgU
  public_key_fingerprint = 8d7ec859d6e00ecabcad3474442b35cf39c528f7a29f56566989e8c436118fe5
Halt if not: the deployed signing key does not match the captured fixtures, so
the unmodified fixture will fail verification on camera. Re-seed the local key
onto the Fly volume at /app/data/keys/ and restart the machine, then retry from
Step 1. (See the key-parity procedure used in Bubble 24.)

## Step 2 - receipt browser renders the chain

Open https://demo.agentmarshal.dev/receipts in the browser.

Expected: the left rail lists four signed receipts (Helix Bridge, Meridian,
Northwind, governance denial). The detail panel shows sections for the receipt
fields, Bright Data calls, Hash chain, and Tamper-edit. Headless equivalent:

    curl -sS -o /tmp/r.html -w "HTTP %{http_code}\n" https://demo.agentmarshal.dev/receipts
    grep -c "Tamper-edit" /tmp/r.html

Expected: HTTP 200 and the markers Receipts, Bright Data calls, Hash chain,
Tamper-edit are all present.
Halt if not: an empty list means the demo receipts are not on the Fly volume.
Re-seed data/demo-receipts/*.json onto /app/data/demo-receipts/ and retry.

## Step 3 - cold open: the unmodified Helix receipt verifies true

In the browser, select the Helix Bridge receipt and click Verify. Headless
equivalent (wraps the fixture body the page uses):

    curl -sS -X POST https://demo.agentmarshal.dev/api/verify/receipt \
      -H 'Content-Type: application/json' \
      --data-binary @<(python3 -c "import json;print(json.dumps({'receipt':json.load(open('data/demo-receipts/helix-bridge-fail.json'))}))")

Expected: verified = true, reason "signature valid: receipt is authentic and
unmodified", timestamp.status = timestamped with a FreeTSA genTime
(2026-05-28T20:32:56Z for the captured Helix fixture). On screen this is the
green VERIFIED state.
Halt if not: do not record. Re-check Step 1 (key parity) first; a signature
mismatch here almost always means the deployed key drifted from the fixture.

## Step 4 - tamper-edit: one character flips the verdict

In the Tamper-edit panel, change a single character of the model reasoning and
re-verify. For the on-camera beat, just edit one character in the UI; the UI
re-POSTs to the same /api/verify/receipt endpoint. Headless equivalent (flips
the first character of the signed llm_reasoning field, then verifies):

    python3 - <<'PY' > /tmp/tampered.json
    import json
    d = json.load(open('data/demo-receipts/helix-bridge-fail.json'))
    def flip(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k == 'llm_reasoning' and isinstance(v, str):
                    o[k] = 'X' + v[1:]
                    return True
                if flip(v):
                    return True
        elif isinstance(o, list):
            for x in o:
                if flip(x):
                    return True
        return False
    flip(d)
    print(json.dumps({'receipt': d}))
    PY
    curl -sS -X POST https://demo.agentmarshal.dev/api/verify/receipt \
      -H 'Content-Type: application/json' --data-binary @/tmp/tampered.json

Expected: verified = false, reason contains "signature mismatch". On screen this
is the red TAMPERED state.
Halt if not: if it still shows verified true after an edit, the edited field is
not part of the signed body; pick a field inside the signed receipt (the model
reasoning is signed) and retry.

## Step 5 - the rest of the chain verifies true (optional, do once before the day)

POST each of northwind-clean, meridian-collision, and
governance-deny-passthrough the same way as Step 3.

Expected: all return verified = true with a FreeTSA timestamp.
Halt if not: re-seed that fixture onto the volume and retry.

## Green-light criteria

Record only when Steps 0 through 4 all pass: machine up, key_id matches,
/receipts shows four receipts, the unmodified Helix receipt is VERIFIED with a
FreeTSA timestamp, and a one-character edit flips it to TAMPERED with a signature
mismatch.
