// FileKeyProvider — dev/demo Ed25519 key custody.
// PEM files at <basePath>/agentmarshal-private.pem and agentmarshal-public.pem.
// Generated on first access if absent; loaded if both present; clear error if
// exactly one is present or PEMs are corrupted. Production deployments should
// use AwsKmsKeyProvider or GcpKmsKeyProvider so the private key never lives in
// application memory.

import { promises as fs, existsSync } from 'fs';
import { join } from 'path';
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as nodeSign,
  type KeyObject,
} from 'crypto';
import type {
  KeyMaterial,
  KeyProvider,
  SigningHandle,
  SignatureAlgorithm,
} from './provider';
import { publicKeyFingerprint, deriveKeyId } from './fingerprint';

export interface FileKeyProviderOptions {
  basePath?: string;
}

const DEFAULT_BASE_PATH = 'data/keys';
const PRIVATE_FILENAME = 'agentmarshal-private.pem';
const PUBLIC_FILENAME = 'agentmarshal-public.pem';
const ALGORITHM: SignatureAlgorithm = 'ed25519';

export class FileKeyProvider implements KeyProvider {
  private basePath: string;
  private handle: SigningHandle | null = null;

  constructor(options: FileKeyProviderOptions = {}) {
    this.basePath = options.basePath ?? DEFAULT_BASE_PATH;
  }

  async getActiveSigningHandle(): Promise<SigningHandle> {
    if (this.handle) return this.handle;

    const privatePath = join(this.basePath, PRIVATE_FILENAME);
    const publicPath = join(this.basePath, PUBLIC_FILENAME);

    const hasPrivate = existsSync(privatePath);
    const hasPublic = existsSync(publicPath);

    let privateKey: KeyObject;
    let publicKey: KeyObject;

    if (hasPrivate && hasPublic) {
      const [privatePem, publicPem] = await Promise.all([
        fs.readFile(privatePath, 'utf8'),
        fs.readFile(publicPath, 'utf8'),
      ]);
      try {
        privateKey = createPrivateKey(privatePem);
        publicKey = createPublicKey(publicPem);
      } catch (err) {
        throw new Error(
          `FileKeyProvider: failed to load PEM keys from ${this.basePath}: ${(err as Error).message}`,
        );
      }
    } else if (!hasPrivate && !hasPublic) {
      await fs.mkdir(this.basePath, { recursive: true });
      const pair = generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      await fs.writeFile(privatePath, pair.privateKey, { mode: 0o600 });
      await fs.writeFile(publicPath, pair.publicKey);
      privateKey = createPrivateKey(pair.privateKey);
      publicKey = createPublicKey(pair.publicKey);
    } else {
      const missing = hasPrivate ? PUBLIC_FILENAME : PRIVATE_FILENAME;
      throw new Error(`FileKeyProvider: missing ${missing} in ${this.basePath}`);
    }

    const rawPub = extractRawPublicKey(publicKey);
    const keyMaterial: KeyMaterial = {
      key_id: deriveKeyId(rawPub),
      algorithm: ALGORITHM,
      public_key_raw: rawPub,
      public_key_fingerprint: publicKeyFingerprint(rawPub),
      created_at: new Date().toISOString(),
    };

    this.handle = {
      keyMaterial,
      sign: async (canonicalBytes: Buffer): Promise<Buffer> => {
        return nodeSign(null, canonicalBytes, privateKey);
      },
    };

    return this.handle;
  }

  async getPublicKey(key_id: string): Promise<KeyMaterial | null> {
    const handle = await this.getActiveSigningHandle();
    return handle.keyMaterial.key_id === key_id ? handle.keyMaterial : null;
  }

  async listKeyIds(): Promise<string[]> {
    const handle = await this.getActiveSigningHandle();
    return [handle.keyMaterial.key_id];
  }
}

function extractRawPublicKey(publicKey: KeyObject): Buffer {
  const jwk = publicKey.export({ format: 'jwk' });
  if (typeof jwk.x !== 'string') {
    throw new Error('FileKeyProvider: expected Ed25519 JWK with x field');
  }
  return Buffer.from(jwk.x, 'base64url');
}
