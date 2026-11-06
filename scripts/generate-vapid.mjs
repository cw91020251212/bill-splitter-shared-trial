import { createPrivateKey, generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('ec', { namedCurve:'prime256v1' });
const jwk = privateKey.export({ format:'jwk' });
const b64 = value => Buffer.from(value, 'base64url');
const publicKey = Buffer.concat([Buffer.from([4]), b64(jwk.x), b64(jwk.y)]).toString('base64url');
const privateKeyValue = jwk.d;
console.log('# Keep the private key secret; do not commit this output.');
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKeyValue}`);
