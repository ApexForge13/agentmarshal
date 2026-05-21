#!/usr/bin/env python3
"""
AgentMarshal Compliance Receipt verifier — independent reference implementation.

Verifies that a receipt's receipt_hash matches its canonical form and that each
Ed25519 signature in receipt['signatures'] validates against a public key looked up
by key_id from a JWKS file (or a single PEM file passed directly).

This implementation depends only on the standard library plus two well-audited
PyPI packages:
    cryptography (PyCA) — Ed25519 primitives
    jcs                  — RFC 8785 JSON Canonicalization Scheme

It has no dependency on any AgentMarshal Python module. Customers and auditors
can run it on any receipt produced by AgentMarshal-TS (or any other compliant
implementation) and validate it offline.

Usage:
    python verify-receipt.py <receipt.json> --jwks <jwks.json>
    python verify-receipt.py <receipt.json> --pubkey-pem <public.pem>

Exit codes:
    0  All signatures verify; receipt_hash matches.
    1  Verification failed (signature, hash, or schema-shape).
    2  Argument or file error.

Prereqs:
    pip install cryptography>=42.0 jcs>=0.2.1
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import sys
from pathlib import Path
from typing import Optional

try:
    import jcs
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    from cryptography.hazmat.primitives.serialization import load_pem_public_key
except ImportError as e:
    print(f"missing prereq: {e}. Run: pip install cryptography jcs", file=sys.stderr)
    sys.exit(2)


def canonical_bytes(value) -> bytes:
    """RFC 8785 canonical bytes. jcs.canonicalize returns bytes."""
    result = jcs.canonicalize(value)
    if isinstance(result, str):
        return result.encode("utf-8")
    return result


def sha256_hex(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def b64url_decode(s: str) -> bytes:
    padding = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + padding)


def load_jwks(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    keys: dict = {}
    for jwk in data.get("keys", []):
        if jwk.get("kty") != "OKP" or jwk.get("crv") != "Ed25519":
            continue
        kid = jwk.get("kid")
        x = jwk.get("x")
        if not kid or not x:
            continue
        raw = b64url_decode(x)
        keys[kid] = Ed25519PublicKey.from_public_bytes(raw)
    return keys


def load_pem(path: Path) -> Ed25519PublicKey:
    key = load_pem_public_key(path.read_bytes())
    if not isinstance(key, Ed25519PublicKey):
        raise SystemExit(f"PEM at {path} is not an Ed25519 public key")
    return key


def verify_receipt(receipt: dict,
                   keys_by_id: Optional[dict],
                   pem_key: Optional[Ed25519PublicKey]) -> tuple:
    errors = []

    embedded_hash = receipt.get("receipt_hash")
    if not embedded_hash:
        return False, ["receipt has no receipt_hash field"]
    without_hash = {k: v for k, v in receipt.items() if k != "receipt_hash"}
    computed_hash = sha256_hex(canonical_bytes(without_hash))
    if computed_hash != embedded_hash:
        errors.append(
            f"receipt_hash mismatch: embedded={embedded_hash} computed={computed_hash}"
        )
        return False, errors

    signed_body = {
        k: v for k, v in receipt.items()
        if k not in ("receipt_hash", "signatures")
    }
    signed_canonical = canonical_bytes(signed_body)

    sigs = receipt.get("signatures") or []
    if not sigs:
        return False, ["receipt has no signatures"]

    for sig in sigs:
        algo = sig.get("algorithm")
        if algo != "ed25519":
            errors.append(f"unsupported algorithm: {algo}")
            continue
        key_id = sig.get("key_id")
        role = sig.get("signer_role", "<unknown>")

        public_key = None
        if keys_by_id is not None:
            public_key = keys_by_id.get(key_id)
            if public_key is None:
                errors.append(f"no public key for key_id={key_id} role={role}")
                continue
        elif pem_key is not None:
            public_key = pem_key
        else:
            errors.append("no key source available")
            continue

        signature_bytes = bytes.fromhex(sig.get("signature", ""))
        try:
            public_key.verify(signature_bytes, signed_canonical)
        except InvalidSignature:
            errors.append(
                f"signature did not verify: role={role} key_id={key_id}"
            )

    return (len(errors) == 0), errors


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify an AgentMarshal Compliance Receipt."
    )
    parser.add_argument("receipt", help="Path to receipt JSON")
    parser.add_argument(
        "--jwks",
        help="Path to JWKS file containing the verifying public key(s)",
    )
    parser.add_argument(
        "--pubkey-pem",
        help="Path to a single Ed25519 public key PEM",
    )
    args = parser.parse_args()

    if not args.jwks and not args.pubkey_pem:
        print("must pass --jwks or --pubkey-pem", file=sys.stderr)
        return 2

    receipt_path = Path(args.receipt)
    if not receipt_path.is_file():
        print(f"receipt file not found: {receipt_path}", file=sys.stderr)
        return 2

    try:
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"receipt is not valid JSON: {e}", file=sys.stderr)
        return 2

    keys_by_id = load_jwks(Path(args.jwks)) if args.jwks else None
    pem_key = load_pem(Path(args.pubkey_pem)) if args.pubkey_pem else None

    ok, errors = verify_receipt(receipt, keys_by_id, pem_key)
    if ok:
        print("OK")
        return 0
    for err in errors:
        print(f"FAIL: {err}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
