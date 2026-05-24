import { describe, it, expect } from 'vitest';
import { AsnConvert } from '@peculiar/asn1-schema';
import { TimeStampReq, TimeStampResp, PKIStatusInfo } from '@peculiar/asn1-tsp';
import {
  buildTimeStampRequest,
  parseTimeStampResponse,
  parseTimeStampToken,
  TsaError,
  SHA256_OID,
} from '../../lib/compliance/timestamp/tsa-client';
import fixtures from './fixtures/freetsa-tokens.json';

const HASH = '7f711746ac8d6244b8feedda6aa50b409b3123b88f1048f6d7a3d7546deac6fa';

describe('tsa-client: TimeStampReq construction', () => {
  it('encodes a SHA-256 messageImprint over the receipt hash with certReq=true', () => {
    const der = buildTimeStampRequest(HASH);
    const req = AsnConvert.parse(der, TimeStampReq);
    expect(req.version).toBe(1);
    expect(req.messageImprint.hashAlgorithm.algorithm).toBe(SHA256_OID);
    expect(Buffer.from(req.messageImprint.hashedMessage.buffer).toString('hex')).toBe(HASH);
    expect(req.certReq).toBe(true);
  });

  it('is deterministic and rejects a non-32-byte hash', () => {
    expect(buildTimeStampRequest(HASH).equals(buildTimeStampRequest(HASH))).toBe(true);
    expect(() => buildTimeStampRequest('deadbeef')).toThrow(/32-byte/);
  });
});

describe('tsa-client: TimeStampResp / token parsing (mocked TSA response)', () => {
  // A real FreeTSA response captured offline (fixtures/freetsa-tokens.json).
  const respDer = Buffer.from(fixtures.receipt.responseB64, 'base64');

  it('extracts the token, genTime, and the stamped imprint from a granted response', () => {
    const parsed = parseTimeStampResponse(respDer);
    expect(parsed.imprintAlgOid).toBe(SHA256_OID);
    expect(parsed.imprintHashHex).toBe(fixtures.receipt.hashHex);
    expect(parsed.genTime).toBeInstanceOf(Date);
    expect(parsed.genTime.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed.tokenDer.length).toBeGreaterThan(100);

    // The extracted token re-parses to a TSTInfo with a SignerInfo.
    const token = parseTimeStampToken(parsed.tokenDer);
    expect(token.signerInfo).toBeDefined();
    expect(token.imprintHashHex).toBe(fixtures.receipt.hashHex);
  });

  it('throws TsaError when the TSA refuses the request (PKIStatus != granted)', () => {
    const rejected = new TimeStampResp({ status: new PKIStatusInfo({ status: 2 }) });
    const der = Buffer.from(AsnConvert.serialize(rejected));
    expect(() => parseTimeStampResponse(der)).toThrow(TsaError);
  });
});
