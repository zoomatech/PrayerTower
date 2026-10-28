// A stand-in for the App Store in tests: a throwaway certificate chain with the
// same Apple extension markers the App Store Server Library checks, so Apple's
// real verifier code runs against transactions signed here. Nothing here is
// trusted outside the test.
import { execFileSync } from 'node:child_process';
import { createPrivateKey, randomUUID, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Environment, SignedDataVerifier } from '@apple/app-store-server-library';

const EXT = `[root]
basicConstraints=critical,CA:true
keyUsage=critical,keyCertSign,cRLSign
[inter]
basicConstraints=critical,CA:true,pathlen:0
keyUsage=critical,keyCertSign,cRLSign
1.2.840.113635.100.6.2.1=ASN1:NULL
[leaf]
basicConstraints=critical,CA:false
keyUsage=critical,digitalSignature
1.2.840.113635.100.6.11.1=ASN1:NULL
`;

export const BUNDLE_ID = 'com.zoomatech.prayertower';

export function makeStoreKit(intermediateMarker = true) {
  const dir = mkdtempSync(join(tmpdir(), 'storekit-'));
  const f = (n: string) => join(dir, n);
  writeFileSync(f('ext.cnf'), intermediateMarker ? EXT : EXT.replace('1.2.840.113635.100.6.2.1=ASN1:NULL\n', ''));
  const ssl = (...args: string[]) => execFileSync('openssl', args, { cwd: dir, stdio: 'pipe' });
  for (const n of ['root', 'inter', 'leaf']) ssl('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', `${n}.key`);
  ssl('req', '-new', '-x509', '-key', 'root.key', '-subj', '/CN=Test Root (test only)', '-days', '3650', '-addext', 'basicConstraints=critical,CA:true', '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-out', 'root.pem');
  ssl('req', '-new', '-key', 'inter.key', '-subj', '/CN=Test Intermediate (test only)', '-out', 'inter.csr');
  ssl('x509', '-req', '-in', 'inter.csr', '-CA', 'root.pem', '-CAkey', 'root.key', '-CAcreateserial', '-days', '3650', '-extfile', 'ext.cnf', '-extensions', 'inter', '-out', 'inter.pem');
  ssl('req', '-new', '-key', 'leaf.key', '-subj', '/CN=Test StoreKit signing (test only)', '-out', 'leaf.csr');
  ssl('x509', '-req', '-in', 'leaf.csr', '-CA', 'inter.pem', '-CAkey', 'inter.key', '-CAcreateserial', '-days', '3650', '-extfile', 'ext.cnf', '-extensions', 'leaf', '-out', 'leaf.pem');
  ssl('x509', '-in', 'root.pem', '-outform', 'der', '-out', 'root.cer');
  const der = (n: string) => ssl('x509', '-in', `${n}.pem`, '-outform', 'der').toString('base64');
  const x5c = [der('leaf'), der('inter'), der('root')];
  const key = createPrivateKey(readFileSync(f('leaf.key')));
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

  /** ES256 JWS with the chain in x5c, as the App Store signs. */
  const signJws = (payload: object) => {
    const input = `${b64({ alg: 'ES256', x5c })}.${b64(payload)}`;
    return `${input}.${sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
  };

  return {
    rootPath: f('root.cer'),
    /** Apple's verifier trusting only this test root. Offline: dates are checked against signedDate. */
    verifier: new SignedDataVerifier([readFileSync(f('root.cer'))], false, Environment.SANDBOX, BUNDLE_ID),
    transaction: (o: { userId: string; productId: string; transactionId?: string; price?: number; currency?: string; type?: string; bundleId?: string; revocationDate?: number }) => {
      const now = Date.now();
      return signJws({
        transactionId: o.transactionId ?? String(2_000_000_000_000_000 + Math.floor(Math.random() * 1e9)),
        originalTransactionId: o.transactionId ?? randomUUID(),
        bundleId: o.bundleId ?? BUNDLE_ID,
        productId: o.productId,
        purchaseDate: now,
        originalPurchaseDate: now,
        quantity: 1,
        type: o.type ?? 'Consumable',
        appAccountToken: o.userId,
        inAppOwnershipType: 'PURCHASED',
        signedDate: now,
        environment: 'Sandbox',
        transactionReason: 'PURCHASE',
        storefront: 'USA',
        storefrontId: '143441',
        price: o.price ?? 990,
        currency: o.currency ?? 'USD',
        ...(o.revocationDate ? { revocationDate: o.revocationDate, revocationReason: 0 } : {}),
      });
    },
    notification: (type: string, signedTransactionInfo: string) =>
      signJws({
        notificationType: type,
        notificationUUID: randomUUID(),
        version: '2.0',
        signedDate: Date.now(),
        data: { bundleId: BUNDLE_ID, environment: 'Sandbox', signedTransactionInfo },
      }),
  };
}
