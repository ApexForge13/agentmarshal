// SHA-256 helpers used by fingerprinting and receipt body hashing.

import { createHash } from 'crypto';

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256Base64Url(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('base64url');
}
