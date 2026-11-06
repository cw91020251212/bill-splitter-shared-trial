import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { buildPushPayload } from '@block65/webcrypto-web-push';
import { resultNotification } from '../worker/push-message.js';

globalThis.crypto ??= webcrypto;
const b64url = bytes => Buffer.from(bytes).toString('base64url');

const vapidPair = await crypto.subtle.generateKey({ name:'ECDSA', namedCurve:'P-256' }, true, ['sign','verify']);
const privateJwk = await crypto.subtle.exportKey('jwk', vapidPair.privateKey);
const publicJwk = await crypto.subtle.exportKey('jwk', vapidPair.publicKey);
const vapidPublic = b64url(Buffer.concat([Buffer.from([4]), Buffer.from(publicJwk.x, 'base64url'), Buffer.from(publicJwk.y, 'base64url')]));

const receiverPair = await crypto.subtle.generateKey({ name:'ECDH', namedCurve:'P-256' }, true, ['deriveBits']);
const receiverPublic = new Uint8Array(await crypto.subtle.exportKey('raw', receiverPair.publicKey));
const subscription = {
  endpoint:'https://fcm.googleapis.com/fcm/send/synthetic-only',
  expirationTime:null,
  keys:{ p256dh:b64url(receiverPublic), auth:b64url(crypto.getRandomValues(new Uint8Array(16))) },
};
const notice = resultNotification('https://example.invalid/bill?bill=synthetic');
assert.deepEqual(Object.keys(notice).sort(), ['body','title','url']);
assert.equal(notice.title, '分帳結果已準備好');
assert.equal(notice.body, '開啟分帳管家，查看你的個人結果。');
assert(!/HK\$|阿A|阿B|份|杯|\d{2,}/.test(JSON.stringify(notice)), 'notification text must not expose amounts or participant data');

const payload = await buildPushPayload(
  { data:JSON.stringify(notice), options:{ ttl:86400, urgency:'normal', topic:'bill-synthetic' } },
  subscription,
  { subject:'https://example.invalid/', publicKey:vapidPublic, privateKey:privateJwk.d },
);
assert.equal(payload.method?.toUpperCase(), 'POST');
assert.match(payload.headers['Content-Encoding'] || payload.headers['content-encoding'], /aes128gcm/);
assert.match(payload.headers.Authorization || payload.headers.authorization, /^vapid t=/);
assert(payload.body, 'encrypted request body must be produced');
console.log(JSON.stringify({ result:'ok',encryptedBodyBytes:payload.body.byteLength || payload.body.length,networkRequests:0,notice }, null, 2));
