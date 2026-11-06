var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// node_modules/uint8array-extras/index.js
var objectToString = Object.prototype.toString;
var uint8ArrayStringified = "[object Uint8Array]";
var arrayBufferStringified = "[object ArrayBuffer]";
function isType(value, typeConstructor, typeStringified) {
  if (!value) {
    return false;
  }
  if (value.constructor === typeConstructor) {
    return true;
  }
  return objectToString.call(value) === typeStringified;
}
__name(isType, "isType");
function isUint8Array(value) {
  return isType(value, Uint8Array, uint8ArrayStringified);
}
__name(isUint8Array, "isUint8Array");
function isArrayBuffer(value) {
  return isType(value, ArrayBuffer, arrayBufferStringified);
}
__name(isArrayBuffer, "isArrayBuffer");
function isUint8ArrayOrArrayBuffer(value) {
  return isUint8Array(value) || isArrayBuffer(value);
}
__name(isUint8ArrayOrArrayBuffer, "isUint8ArrayOrArrayBuffer");
function toUint8ArrayIfArrayBuffer(value) {
  return isArrayBuffer(value) ? new Uint8Array(value) : value;
}
__name(toUint8ArrayIfArrayBuffer, "toUint8ArrayIfArrayBuffer");
function assertUint8ArrayOrArrayBuffer(value) {
  if (!isUint8ArrayOrArrayBuffer(value)) {
    throw new TypeError(`Expected \`Uint8Array\` or \`ArrayBuffer\`, got \`${typeof value}\``);
  }
}
__name(assertUint8ArrayOrArrayBuffer, "assertUint8ArrayOrArrayBuffer");
function toUint8Array(value) {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError(`Unsupported value, got \`${typeof value}\`.`);
}
__name(toUint8Array, "toUint8Array");
function concatUint8Arrays(arrays, totalLength) {
  if (arrays.length === 0) {
    return new Uint8Array(0);
  }
  totalLength ??= arrays.reduce((accumulator, currentValue) => accumulator + currentValue.byteLength, 0);
  const returnValue = new Uint8Array(totalLength);
  let offset = 0;
  for (let array of arrays) {
    assertUint8ArrayOrArrayBuffer(array);
    array = toUint8ArrayIfArrayBuffer(array);
    returnValue.set(array, offset);
    offset += array.length;
  }
  return returnValue;
}
__name(concatUint8Arrays, "concatUint8Arrays");
var cachedDecoders = {
  utf8: new globalThis.TextDecoder("utf8")
};
function assertString(value) {
  if (typeof value !== "string") {
    throw new TypeError(`Expected \`string\`, got \`${typeof value}\``);
  }
}
__name(assertString, "assertString");
var cachedEncoder = new globalThis.TextEncoder();
function stringToUint8Array(string) {
  assertString(string);
  return cachedEncoder.encode(string);
}
__name(stringToUint8Array, "stringToUint8Array");
function base64ToBase64Url(base64) {
  return base64.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
__name(base64ToBase64Url, "base64ToBase64Url");
function base64UrlToBase64(base64url) {
  const base64 = base64url.replaceAll("-", "+").replaceAll("_", "/");
  const padding = (4 - base64.length % 4) % 4;
  return base64 + "=".repeat(padding);
}
__name(base64UrlToBase64, "base64UrlToBase64");
var MAX_BLOCK_SIZE = 65535;
function uint8ArrayToBase64(array, { urlSafe = false } = {}) {
  assertUint8ArrayOrArrayBuffer(array);
  array = toUint8ArrayIfArrayBuffer(array);
  let base64 = "";
  for (let index = 0; index < array.length; index += MAX_BLOCK_SIZE) {
    const chunk = array.subarray(index, index + MAX_BLOCK_SIZE);
    base64 += globalThis.btoa(String.fromCodePoint.apply(void 0, chunk));
  }
  return urlSafe ? base64ToBase64Url(base64) : base64;
}
__name(uint8ArrayToBase64, "uint8ArrayToBase64");
function base64ToUint8Array(base64String) {
  assertString(base64String);
  return Uint8Array.from(globalThis.atob(base64UrlToBase64(base64String)), (x) => x.codePointAt(0));
}
__name(base64ToUint8Array, "base64ToUint8Array");
var byteToHexLookupTable = Array.from({ length: 256 }, (_, index) => index.toString(16).padStart(2, "0"));

// node_modules/@block65/webcrypto-web-push/dist/lib/utils.js
function encodeRecordSize(size) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, size);
  return bytes;
}
__name(encodeRecordSize, "encodeRecordSize");
function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
__name(invariant, "invariant");

// node_modules/@block65/webcrypto-web-push/dist/lib/client-keys.js
async function deriveClientKeys(sub) {
  const bytes = base64ToUint8Array(sub.keys.p256dh);
  const authSecretBytes = base64ToUint8Array(sub.keys.auth);
  invariant(bytes.byteLength === 65 && bytes[0] === 4, "Subscription p256dh is not an uncompressed P-256 point");
  invariant(authSecretBytes.byteLength === 16, "Subscription auth secret is not 16 bytes");
  return {
    publicKeyBytes: bytes,
    publicKey: await crypto.subtle.importKey("raw", bytes, {
      name: "ECDH",
      namedCurve: "P-256"
    }, false, []),
    authSecretBytes
  };
}
__name(deriveClientKeys, "deriveClientKeys");

// node_modules/@block65/webcrypto-web-push/dist/lib/hkdf.js
function createHMAC(data) {
  const keyPromise = crypto.subtle.importKey("raw", data, {
    name: "HMAC",
    hash: "SHA-256"
  }, false, ["sign"]);
  return {
    hash: /* @__PURE__ */ __name(async (input) => {
      const k = await keyPromise;
      return crypto.subtle.sign("HMAC", k, input);
    }, "hash")
  };
}
__name(createHMAC, "createHMAC");
async function hkdf(salt, ikm) {
  const prkhPromise = createHMAC(salt).hash(ikm).then((prk) => createHMAC(prk));
  return {
    extract: /* @__PURE__ */ __name(async (info, len) => {
      const prkh = await prkhPromise;
      const blocks = await Array.from({ length: Math.ceil(len / 32) }, (_, i) => i).reduce(async (acc, i) => {
        const previous = await acc;
        const hash = await prkh.hash(new Uint8Array([...previous.at(-1) ?? [], ...info, i + 1]));
        return [...previous, new Uint8Array(hash)];
      }, Promise.resolve([]));
      return concatUint8Arrays(blocks).slice(0, len);
    }, "extract")
  };
}
__name(hkdf, "hkdf");

// node_modules/@block65/webcrypto-web-push/dist/lib/info.js
function createKeyInfo(clientPublic, serverPublic) {
  return new Uint8Array([
    ...stringToUint8Array("WebPush: info\0"),
    ...clientPublic,
    ...serverPublic
  ]);
}
__name(createKeyInfo, "createKeyInfo");
function createInfo(type) {
  return stringToUint8Array(`Content-Encoding: ${type}\0`);
}
__name(createInfo, "createInfo");

// node_modules/@block65/webcrypto-web-push/dist/lib/local-keys.js
async function generateLocalKeys() {
  const keyPair = await crypto.subtle.generateKey({
    name: "ECDH",
    namedCurve: "P-256"
  }, false, ["deriveBits"]);
  return {
    privateKey: keyPair.privateKey,
    publicKeyBytes: new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey))
  };
}
__name(generateLocalKeys, "generateLocalKeys");

// node_modules/@block65/webcrypto-web-push/dist/lib/salt.js
async function getSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}
__name(getSalt, "getSalt");

// node_modules/@block65/webcrypto-web-push/dist/lib/encrypt.js
var recordSize = 4096;
var headerSize = 21 + 65;
var maxPlaintextSize = recordSize - headerSize - 17;
async function encryptNotification(subscription, plaintext, options = {}) {
  invariant(plaintext.byteLength <= maxPlaintextSize, `Payload is ${plaintext.byteLength} bytes, the maximum is ${maxPlaintextSize}`);
  const clientKeys = await deriveClientKeys(subscription);
  const salt = await getSalt();
  const localKeys = await generateLocalKeys();
  const sharedSecret = await crypto.subtle.deriveBits({
    name: "ECDH",
    public: clientKeys.publicKey
  }, localKeys.privateKey, 256);
  const keyInfo = createKeyInfo(clientKeys.publicKeyBytes, localKeys.publicKeyBytes);
  const cekInfo = createInfo("aes128gcm");
  const nonceInfo = createInfo("nonce");
  const ikmHkdf = await hkdf(clientKeys.authSecretBytes, sharedSecret);
  const ikm = await ikmHkdf.extract(keyInfo, 32);
  const messageHkdf = await hkdf(salt, ikm);
  const cekBytes = await messageHkdf.extract(cekInfo, 16);
  const nonceBytes = await messageHkdf.extract(nonceInfo, 12);
  const cekCryptoKey = await crypto.subtle.importKey("raw", cekBytes, {
    name: "AES-GCM",
    length: 128
  }, false, ["encrypt"]);
  const padTo = options.pad ?? true ? maxPlaintextSize : plaintext.byteLength;
  const padded = new Uint8Array(padTo + 1);
  padded.set(plaintext);
  padded[plaintext.byteLength] = 2;
  const encrypted = await crypto.subtle.encrypt({
    name: "AES-GCM",
    iv: nonceBytes
  }, cekCryptoKey, padded);
  return new Uint8Array([
    ...salt,
    ...encodeRecordSize(recordSize),
    localKeys.publicKeyBytes.byteLength,
    ...localKeys.publicKeyBytes,
    ...new Uint8Array(encrypted)
  ]);
}
__name(encryptNotification, "encryptNotification");

// node_modules/@block65/webcrypto-web-push/dist/lib/base64.js
function encodeBase64Url(value) {
  return uint8ArrayToBase64(toUint8Array(value), { urlSafe: true });
}
__name(encodeBase64Url, "encodeBase64Url");
function objectToBase64Url(obj) {
  return encodeBase64Url(stringToUint8Array(JSON.stringify(obj)));
}
__name(objectToBase64Url, "objectToBase64Url");

// node_modules/@block65/webcrypto-web-push/dist/lib/jwt.js
async function sign(payload, key) {
  const headerStr = objectToBase64Url({
    typ: "JWT",
    alg: "ES256"
  });
  const payloadStr = objectToBase64Url({
    iat: Math.floor(Date.now() / 1e3),
    ...payload
  });
  const dataStr = `${headerStr}.${payloadStr}`;
  const signature = await crypto.subtle.sign({
    name: "ECDSA",
    hash: "SHA-256"
  }, key, stringToUint8Array(dataStr));
  return `${dataStr}.${encodeBase64Url(signature)}`;
}
__name(sign, "sign");

// node_modules/@block65/webcrypto-web-push/dist/lib/vapid.js
async function vapidHeaders(subscription, vapid) {
  invariant(vapid.subject, "Vapid subject is empty");
  invariant(vapid.privateKey, "Vapid private key is empty");
  invariant(vapid.publicKey, "Vapid public key is empty");
  const endpoint = new URL(subscription.endpoint);
  invariant(endpoint.protocol === "https:", `Subscription endpoint is not https: ${endpoint.protocol}`);
  const vapidPublicKeyBytes = base64ToUint8Array(vapid.publicKey);
  const publicKey = await crypto.subtle.importKey("jwk", {
    kty: "EC",
    crv: "P-256",
    x: encodeBase64Url(vapidPublicKeyBytes.slice(1, 33)),
    y: encodeBase64Url(vapidPublicKeyBytes.slice(33, 65)),
    d: vapid.privateKey
  }, {
    name: "ECDSA",
    namedCurve: "P-256"
  }, false, ["sign"]);
  const jwt = await sign({
    aud: endpoint.origin,
    exp: Math.floor(Date.now() / 1e3) + 12 * 60 * 60,
    sub: vapid.subject
  }, publicKey);
  return {
    headers: {
      authorization: `vapid t=${jwt}, k=${vapid.publicKey}`
    }
  };
}
__name(vapidHeaders, "vapidHeaders");

// node_modules/@block65/webcrypto-web-push/dist/lib/payload.js
async function buildPushPayload(message, subscription, vapid) {
  const { headers } = await vapidHeaders(subscription, vapid);
  const body = await encryptNotification(subscription, stringToUint8Array(
    // if its a primitive, convert to string, otherwise stringify
    typeof message.data === "string" || typeof message.data === "number" ? message.data.toString() : JSON.stringify(message.data)
  ));
  return {
    headers: {
      ...headers,
      ttl: (message.options?.ttl || 60).toString(),
      ...message.options?.urgency && {
        urgency: message.options.urgency
      },
      ...message.options?.topic && {
        topic: message.options.topic
      },
      "content-encoding": "aes128gcm",
      "content-length": body.byteLength.toString(),
      "content-type": "application/octet-stream"
    },
    method: "post",
    body
  };
}
__name(buildPushPayload, "buildPushPayload");

// worker/push-message.js
function resultNotification(url) {
  return {
    title: "\u5206\u5E33\u7D50\u679C\u5DF2\u6E96\u5099\u597D",
    body: "\u958B\u555F\u5206\u5E33\u7BA1\u5BB6\uFF0C\u67E5\u770B\u4F60\u7684\u500B\u4EBA\u7D50\u679C\u3002",
    url: String(url)
  };
}
__name(resultNotification, "resultNotification");

// worker/static-assets.js
var STATIC_ASSETS = { "/index.html": { "contentType": "text/html; charset=utf-8", "text": '<!doctype html>\n<html lang="zh-Hant-HK">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n  <meta name="theme-color" content="#f5f8f6">\n  <meta name="apple-mobile-web-app-capable" content="yes">\n  <meta name="apple-mobile-web-app-title" content="\u5206\u5E33\u7BA1\u5BB6">\n  <meta name="api-base" content="">\n  <meta name="description" content="\u5206\u5E33\u7BA1\u5BB6\u5171\u7528\u6E2C\u8A66\u7248">\n  <title>\u5206\u5E33\u7BA1\u5BB6\uFF5C\u5171\u7528\u6E2C\u8A66\u7248</title>\n  <link rel="manifest" href="manifest.webmanifest">\n  <link rel="apple-touch-icon" href="icon.png">\n  <link rel="stylesheet" href="style.css">\n  <script type="module" src="app.js"><\/script>\n</head>\n<body>\n  <main class="shell">\n    <div class="topline">\n      <a class="brand" href="./?bill=sample-dinner" aria-label="\u5206\u5E33\u7BA1\u5BB6\u9996\u9801">\n        <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" role="img"><rect x="5" y="3" width="14" height="18" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 7h8M8.5 11h1m5 0h1m-6 4h1m5 0h1m-6 3h1m5 0h1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span>\n        <span>\u5206\u5E33\u7BA1\u5BB6</span>\n      </a>\n      <div class="top-actions">\n        <span class="state-badge" id="stateBadge">\u586B\u5BEB\u4E2D</span>\n        <button class="role-button" id="friendTab" type="button" hidden>\u670B\u53CB\u9801</button>\n      </div>\n    </div>\n    <header class="hero">\n      <p class="eyebrow" id="categoryTag">\u9031\u672B\u805A\u9910</p>\n      <h1 id="screenTitle">\u586B\u5BEB\u4F60\u7684\u5206\u5E33</h1>\n      <p class="hero-copy" id="screenCopy">\u9078\u64C7\u540D\u5B57\uFF0C\u52A0\u5165\u81EA\u5DF1\u7684\u9805\u76EE\u8207\u4EFD\u91CF\u3002</p>\n    </header>\n    <p class="connection-status" id="connectionStatus" role="status" aria-live="polite">\u6B63\u5728\u9023\u63A5\u5171\u7528\u5E33\u55AE\u2026</p>\n    <section id="friendView" aria-label="\u670B\u53CB\u5206\u5E33"></section>\n    <section id="managerView" class="hidden" aria-label="\u7BA1\u7406\u8005\u5C08\u7528"></section>\n    <footer class="foot"><span>\u865B\u69CB\u8CC7\u6599 \xB7 \u5171\u7528\u8A66\u7528\u7248</span><span>\u5E33\u55AE\u5B58\u65BC\u5171\u7528\u4F3A\u670D\u5668</span></footer>\n  </main>\n  <dialog class="confirm-dialog" id="deleteConfirmDialog" aria-labelledby="deleteConfirmTitle" aria-describedby="deleteConfirmCopy" aria-modal="true">\n    <div class="confirm-panel">\n      <p class="confirm-kicker">\u522A\u9664\u78BA\u8A8D</p>\n      <h2 class="confirm-title" id="deleteConfirmTitle">\u78BA\u5B9A\u8981\u522A\u9664\uFF1F</h2>\n      <p class="confirm-copy" id="deleteConfirmCopy"></p>\n      <div class="confirm-actions"><button class="button secondary" id="cancelDelete" type="button" autofocus>\u4FDD\u7559</button><button class="button danger" id="confirmDelete" type="button">\u522A\u9664</button></div>\n    </div>\n  </dialog>\n  <div class="toast" id="toast" role="status" aria-live="polite"></div>\n</body>\n</html>\n' }, "/app.js": { "contentType": "text/javascript; charset=utf-8", "text": `const DEFAULT_BILL = 'sample-dinner';
const TOKEN_PREFIX = 'shared-bill-device:';
const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\\/$/, '');
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
const money = cents => 'HK$' + (Number(cents || 0) / 100).toLocaleString('zh-HK', { minimumFractionDigits:2, maximumFractionDigits:2 });
const billId = new URLSearchParams(location.search).get('bill') || DEFAULT_BILL;
const encodedBill = encodeURIComponent(billId);
let publicData = null;
let activeView = new URLSearchParams(location.search).get('manage') === '1' || location.pathname.endsWith('/manage') ? 'manager' : 'friend';
let selectedFriendId = '';
let friendPanel = null;
let activePin = '';
let activeOwnerToken = '';
let adminKey = '';
let managerData = null;
let pendingDelete = null;
let deleteReturnFocus = null;
let selectingFriend = false;
let toastTimer;
let pushConfig = { enabled:false, applicationServerKey:'' };
let pushRegistration = null;
let pushDeviceSubscription = null;

function deviceKey(friendId) { return \`\${TOKEN_PREFIX}\${billId}:\${friendId}\`; }
function flash(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}
async function api(path, { method='GET', body, admin=false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (admin && adminKey) headers.Authorization = \`Bearer \${adminKey}\`;
  const response = await fetch(\`\${API_BASE}\${path}\`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache:'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || \`\u4F3A\u670D\u5668\u56DE\u61C9 \${response.status}\`);
    error.code = payload.error || 'request_failed';
    error.status = response.status;
    throw error;
  }
  return payload;
}
async function initPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
  try {
    const config = await api('/api/push-config');
    if (!config.enabled || !config.applicationServerKey) return;
    pushConfig = config;
    pushRegistration = await navigator.serviceWorker.register(new URL('service-worker.js', document.baseURI), {
      scope:new URL('.', document.baseURI).pathname,
    });
    if (friendPanel?.mode === 'saved') renderFriendView();
  } catch { pushConfig = { enabled:false, applicationServerKey:'' }; }
}
function pushControlMarkup() {
  if (!pushConfig.enabled || !pushRegistration || !selectedFriendId || publicData?.status === 'final') return '';
  return \`<section class="push-card" aria-label="\u7D50\u7B97\u7D50\u679C\u901A\u77E5"><div class="push-card-heading"><div><h3>\u7D50\u679C\u901A\u77E5</h3><p>\u7531\u4F60\u81EA\u884C\u9078\u64C7\uFF0C\u4EA6\u53EF\u96A8\u6642\u505C\u7528</p></div><button class="button secondary push-toggle" id="pushToggle" type="button" disabled>\u6B63\u5728\u6AA2\u67E5\u2026</button></div><p class="push-note" id="pushStatus">\u53EA\u63D0\u793A\u300C\u5206\u5E33\u7D50\u679C\u5DF2\u6E96\u5099\u597D\u300D\uFF0C\u4E0D\u986F\u793A\u59D3\u540D\u6216\u91D1\u984D\uFF1B\u9019\u662F\u5206\u5E33 app \u81EA\u5DF1\u7684\u624B\u6A5F\u901A\u77E5\uFF0C\u4E0D\u6703\u767C\u5230 Cue \u804A\u5929\u3002</p></section>\`;
}
function vapidApplicationKey(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}
function pushAuthBody() {
  return { ...(activePin ? { pin:activePin } : {}), ...(activeOwnerToken ? { ownerToken:activeOwnerToken } : {}) };
}
function pushSubscriptionPath() {
  return \`/api/bills/\${encodedBill}/friends/\${encodeURIComponent(selectedFriendId)}/push-subscriptions\`;
}
async function refreshPushButton() {
  const button = $('#pushToggle');
  if (!button || !pushRegistration) return;
  try {
    pushDeviceSubscription = await pushRegistration.pushManager.getSubscription();
    button.textContent = pushDeviceSubscription ? '\u505C\u7528\u6B64\u88DD\u7F6E\u901A\u77E5' : '\u958B\u555F\u7D50\u7B97\u901A\u77E5';
    button.disabled = false;
    $('#pushStatus').textContent = pushDeviceSubscription
      ? '\u6B64\u88DD\u7F6E\u5DF2\u958B\u555F\u901A\u77E5\uFF1B\u53EA\u63D0\u793A\u7D50\u679C\u5DF2\u6E96\u5099\u597D\uFF0C\u4E0D\u6703\u986F\u793A\u59D3\u540D\u6216\u91D1\u984D\uFF1B\u9019\u662F\u5206\u5E33 app \u81EA\u5DF1\u7684\u901A\u77E5\uFF0C\u4E0D\u662F Cue \u804A\u5929\u8A0A\u606F\u3002'
      : '\u53EA\u63D0\u793A\u300C\u5206\u5E33\u7D50\u679C\u5DF2\u6E96\u5099\u597D\u300D\uFF0C\u4E0D\u986F\u793A\u59D3\u540D\u6216\u91D1\u984D\uFF1B\u9019\u662F\u5206\u5E33 app \u81EA\u5DF1\u7684\u624B\u6A5F\u901A\u77E5\uFF0C\u4E0D\u6703\u767C\u5230 Cue \u804A\u5929\u3002';
  } catch {
    button.textContent = '\u66AB\u6642\u672A\u80FD\u6AA2\u67E5\u901A\u77E5';
    button.disabled = true;
  }
}
async function togglePushNotifications() {
  const button = $('#pushToggle');
  if (!button || !selectedFriendId || !pushRegistration) return;
  button.disabled = true;
  try {
    if (pushDeviceSubscription) {
      await api(pushSubscriptionPath(), { method:'DELETE', body:{ endpoint:pushDeviceSubscription.endpoint, ...pushAuthBody() } });
      await pushDeviceSubscription.unsubscribe();
      pushDeviceSubscription = null;
      flash('\u5DF2\u505C\u7528\u6B64\u88DD\u7F6E\u7684\u7D50\u679C\u901A\u77E5');
    } else {
      const permissionPromise = Notification.permission === 'default' ? Notification.requestPermission() : Promise.resolve(Notification.permission);
      const permission = await permissionPromise;
      if (permission !== 'granted') throw new Error('\u6B64\u88DD\u7F6E\u5C1A\u672A\u5141\u8A31\u901A\u77E5\uFF1B\u53EF\u5728\u700F\u89BD\u5668\u6216\u4E3B\u756B\u9762 App \u8A2D\u5B9A\u4E2D\u958B\u555F\u3002');
      const subscription = await pushRegistration.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:vapidApplicationKey(pushConfig.applicationServerKey) });
      try {
        const response = await api(pushSubscriptionPath(), { method:'POST', body:{ subscription:subscription.toJSON(), ...pushAuthBody() } });
        pushDeviceSubscription = subscription;
        flash(response.replaced ? '\u6B64\u88DD\u7F6E\u5DF2\u63A5\u6536\u7D50\u679C\u901A\u77E5\uFF1B\u53E6\u4E00\u88DD\u7F6E\u7684\u8A02\u95B1\u5DF2\u66FF\u63DB' : '\u5DF2\u958B\u555F\u7D50\u7B97\u7D50\u679C\u901A\u77E5');
      } catch (error) {
        await subscription.unsubscribe();
        throw error;
      }
    }
    await refreshPushButton();
  } catch (error) {
    flash(error.message || '\u66AB\u6642\u672A\u80FD\u8A2D\u5B9A\u901A\u77E5');
    if (button.isConnected) button.disabled = false;
  }
}
function publicPath() { return \`/api/bills/\${encodedBill}/public\`; }
function adminPath() { return \`/api/bills/\${encodedBill}/admin\`; }
function setConnection(message, bad=false) {
  const el = $('#connectionStatus');
  el.textContent = message;
  el.classList.toggle('error-text', bad);
}
function updateHero() {
  const status = publicData?.status === 'final' ? '\u5DF2\u7D50\u7B97' : '\u586B\u5BEB\u4E2D';
  $('#stateBadge').textContent = activeView === 'manager' ? '\u7BA1\u7406\u8005' : status;
  $('#categoryTag').textContent = activeView === 'manager' && managerData ? (managerData.status === 'final' ? '\u9031\u672B\u805A\u9910 \xB7 \u5DF2\u7D50\u7B97' : '\u9031\u672B\u805A\u9910 \xB7 \u8349\u7A3F') : (publicData?.title ? '\u9031\u672B\u805A\u9910' : '\u5171\u7528\u5E33\u55AE');
  if (activeView === 'manager') {
    $('#screenTitle').textContent = managerData?.title || publicData?.title || '\u7BA1\u7406\u8005\u767B\u5165';
    $('#screenCopy').textContent = managerData ? '\u6838\u5C0D\u670B\u53CB\u7533\u5831\uFF0C\u4E00\u6B21\u7D50\u7B97\u4E26\u767C\u5E03\u7D50\u679C\u3002' : '\u767B\u5165\u5F8C\u7BA1\u7406\u5E33\u55AE\u53CA\u67E5\u770B\u7533\u5831\u3002';
  } else if (friendPanel?.mode === 'result') {
    $('#screenTitle').textContent = \`\${friendPanel.friendName}\u7684\u5206\u5E33\u7D50\u679C\`;
    $('#screenCopy').textContent = '';
  } else {
    $('#screenTitle').textContent = '\u586B\u5BEB\u4F60\u7684\u5206\u5E33';
    $('#screenCopy').textContent = '\u9078\u64C7\u540D\u5B57\uFF0C\u52A0\u5165\u81EA\u5DF1\u7684\u9805\u76EE\u8207\u4EFD\u91CF\u3002';
  }
}
async function loadPublic() {
  try {
    const previousStatus = publicData?.status;
    const next = await api(publicPath());
    const changed = JSON.stringify(next) !== JSON.stringify(publicData);
    publicData = next;
    const justFinalized = previousStatus !== 'final' && publicData.status === 'final';
    setConnection(publicData.status === 'final' ? '\u5E33\u55AE\u5DF2\u7D50\u7B97\uFF1B\u53EF\u5728\u6B64\u67E5\u770B\u500B\u4EBA\u7D50\u679C\u3002' : '');
    updateHero();
    if (changed) {
      if (activeView === 'friend') {
        if (justFinalized && selectedFriendId && ['saved','edit','new'].includes(friendPanel?.mode)) {
          try {
            const friendId = encodeURIComponent(selectedFriendId);
            const result = await api(\`/api/bills/\${encodedBill}/friends/\${friendId}/access\`, {
              method:'POST', body:{ ...(activePin ? { pin:activePin } : {}), ...(activeOwnerToken ? { ownerToken:activeOwnerToken } : {}) }
            });
            if (result.mode === 'result') friendPanel = { ...result, mode:'result', friendName:result.friend.name };
          } catch {}
        }
        renderFriendView();
        if (justFinalized && !document.hidden) flash('\u5E33\u55AE\u5DF2\u7D50\u7B97\uFF1B\u6B64\u9801\u5DF2\u66F4\u65B0\u7D50\u679C');
      }
      else syncManagerCheckMarkers();
    }
    return true;
  } catch (error) {
    setConnection(\`\u9023\u7DDA\u5931\u6557\uFF1A\${error.message}\`, true);
    $('#friendView').innerHTML = '<div class="empty-state">\u66AB\u6642\u672A\u80FD\u9023\u63A5\uFF0C\u8ACB\u7A0D\u5F8C\u91CD\u8A66\u3002</div>';
    return false;
  }
}
function renderTabs() {
  $('#friendTab').hidden = activeView !== 'manager';
  $('#friendView').classList.toggle('hidden', activeView !== 'friend');
  $('#managerView').classList.toggle('hidden', activeView !== 'manager');
  updateHero();
}
function renderActiveView() {
  renderTabs();
  if (activeView === 'friend') renderFriendView();
  else renderManagerView();
}
function renderFriendView() {
  const host = $('#friendView');
  if (!publicData) { host.innerHTML = '<div class="empty-state">\u6B63\u5728\u9023\u63A5\u5171\u7528\u5E33\u55AE\u2026</div>'; return; }
  if (!selectedFriendId || !friendPanel) {
    const people = publicData.friends.map(friend => \`<button class="friend-choice" type="button" data-select-friend="\${escapeHtml(friend.id)}"><span class="avatar" aria-hidden="true">\${escapeHtml(friend.name.slice(0,1))}</span><span class="friend-choice-name">\${escapeHtml(friend.name)}</span><span class="choice-arrow" aria-hidden="true">\u203A</span></button>\`).join('');
    host.innerHTML = \`<section class="card chooser-card"><div class="section-heading"><h2>\u9078\u64C7\u4F60\u7684\u540D\u5B57</h2><span class="meta-count">\${publicData.friends.length} \u4F4D\u670B\u53CB</span></div><p class="card-subtitle">\u670B\u53CB\u53EF\u67E5\u770B\u6240\u6709\u5DF2\u63D0\u4EA4\u7684\u9805\u76EE\u548C\u4EFD\u91CF\uFF1B\u53EA\u6709\u672C\u4EBA\u53EF\u4FEE\u6539\u81EA\u5DF1\u7684\u7533\u5831\u3002</p><div class="friend-picker" role="group" aria-label="\u9078\u64C7\u670B\u53CB\u540D\u5B57">\${people || '<div class="empty-state">\u5C1A\u672A\u6709\u670B\u53CB\u540D\u55AE\u3002</div>'}</div></section>\${renderSharedChoices()}\`;
    $$('[data-select-friend]', host).forEach(button => button.addEventListener('click', () => openFriend(button.dataset.selectFriend)));
    $$('[data-edit-friend]', host).forEach(button => button.addEventListener('click', () => openFriend(button.dataset.editFriend)));
    return;
  }
  host.innerHTML = \`<div id="personalPanel">\${renderFriendPanel()}</div>\${renderSharedChoices()}\`;
  bindFriendPanel();
}
function friendIdentity(friendName) {
  const choices = selectingFriend ? \`<div class="name-options" role="group" aria-label="\u66F4\u6539\u586B\u5BEB\u4EBA">\${publicData.friends.map(friend => \`<button class="name-option" type="button" data-select-friend="\${escapeHtml(friend.id)}" \${friend.id === selectedFriendId ? 'aria-current="true"' : ''}>\${escapeHtml(friend.name)}</button>\`).join('')}</div>\` : '';
  return \`<section class="identity-card"><span class="avatar avatar-large" aria-hidden="true">\${escapeHtml(friendName.slice(0,1))}</span><div class="identity-copy"><span class="identity-label">\u586B\u5BEB\u4EBA</span><strong>\${escapeHtml(friendName)}</strong></div><button class="text-action" id="changeFriend" type="button">\${selectingFriend ? '\u6536\u8D77' : '\u66F4\u6539'}</button>\${choices}</section>\`;
}

function renderSharedChoices() {
  const selections = publicData?.selections || {};
  const submittedCount = Object.keys(selections).length;
  const mode = friendPanel?.mode || '';
  const ownAuthorized = selectedFriendId && ['new','edit','saved','result'].includes(mode) ? selectedFriendId : '';
  const checkedItems = (publicData?.items || []).filter(item => item.needsCheck === true);
  const checkList = checkedItems.length && !['new','edit','result'].includes(mode)
    ? \`<div class="shared-check-items" role="group" aria-label="\u670B\u53CB\u6AA2\u67E5\u63D0\u793A">\${checkedItems.map(item => \`<div class="shared-check-item" data-public-check-item="\${escapeHtml(item.id)}"><strong>\${escapeHtml(item.name)}</strong><span class="needs-check-marker">\${item.pricingMode === 'shared_unit' ? '\u5927\u5BB6\u518D\u78BA\u8A8D\u4EFD\u91CF\uFF0F\u5171\u4EAB' : '\u5927\u5BB6\u518D\u5C0D\u4E00\u5C0D\u4EFD\u91CF'}</span></div>\`).join('')}</div>\`
    : '';
  const rows = (publicData?.friends || []).map(friend => {
    const selection = selections[friend.id];
    const own = friend.id === ownAuthorized;
    const pending = friend.id === selectedFriendId && mode === 'gate';
    const badge = own ? '\u672C\u4EBA' : pending ? '\u5F85\u672C\u4EBA\u9A57\u8B49' : selection ? '\u5DF2\u63D0\u4EA4' : '\u5C1A\u672A\u63D0\u4EA4';
    const picks = selection ? publicData.items.map(item => {
      const qty = Number(selection.quantities?.[item.id] || 0);
      const sharing = selection.sharing?.[item.id] === true;
      if (item.pricingMode === 'shared_unit') {
        if (sharing) return \`<span class="shared-choice-pick">\${escapeHtml(item.name)}\uFF08\u53C3\u8207\u5171\u4EAB\uFF09</span>\`;
        if (qty > 0) return \`<span class="shared-choice-pick">\${escapeHtml(item.name)}\uFF08\u500B\u4EBA \${qty} \${escapeHtml(item.unit)}\uFF09</span>\`;
        return '';
      }
      if (qty <= 0) return '';
      return item.unit
          ? \`<span class="shared-choice-pick">\${escapeHtml(item.name)} \xD7 \${qty} \${escapeHtml(item.unit)}</span>\`
          : \`<span class="shared-choice-pick">\${escapeHtml(item.name)}\uFF08\u53C3\u8207\u5747\u5206\uFF09</span>\`;
    }).filter(Boolean).join('') : '';
    const detail = selection ? (picks || '<span class="shared-choice-empty">\u5DF2\u63D0\u4EA4\uFF0C\u672A\u9078\u9805\u76EE</span>') : '<span class="shared-choice-empty">\u5C1A\u672A\u63D0\u4EA4</span>';
    const canEdit = own && publicData.status !== 'final' && mode !== 'result';
    const action = canEdit ? \`<button class="shared-edit-button" type="button" data-edit-friend="\${escapeHtml(friend.id)}">\${mode === 'edit' || mode === 'new' ? '\u7DE8\u8F2F\u4E2D \xB7 \u524D\u5F80\u672C\u4EBA\u9805\u76EE' : '\u4FEE\u6539\u672C\u4EBA\u7533\u5831'}</button>\` : '';
    return \`<div class="shared-choice-row \${own ? 'is-own' : ''}" data-shared-choice="\${escapeHtml(friend.id)}"><div class="shared-choice-head"><strong>\${escapeHtml(friend.name)}</strong><span class="shared-choice-badge \${own ? 'own-badge' : ''}">\${badge}</span></div><div class="shared-choice-details">\${detail}</div>\${action}</div>\`;
  }).join('');
  return \`<section class="card shared-choice-card" aria-label="\u670B\u53CB\u5DF2\u586B\u9805\u76EE\u548C\u4EFD\u91CF"><div class="section-heading"><h2>\u670B\u53CB\u5DF2\u586B\u9805\u76EE\u548C\u4EFD\u91CF</h2><span class="meta-count">\${submittedCount} / \${(publicData?.friends || []).length}</span></div><p class="card-subtitle">\u5DF2\u63D0\u4EA4\u7684\u9078\u9805\u5C0D\u670B\u53CB\u516C\u958B\uFF1B\u53EA\u6709\u672C\u4EBA\u53EF\u7DE8\u8F2F\u81EA\u5DF1\u7684\u7533\u5831\u3002</p>\${checkList}<div class="shared-choice-list">\${rows || '<div class="empty-state">\u5C1A\u672A\u6709\u670B\u53CB\u540D\u55AE\u3002</div>'}</div></section>\`;
}
function renderFriendPanel() {
  const mode = friendPanel?.mode;
  if (mode === 'loading') return '<div class="card empty-state">\u6B63\u5728\u958B\u555F\u500B\u4EBA\u8CC7\u6599\u2026</div>';
  if (mode === 'gate') return \`<section class="card gate-card"><div class="section-heading"><h2>\${escapeHtml(friendPanel.friendName)}\u7684\u500B\u4EBA\u8CC7\u6599</h2><span class="meta-count">\u672C\u4EBA\u5C08\u7528</span></div><p class="card-subtitle">\${friendPanel.code === 'device_required' ? '\u9019\u4EFD\u7533\u5831\u53EA\u53EF\u5728\u9996\u6B21\u586B\u55AE\u7684\u88DD\u7F6E\u958B\u555F\uFF1B\u5982\u6709\u8A2D\u5B9A\u500B\u4EBA\u5BC6\u78BC\uFF0C\u8ACB\u5728\u6B64\u8F38\u5165\u3002' : '\u8ACB\u8F38\u5165\u81EA\u5DF1\u8A2D\u5B9A\u7684\u4E09\u500B\u5B57\u5143\u7DE8\u8F2F\u78BC\u3002'}</p><form id="pinGateForm"><label class="field-label" for="pinGate">3 \u4F4D\u7DE8\u8F2F\u78BC</label><input class="text-input pin-input" id="pinGate" type="password" inputmode="text" autocomplete="current-password" maxlength="3" aria-describedby="pinGateError" required><p class="field-error \${friendPanel.code === 'wrong_pin' ? '' : 'hidden'}" id="pinGateError" role="alert">\${friendPanel.code === 'wrong_pin' ? '\u7DE8\u8F2F\u78BC\u4E0D\u6B63\u78BA\uFF1B\u672A\u958B\u555F\u500B\u4EBA\u7DE8\u8F2F\u8CC7\u6599\u3002' : ''}</p><button class="button primary primary-wide" type="submit">\u958B\u555F\u6211\u7684\u5206\u5E33</button></form><p class="field-help">\u7DE8\u8F2F\u78BC\u7531\u4F60\u81EA\u884C\u8A2D\u5B9A\uFF1B\u53EF\u7559\u7A7A\uFF0C\u7559\u7A7A\u5F8C\u53EA\u53EF\u5728\u539F\u88DD\u7F6E\u4FEE\u6539\u3002</p><button class="button ghost primary-wide" id="backToChooser" type="button">\u8FD4\u56DE\u9078\u64C7\u540D\u5B57</button></section>\`;
  if (mode === 'error') return \`<div class="field-error" role="alert">\${escapeHtml(friendPanel.message)}</div>\`;
  if (mode === 'result') {
    const rows = friendPanel.breakdown.map(row => { const qty = Number(row.quantity || 0); const selected = qty > 0 || row.sharing === true; const label = row.pricingMode === 'shared_unit' ? (row.sharing ? '\u53C3\u8207\u5171\u4EAB' : qty > 0 ? \`\u500B\u4EBA \${qty} \${escapeHtml(row.unit)}\` : '\u672A\u9078') : row.unit ? \`\${qty} \${escapeHtml(row.unit)}\` : selected ? '\u53C3\u8207\u5747\u5206' : '\u672A\u9078'; const marker = row.needsCheck ? \`<span class="needs-check-marker">\${row.pricingMode === 'shared_unit' ? '\u5927\u5BB6\u518D\u78BA\u8A8D\u4EFD\u91CF\uFF0F\u5171\u4EAB' : '\u5927\u5BB6\u518D\u5C0D\u4E00\u5C0D\u4EFD\u91CF'}</span>\` : ''; return \`<div class="breakdown-row \${row.needsCheck?'needs-check':''}" data-item-row="\${escapeHtml(row.id)}"><span>\${escapeHtml(row.name)}<span class="share-dot">\xB7</span> \${label}\${marker}</span><strong>\${money(row.cents)}</strong></div>\`; }).join('');
    return \`<div class="result-screen" data-personal-result="\${escapeHtml(selectedFriendId)}"><section class="result-hero"><span class="result-check" aria-hidden="true">\u2713</span><p class="result-label">\u4F60\u61C9\u4ED8</p><strong class="result-amount">\${money(friendPanel.amountCents)}</strong><p class="result-caption">\u5206\u5E33\u5DF2\u5B8C\u6210</p></section><section class="card result-breakdown"><div class="section-heading"><h2>\u6211\u7684\u9805\u76EE</h2><span class="meta-count">\${friendPanel.breakdown.length} \u9805</span></div><div class="breakdown">\${rows}</div></section><p class="privacy-note"><span aria-hidden="true">\u2659</span> \u5206\u6524\u91D1\u984D\u53EA\u986F\u793A\u672C\u4EBA\uFF1B\u670B\u53CB\u9078\u9805\u50C5\u4F9B\u67E5\u770B</p><button class="button secondary primary-wide result-edit" id="editOwnResult" type="button" disabled aria-describedby="resultLockNote">\u4FEE\u6539\u6211\u7684\u5206\u5E33</button><p class="result-lock-note" id="resultLockNote">\u5E33\u55AE\u5DF2\u7D50\u7B97\uFF0C\u6240\u6709\u7533\u5831\u5DF2\u9396\u5B9A\uFF0C\u4E0D\u80FD\u518D\u4FEE\u6539\u3002</p><p class="result-footer">\${escapeHtml(publicData.title)} \xB7 \u5206\u5E33\u7D50\u679C</p></div>\`;
  }
  if (mode === 'saved') return \`<section class="card saved-card" data-submission-saved="\${escapeHtml(selectedFriendId)}"><div class="saved-check">\u2713</div><h2 class="card-title">\u5DF2\u5132\u5B58\u4F60\u7684\u5206\u5E33</h2><p class="card-subtitle">\u670B\u53CB\u53EF\u67E5\u770B\u4F60\u7684\u5DF2\u9078\u9805\u76EE\uFF1B\u53EA\u6709\u4F60\u53EF\u4FEE\u6539\u81EA\u5DF1\u7684\u7533\u5831\u3002</p></section>\${pushControlMarkup()}\`;
  if (mode === 'edit' || mode === 'new') {
    const isNew = mode === 'new';
    const rows = publicData.items.map(item => {
      const qty = Number(friendPanel.quantities?.[item.id] || 0);
      const unit = item.unit || '';
      const shared = item.pricingMode === 'shared_unit';
      const sharing = friendPanel.sharing?.[item.id] === true;
      const selectionLabel = shared ? (sharing ? '\u53C3\u8207\u5171\u4EAB' : qty > 0 ? \`\u500B\u4EBA \${qty} \${unit}\` : '\u672A\u9078') : unit ? String(qty) : qty > 0 ? '\u5DF2\u9078' : '\u672A\u9078';
      const priceLabel = !unit
        ? \`\u6574\u9805\u7E3D\u984D \${money(item.priceCents)}\uFF1B\u9078\u7528\u670B\u53CB\u5E73\u5206\`
        : shared
          ? \`\u6BCF\${escapeHtml(unit)} \${money(item.priceCents)}\uFF1B\u500B\u4EBA\u6578\u91CF\u7167\u8A08\uFF0C\u53C3\u8207\u8005\u5E73\u5206\u5269\u9918\u5DF2\u8CFC\u4EFD\u91CF\`
          : \`\u6BCF\${escapeHtml(unit)} \${money(item.priceCents)}\uFF1B\u6309\u6578\u91CF\u8A08\uFF0C\u4E0D\u518D\u5E73\u5206\`;
      const control = shared
        ? \`<span class="shared-item-controls"><span class="quantity-control"><button class="qty-button" type="button" data-step="-1" data-item="\${escapeHtml(item.id)}" aria-label="\u6E1B\u5C11\${escapeHtml(item.name)}\u500B\u4EBA\u6578\u91CF">\u2212</button><input class="qty-input" type="number" min="0" max="99" step="1" inputmode="numeric" data-qty="\${escapeHtml(item.id)}" aria-label="\${escapeHtml(item.name)}\${escapeHtml(unit)}\u500B\u4EBA\u6578\u91CF" value="\${qty}"><button class="qty-button" type="button" data-step="1" data-item="\${escapeHtml(item.id)}" aria-label="\u589E\u52A0\${escapeHtml(item.name)}\u500B\u4EBA\u6578\u91CF">\uFF0B</button></span><label class="quantity-control split-toggle shared-toggle"><input type="checkbox" data-share-item="\${escapeHtml(item.id)}" aria-label="\${escapeHtml(item.name)}\u53C3\u8207\u5171\u4EAB\u5269\u9918\u4EFD\u91CF" \${sharing ? 'checked' : ''}><span>\u53C3\u8207\u5171\u4EAB</span></label></span>\`
        : unit
          ? \`<span class="quantity-control"><button class="qty-button" type="button" data-step="-1" data-item="\${escapeHtml(item.id)}" aria-label="\u6E1B\u5C11\${escapeHtml(item.name)}\u6578\u91CF">\u2212</button><input class="qty-input" type="number" min="0" max="99" step="1" inputmode="numeric" data-qty="\${escapeHtml(item.id)}" aria-label="\${escapeHtml(item.name)}\${escapeHtml(unit)}\u6578\u91CF" value="\${qty}"><button class="qty-button" type="button" data-step="1" data-item="\${escapeHtml(item.id)}" aria-label="\u589E\u52A0\${escapeHtml(item.name)}\u6578\u91CF">\uFF0B</button></span>\`
          : \`<span class="quantity-control split-toggle"><input type="checkbox" data-qty="\${escapeHtml(item.id)}" aria-label="\${escapeHtml(item.name)}\u662F\u5426\u53C3\u8207\u5747\u5206" \${qty > 0 ? 'checked' : ''}><span>\u53C3\u8207\u5747\u5206</span></span>\`;
      const marker = item.needsCheck ? \`<span class="needs-check-marker">\${shared ? '\u5927\u5BB6\u518D\u78BA\u8A8D\u4EFD\u91CF\uFF0F\u5171\u4EAB' : '\u5927\u5BB6\u518D\u5C0D\u4E00\u5C0D\u4EFD\u91CF'}</span>\` : '';
      return \`<div class="dish-row \${shared?'shared-dish-row':''} \${item.needsCheck?'needs-check':''}" data-item-row="\${escapeHtml(item.id)}"><span class="dish-copy"><span class="dish-name">\${escapeHtml(item.name)}</span><span class="dish-qty-label"><span data-qty-label="\${escapeHtml(item.id)}">\${selectionLabel}</span>\${unit && !shared ? \` \${escapeHtml(unit)}\` : ''}</span><span class="dish-price">\${priceLabel}</span>\${marker}</span>\${control}</div>\`;
    }).join('');
    const selectedItems = publicData.items.reduce((sum,item) => sum + (Number(friendPanel.quantities?.[item.id] || 0) > 0 || friendPanel.sharing?.[item.id] === true ? 1 : 0), 0);
    const pinField = friendPanel.pinProtected
      ? '<p class="safe-note">\u5DF2\u7528\u4F60\u525B\u624D\u8F38\u5165\u7684\u7DE8\u8F2F\u78BC\u958B\u555F\uFF1B\u518D\u6B21\u4FEE\u6539\u4ECD\u9700\u7DE8\u8F2F\u78BC\u3002</p>'
      : '<div class="pin-card"><div><strong>3 \u4F4D\u7DE8\u8F2F\u78BC</strong><p>\u53EF\u9078\uFF1B\u65B9\u4FBF\u65E5\u5F8C\u66F4\u63DB\u88DD\u7F6E\u4FEE\u6539</p></div><input class="pin-inline" id="editPin" type="password" inputmode="text" autocomplete="new-password" maxlength="3" placeholder="\u9078\u586B" aria-label="\u81EA\u884C\u8A2D\u5B9A 3 \u4F4D\u7DE8\u8F2F\u78BC"></div>';
    const disabled = publicData.status === 'final' ? 'disabled' : '';
    return \`<form class="entry-screen" id="submissionForm" data-personal-view="\${escapeHtml(selectedFriendId)}">\${friendIdentity(friendPanel.friendName)}<div class="section-heading entry-heading"><h2>\u6211\u7684\u9805\u76EE</h2><span class="meta-count">\${publicData.items.length} \u9805</span></div><p class="pricing-rule-note entry-pricing-note">\u6709\u55AE\u4F4D\uFF1A\u6309\u500B\u4EBA\u6578\u91CF\u8A08\uFF0C\u6216\u5728\u6307\u5B9A\u9805\u76EE\u53C3\u8207\u5171\u4EAB\u5269\u9918\u4EFD\u91CF\uFF1B\u7121\u55AE\u4F4D\uFF1A\u6574\u9805\u91D1\u984D\u7531\u6709\u9078\u7684\u4EBA\u5E73\u5206\u3002</p><section class="card item-card"><div class="dish-list">\${rows || '<div class="empty-state">\u5E33\u55AE\u6C92\u6709\u9805\u76EE\u3002</div>'}</div></section><div class="item-total-action" aria-label="\u6B64\u7248\u672C\u9805\u76EE\u7BA1\u7406\u7531\u7BA1\u7406\u8005\u8655\u7406">\uFF0B \u5E33\u55AE\u9805\u76EE\u7531\u7BA1\u7406\u8005\u8A2D\u5B9A</div>\${pinField}<p class="inline-error hidden" id="submitError" role="alert"></p><div class="entry-total"><span>\u5DF2\u9078\u9805\u76EE</span><strong><span id="totalQty">\${selectedItems}</span> \u9805</strong></div><button class="button primary primary-wide" id="submitOwnBill" type="submit" \${disabled}>\${isNew ? '\u63D0\u4EA4\u6211\u7684\u5206\u5E33' : '\u5132\u5B58\u6211\u7684\u66F4\u65B0'}</button></form>\`;
  }
  return '<div class="empty-state">\u9078\u64C7\u81EA\u5DF1\u7684\u540D\u5B57\uFF0C\u958B\u59CB\u586B\u5206\u5E33\u3002</div>';
}
async function openFriend(friendId, pin = '') {
  const friend = publicData?.friends.find(person => person.id === friendId);
  if (!friend) return;
  selectedFriendId = friendId;
  selectingFriend = false;
  friendPanel = { mode:'loading', friendName:friend.name };
  activePin = pin;
  activeOwnerToken = localStorage.getItem(deviceKey(friendId)) || '';
  renderFriendView();
  try {
    const response = await api(\`/api/bills/\${encodedBill}/friends/\${encodeURIComponent(friendId)}/access\`, {
      method:'POST', body:{ ...(pin ? { pin } : {}), ...(activeOwnerToken ? { ownerToken:activeOwnerToken } : {}) }
    });
    if (response.mode === 'result') friendPanel = { ...response, mode:'result', friendName:response.friend.name };
    else friendPanel = { ...response, friendName:response.friend.name };
    renderFriendView();
    updateHero();
  } catch (error) {
    const mode = ['pin_required','wrong_pin','device_required'].includes(error.code) ? 'gate' : 'error';
    friendPanel = { mode, code:error.code, friendName:friend.name, message:error.message };
    activePin = '';
    renderFriendView();
  }
}
function bindFriendPanel() {
  $('#pushToggle')?.addEventListener('click', togglePushNotifications);
  if ($('#pushToggle')) refreshPushButton();
  $('#changeFriend')?.addEventListener('click', () => { selectingFriend = !selectingFriend; renderFriendView(); });
  $$('[data-select-friend]').forEach(button => button.addEventListener('click', () => openFriend(button.dataset.selectFriend)));
  $('#pinGateForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const pin = $('#pinGate').value;
    if (Array.from(pin).length !== 3) { showInlineError('#pinGateError', '\u7DE8\u8F2F\u78BC\u8981\u525B\u597D 3 \u500B\u5B57\u5143\u3002'); return; }
    await openFriend(selectedFriendId, pin);
  });
  $$('[data-step]').forEach(button => button.addEventListener('click', () => {
    const input = $(\`[data-qty="\${CSS.escape(button.dataset.item)}"]\`);
    if (!input) return;
    input.value = Math.max(0, Math.min(99, (Number(input.value) || 0) + Number(button.dataset.step)));
    updateQuantitySummary(input);
  }));
  $$('#personalPanel [data-qty]').forEach(input => input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', () => {
    if (input.type !== 'checkbox') input.value = Math.max(0, Math.min(99, Math.floor(Number(input.value) || 0)));
    updateQuantitySummary(input);
  }));
  $$('#personalPanel [data-share-item]').forEach(input => input.addEventListener('change', () => {
    const qtyInput = $(\`[data-qty="\${CSS.escape(input.dataset.shareItem)}"]\`);
    if (input.checked && qtyInput) qtyInput.value = '0';
    updateQuantitySummary(qtyInput || input);
  }));
  $('#submissionForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const errorEl = $('#submitError');
    errorEl.classList.add('hidden');
    const quantities = Object.fromEntries($$('#personalPanel [data-qty]').map(input => [input.dataset.qty, input.type === 'checkbox' ? (input.checked ? 1 : 0) : Math.max(0, Math.min(99, Math.floor(Number(input.value) || 0)))]));
    const sharing = Object.fromEntries($$('#personalPanel [data-share-item]').map(input => [input.dataset.shareItem, input.checked]));
    const pin = $('#editPin')?.value || activePin;
    if ($('#editPin')?.value && Array.from($('#editPin').value).length !== 3) { showInlineError('#submitError', '\u7DE8\u8F2F\u78BC\u8981\u525B\u597D 3 \u500B\u5B57\u5143\uFF1B\u4E0D\u8A2D\u53EF\u7559\u7A7A\u3002'); return; }
    try {
      const response = await api(\`/api/bills/\${encodedBill}/friends/\${encodeURIComponent(selectedFriendId)}/submissions\`, {
        method:'POST', body:{ quantities, sharing, ...(pin ? { pin } : {}), ...(activeOwnerToken ? { ownerToken:activeOwnerToken } : {}) }
      });
      if (response.ownerToken) localStorage.setItem(deviceKey(selectedFriendId), response.ownerToken);
      if (pin) localStorage.removeItem(deviceKey(selectedFriendId));
      activePin = pin; activeOwnerToken = response.ownerToken || activeOwnerToken;
      friendPanel = { mode:'saved', friendName:publicData.friends.find(friend => friend.id === selectedFriendId)?.name || '', updated:!friendPanel || friendPanel.mode !== 'new' };
      renderFriendView();
      flash('\u5DF2\u5132\u5B58\u4F60\u7684\u5206\u5E33');
      await loadPublic();
      renderFriendView();
    } catch (error) { showInlineError('#submitError', error.message); }
  });
  $('#backToChooser')?.addEventListener('click', () => {
    selectedFriendId = ''; friendPanel = null; activePin = ''; activeOwnerToken = ''; selectingFriend = false;
    renderFriendView(); updateHero();
  });
  $$('[data-edit-friend]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.editFriend !== selectedFriendId) return;
    const form = $('#submissionForm');
    if (form) { form.scrollIntoView({ behavior:'smooth', block:'center' }); $$('#submissionForm [data-qty]')[0]?.focus({ preventScroll:true }); }
    else openFriend(selectedFriendId);
  }));
}
function updateQuantitySummary(input) {
  const id = input.dataset.qty || input.dataset.shareItem;
  const label = $(\`[data-qty-label="\${CSS.escape(id)}"]\`);
  const item = publicData?.items.find(row => row.id === id);
  if (item?.pricingMode === 'shared_unit') {
    const qtyInput = $(\`[data-qty="\${CSS.escape(id)}"]\`), shareInput = $(\`[data-share-item="\${CSS.escape(id)}"]\`);
    if (input.dataset.qty && Number(qtyInput?.value || 0) > 0 && shareInput) shareInput.checked = false;
    const qty = Number(qtyInput?.value || 0);
    if (label) label.textContent = shareInput?.checked ? '\u53C3\u8207\u5171\u4EAB' : qty > 0 ? \`\u500B\u4EBA \${qty} \${item.unit}\` : '\u672A\u9078';
  } else if (label) label.textContent = input.type === 'checkbox' ? (input.checked ? '\u5DF2\u9078' : '\u672A\u9078') : String(input.value || 0);
  const selected = publicData.items.reduce((sum,item) => {
    const qtyInput = $(\`[data-qty="\${CSS.escape(item.id)}"]\`), shareInput = $(\`[data-share-item="\${CSS.escape(item.id)}"]\`);
    return sum + ((Number(qtyInput?.value || 0) > 0 || shareInput?.checked || (qtyInput?.type === 'checkbox' && qtyInput.checked)) ? 1 : 0);
  }, 0);
  if ($('#totalQty')) $('#totalQty').textContent = String(selected);
}
function showInlineError(selector, text) {
  const el = $(selector);
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden');
}
function participationReminderHtml(prompts, finalized=false) {
  if (!prompts?.length) return '';
  const rows = prompts.map(row => \`<p>\${row.reason === 'no_participants' ? \`\u300C\${escapeHtml(row.name)}\u300D\u4EF2\u6709 \${row.remainingQty} \${escapeHtml(row.unit)}\u672A\u6709\u4EBA\u8A8D\u9818\uFF0F\u5171\u4EAB\uFF0C\u5927\u5BB6\u518D\u5C0D\u4E00\u5C0D\uFF1B\u6709\u4EBA\u9078\u64C7\u5171\u4EAB\u6216\u4FEE\u6B63\u8CC7\u6599\u5F8C\u5148\u53EF\u4EE5\u7D50\u7B97\u3002\` : \`\u300C\${escapeHtml(row.name)}\u300D\u76EE\u524D\u53EA\u6709\u4E00\u4F4D\u670B\u53CB\u53C3\u8207\u5171\u4EAB\uFF1B\u5269\u9918 \${row.remainingQty} \${escapeHtml(row.unit)}\uFF08\${money(row.totalCents)}\uFF09\u6703\u7531\u8A72\u670B\u53CB\u5206\u64D4\uFF0C\u5927\u5BB6\u518D\u78BA\u8A8D\u4E00\u4E0B\u3002\`}</p>\`).join('');
  return \`<section class="quantity-reminder shared-participation-reminder" id="participationReminder" role="status" aria-live="polite">\${rows}</section>\`;
}
function setParticipationReminder(prompts, finalized=false) {
  const existing = $('#participationReminder');
  if (!prompts?.length) { existing?.remove(); return; }
  const template = document.createElement('template');
  template.innerHTML = participationReminderHtml(prompts, finalized).trim();
  const next = template.content.firstElementChild;
  if (existing) existing.replaceWith(next);
  else $('#managerView .main-manager-actions')?.parentNode.insertBefore(next, $('#managerView .main-manager-actions'));
}
function unallocatedSummaryHtml(calculations, finalized=false) {
  const unallocatedCents = calculations?.unallocatedCents || 0;
  if (!unallocatedCents) return '';
  const allocatedCents = calculations?.grandCents || 0;
  const billTotalCents = calculations?.billTotalCents ?? allocatedCents + unallocatedCents;
  const action = finalized ? '\u5E33\u55AE\u5C1A\u6709\u4EFD\u91CF\u672A\u88AB\u8A8D\u9818\uFF0C\u4E0D\u80FD\u5B8C\u6210\u7D50\u7B97\u3002' : '\u5B8C\u6210\u8A8D\u9818\uFF0F\u5171\u4EAB\u5F8C\u624D\u53EF\u4EE5\u7D50\u7B97\u3002';
  const pendingRows = (calculations?.breakdown || []).filter(row => row.unallocatedCents > 0).map(row => \`<li>\${escapeHtml(row.name)}\uFF1A\u5C1A\u6709 \${money(row.unallocatedCents)} \u5F85\u8A8D\u9818\uFF0F\u5171\u4EAB</li>\`).join('');
  return \`<section class="unallocated-note" id="unallocatedNote"><p><strong>\u5C1A\u5F85\u8A8D\u9818\uFF0F\u5171\u4EAB \${money(unallocatedCents)}</strong>\uFF1B\u4E0D\u6703\u5206\u5230\u4EFB\u4F55\u4EBA\u3002\${action}</p>\${pendingRows ? \`<ul>\${pendingRows}</ul>\` : ''}<p class="allocation-reconciliation" id="allocationReconciliation">\u5DF2\u8A8D\u9818 \${money(allocatedCents)} \uFF0B \u5C1A\u5F85\u8A8D\u9818\uFF0F\u5171\u4EAB \${money(unallocatedCents)} \uFF1D \u9810\u8A08\u5168\u55AE\u7E3D\u984D \${money(billTotalCents)}</p></section>\`;
}
function managerReadinessHint(readiness, allSubmitted, finalized=false) {
  if (finalized) return '\u5E33\u55AE\u5DF2\u7D50\u7B97\uFF1B\u6240\u6709\u9805\u76EE\u5747\u5DF2\u5B8C\u6210\u8A8D\u9818\u3002';
  if ((readiness?.participationPrompts || []).some(row => row.reason === 'no_participants')) return '\u5462\u9805\u4EF2\u6709\u4EFD\u91CF\u672A\u6709\u4EBA\u8A8D\u9818\uFF0F\u5171\u4EAB\uFF0C\u5927\u5BB6\u518D\u5C0D\u4E00\u5C0D\uFF1B\u5B8C\u6210\u5F8C\u624D\u53EF\u7D50\u7B97\u3002';
  const mismatches = readiness?.quantityMismatches || [];
  if (mismatches.length) return mismatches.every(row => row.reason === 'expected_missing') ? '\u5BE6\u969B\u5DF2\u8CFC\u6578\u91CF\u672A\u586B\uFF0C\u5927\u5BB6\u518D\u5C0D\u4E00\u5C0D\uFF1B\u586B\u59A5\u5F8C\u624D\u53EF\u7D50\u7B97\u3002' : '\u4EFD\u6578\u540C\u5BE6\u969B\u5DF2\u8CFC\u6578\u91CF\u6709\u5572\u51FA\u5165\uFF0C\u5927\u5BB6\u518D\u5C0D\u4E00\u5C0D\uFF1B\u4FEE\u6B63\u5F8C\u624D\u53EF\u7D50\u7B97\u3002';
  if (!allSubmitted) return '\u7B49\u5927\u5BB6\u63D0\u4EA4\u5F8C\uFF0C\u518D\u6838\u5C0D\u6BCF\u9805\u4EFD\u91CF\u3002';
  if (!readiness?.allClaimed) return '\u6BCF\u9805\u90FD\u8981\u6709\u4EBA\u8A8D\u9818\uFF0C\u5927\u5BB6\u518D\u5C0D\u4E00\u5C0D\u3002';
  return '\u6240\u6709\u9805\u76EE\u90FD\u5DF2\u8A8D\u9818\uFF1B\u6838\u5C0D\u5F8C\u53EF\u4EE5\u7D50\u7B97\u3002';
}
function renderManagerView() {
  const host = $('#managerView');
  if (!managerData) {
    host.innerHTML = \`<section class="card login-card"><div class="manager-symbol" aria-hidden="true">\u2318</div><h2>\u7BA1\u7406\u8005\u767B\u5165</h2><p class="card-subtitle">\u7BA1\u7406\u6458\u8981\u53CA\u670B\u53CB\u7533\u5831\u53EA\u6703\u5728\u901A\u904E\u9A57\u8B49\u5F8C\u8F09\u5165\u3002</p><form id="adminLogin"><label class="field-label" for="adminKeyInput">\u81E8\u6642\u7BA1\u7406\u5BC6\u9470</label><input class="text-input" id="adminKeyInput" type="password" autocomplete="current-password" required><p class="field-error hidden" id="adminLoginError" role="alert"></p><button class="button primary primary-wide" type="submit">\u958B\u555F\u7BA1\u7406\u9762\u677F</button></form><p class="field-help">\u5BC6\u9470\u53EA\u4FDD\u7559\u5728\u9019\u500B\u5206\u9801\uFF0C\u5207\u56DE\u670B\u53CB\u9801\u6703\u6E05\u9664\u3002</p></section>\`;
    $('#adminLogin')?.addEventListener('submit', async event => {
      event.preventDefault();
      adminKey = $('#adminKeyInput').value;
      try { managerData = await api(adminPath(), { admin:true }); renderManagerView(); updateHero(); }
      catch { adminKey = ''; showInlineError('#adminLoginError', '\u5BC6\u9470\u4E0D\u6B63\u78BA\u6216\u7BA1\u7406\u9762\u677F\u66AB\u4E0D\u53EF\u7528\u3002'); }
    });
    return;
  }
  const finalized = managerData.status === 'final';
  const allSubmitted = managerData.progress.submitted === managerData.progress.total;
  const calculations = managerData.results || managerData.draftResults || {};
  const totals = calculations.centsByFriend || {};
  const allocatedCents = calculations.grandCents || 0;
  const unallocatedCents = calculations.unallocatedCents || 0;
  const totalCents = allSubmitted ? (calculations.billTotalCents ?? allocatedCents + unallocatedCents) : allocatedCents;
  const summaryLabel = finalized ? '\u5168\u55AE\u7E3D\u984D' : allSubmitted ? '\u9810\u8A08\u5168\u55AE\u7E3D\u984D' : '\u5DF2\u63D0\u4EA4\u4EFD\u91CF\u4F30\u7B97';
  const peopleRows = managerData.friends.map(friend => {
    const submitted = managerData.submissions[friend.id]?.submitted;
    const amount = submitted ? money(totals[friend.id] || 0) : '\u5C1A\u672A\u63D0\u4EA4';
    return \`<div class="person-row" data-person-row="\${escapeHtml(friend.id)}"><span class="avatar avatar-row" aria-hidden="true">\${escapeHtml(friend.name.slice(0,1))}</span><div class="person-copy"><strong>\${escapeHtml(friend.name)}</strong><span>\${submitted ? '\u5DF2\u63D0\u4EA4' : '\u672A\u63D0\u4EA4'}</span></div><strong class="person-amount">\${amount}</strong></div>\`;
  }).join('');
  const itemRows = managerData.items.map(item => {
    const id = escapeHtml(item.id), name = escapeHtml(item.name), unit = item.unit || '';
    const mode = unit ? (item.pricingMode === 'shared_unit' ? 'shared_unit' : 'per_unit') : 'split_total';
    const modeLabel = !unit ? \`\u6574\u9805\u7E3D\u984D\uFF1A\${money(item.priceCents)}\uFF0C\u7531\u9078\u7528\u670B\u53CB\u5E73\u5206\` : mode === 'shared_unit' ? \`\u500B\u4EBA\u6578\u91CF\uFF0B\u5171\u4EAB\u9918\u91CF\uFF1A\u6BCF\${escapeHtml(unit)} \${money(item.priceCents)}\uFF1B\u500B\u4EBA\u7533\u5831\u5148\u8A08\uFF0C\u53C3\u8207\u8005\u5E73\u5206\u5269\u9918\u5DF2\u8CFC\u4EFD\u91CF\` : \`\u55AE\u50F9\uFF1A\u6BCF\${escapeHtml(unit)} \${money(item.priceCents)}\uFF0C\u6309\u500B\u4EBA\u6578\u91CF\u8A08\uFF0C\u4E0D\u518D\u5E73\u5206\`;
    const priceAria = unit ? \`\${name}\u6BCF\${escapeHtml(unit)}\u55AE\u50F9\` : \`\${name}\u6574\u9805\u7E3D\u984D\`;
    const expected = item.expectedQty === null || item.expectedQty === undefined ? '' : String(item.expectedQty);
    const marker = item.needsCheck ? \`<span class="needs-check-marker" data-needs-check-marker>\${mode === 'shared_unit' ? '\u5927\u5BB6\u518D\u78BA\u8A8D\u4EFD\u91CF\uFF0F\u5171\u4EAB' : '\u5927\u5BB6\u518D\u5C0D\u4E00\u5C0D\u4EFD\u91CF'}</span>\` : '';
    const modeControl = \`<div class="pricing-mode-field" data-mode-field="\${id}" \${unit?'':'hidden'}><label for="item-mode-\${id}">\u6709\u55AE\u4F4D\u7684\u5206\u6524\u65B9\u5F0F</label><select class="pricing-mode-select" id="item-mode-\${id}" data-item-pricing-mode="\${id}" aria-label="\${name}\u5206\u6524\u65B9\u5F0F" \${!unit||finalized?'disabled':''}><option value="per_unit" \${mode==='per_unit'?'selected':''}>\u6309\u5404\u4EBA\u6578\u91CF\u8A08</option><option value="shared_unit" \${mode==='shared_unit'?'selected':''}>\u500B\u4EBA\u6578\u91CF\uFF0B\u53C3\u8207\u5171\u4EAB\u9918\u91CF</option></select><p class="field-help" data-mode-help="\${id}">\${mode==='shared_unit'?'\u670B\u53CB\u53EF\u7533\u5831\u500B\u4EBA\u6578\u91CF\uFF0C\u6216\u53C3\u8207\u5E73\u5206\u500B\u4EBA\u7533\u5831\u5F8C\u7684\u5269\u9918\u5DF2\u8CFC\u4EFD\u91CF\u3002':'\u670B\u53CB\u6309\u81EA\u5DF1\u5BE6\u969B\u6578\u91CF\u8A08\u7B97\u3002'}</p></div>\`;
    const required = unit ? 'required' : '';
    const expectedHelp = mode === 'shared_unit' ? '\u6309\u6B64\u6578\u91CF\u6263\u9664\u500B\u4EBA\u7533\u5831\u5F8C\uFF0C\u5269\u9918\u4EFD\u91CF\u624D\u7531\u53C3\u8207\u8005\u5E73\u5206\uFF1B\u7D50\u7B97\u524D\u9700\u586B\u5BEB\u3002' : '\u7D50\u7B97\u524D\u9700\u586B\u5BEB\u5BE6\u969B\u5DF2\u8CFC\u6578\u91CF\uFF0C\u4E26\u8207\u670B\u53CB\u7533\u5831\u4EFD\u6578\u76F8\u7B26\u3002';
    return \`<div class="item-editor \${item.needsCheck?'needs-check':''}" data-item-editor="\${id}"><div class="edit-row item-edit"><label class="sr-only" for="item-name-\${id}">\${name}\u540D\u7A31</label><input class="text-input" id="item-name-\${id}" data-item-name="\${id}" maxlength="40" value="\${name}" \${finalized?'disabled':''}><label class="sr-only" for="item-unit-\${id}">\${name}\u55AE\u4F4D\uFF08\u9078\u586B\uFF09</label><input class="unit-input" id="item-unit-\${id}" data-item-unit="\${id}" maxlength="4" placeholder="\u9078\u586B" value="\${escapeHtml(unit)}" aria-label="\${name}\u55AE\u4F4D\uFF08\u9078\u586B\uFF09" \${finalized?'disabled':''}><label class="sr-only" for="item-price-\${id}">\${priceAria}</label><input class="money-input" id="item-price-\${id}" data-item-price="\${id}" type="number" min="0" step="0.01" value="\${(item.priceCents/100).toFixed(2)}" aria-label="\${priceAria}" \${finalized?'disabled':''}><button class="icon-button" type="button" data-remove-item="\${id}" aria-label="\u79FB\u9664\${name}" \${finalized||managerData.items.length<=1?'disabled':''}>\xD7</button></div><p class="item-price-mode" data-price-mode="\${id}">\${modeLabel}</p>\${modeControl}\${marker}<div class="expected-qty-field" data-expected-field="\${id}" \${unit?'':'hidden'}><label for="item-expected-\${id}">\u5BE6\u969B\u5DF2\u8CFC\u6578\u91CF\uFF08<span data-expected-unit="\${id}">\${escapeHtml(unit)}</span>\uFF09</label><input class="expected-qty-input" id="item-expected-\${id}" data-item-expected="\${id}" type="number" min="0" max="9900" step="1" inputmode="numeric" value="\${escapeHtml(expected)}" placeholder="\u8ACB\u586B\u5DF2\u8CFC\u6578\u91CF" aria-label="\${name}\u5BE6\u969B\u5DF2\u8CFC\u6578\u91CF\${escapeHtml(unit)}" \${!unit||finalized?'disabled':''} \${required}><p class="field-help" data-expected-help="\${id}">\${expectedHelp}</p></div></div>\`;
  }).join('');
  const friendRows = managerData.friends.map((friend,index) => \`<div class="edit-row person-edit"><span class="avatar" aria-hidden="true">\${escapeHtml(friend.name.slice(0,1))}</span><label class="sr-only" for="friend-name-\${escapeHtml(friend.id)}">\u670B\u53CB \${index+1} \u540D\u7A31</label><input class="text-input" id="friend-name-\${escapeHtml(friend.id)}" data-friend-name="\${escapeHtml(friend.id)}" maxlength="32" value="\${escapeHtml(friend.name)}" \${finalized?'disabled':''}><button class="icon-button" type="button" data-remove-friend="\${escapeHtml(friend.id)}" aria-label="\u79FB\u9664\${escapeHtml(friend.name)}" \${finalized||managerData.friends.length<=1?'disabled':''}>\xD7</button></div>\`).join('');
  const quantityWarnings = managerData.readiness?.quantityMismatches || [];
  const reminderText = quantityWarnings.length && quantityWarnings.every(row => row.reason === 'expected_missing') ? '\u5BE6\u969B\u8CB7\u5165\u6578\u91CF\u672A\u586B\uFF0C\u5927\u5BB6\u518D\u6838\u5C0D\u4E00\u4E0B\u3002' : '\u4EFD\u6578\u540C\u5BE6\u969B\u8CB7\u5165\u6578\u91CF\u6709\u5572\u51FA\u5165\uFF0C\u5927\u5BB6\u518D\u6AA2\u67E5\u4E00\u4E0B\u3002';
  const quantityReminder = !finalized && quantityWarnings.length ? \`<section class="quantity-reminder" id="quantityReminder" role="status" aria-live="polite"><p>\${reminderText}</p></section>\` : '';
  const participationPrompts = managerData.readiness?.participationPrompts || [];
  const participationReminder = participationReminderHtml(participationPrompts, finalized);
  const unallocatedNote = managerData.readiness?.everyone ? unallocatedSummaryHtml(calculations, finalized) : '';
  const statusRows = managerData.friends.map(friend => {
    const sub = managerData.submissions[friend.id];
    const detail = sub?.submitted ? managerData.items.map(item => {
      const qty = Number(sub.quantities[item.id] || 0);
      return item.pricingMode === 'shared_unit' ? \`\${escapeHtml(item.name)} \${sub.sharing?.[item.id] ? '\u53C3\u8207\u5171\u4EAB' : qty > 0 ? \`\u500B\u4EBA \${qty} \${escapeHtml(item.unit)}\` : '\u672A\u9078'}\` : item.unit ? \`\${escapeHtml(item.name)} \${qty} \${escapeHtml(item.unit)}\` : \`\${escapeHtml(item.name)} \${qty > 0 ? '\u53C3\u8207\u5747\u5206' : '\u672A\u9078'}\`;
    }).join(' \xB7 ') : '\u672A\u63D0\u4EA4';
    return \`<div class="status-row \${sub?.submitted?'done':''}"><strong>\${escapeHtml(friend.name)}</strong><span>\${detail}</span></div>\`;
  }).join('');
  const readinessHint = managerReadinessHint(managerData.readiness, allSubmitted, finalized);
  host.innerHTML = \`<section class="summary-card"><div class="summary-label" id="summaryLabel">\${summaryLabel}</div><strong class="summary-total" id="summaryTotal">\${money(totalCents)}</strong><div class="summary-meta"><span id="summaryPeople">\${managerData.friends.length} \u4F4D\u670B\u53CB</span><strong id="summaryProgress">\${finalized ? '\u5DF2\u7D50\u7B97' : \`\u5DF2\u6536\u9F4A \${managerData.progress.submitted} / \${managerData.progress.total}\`}</strong></div>\${unallocatedNote}</section>
    <div class="section-heading manager-heading"><h2>\u670B\u53CB\u5206\u5E33</h2><span class="manager-view-label">\u7BA1\u7406\u8005\u6AA2\u8996</span></div>
    <section class="card people-card">\${peopleRows || '<div class="empty-state">\u5C1A\u672A\u6709\u670B\u53CB\u540D\u55AE\u3002</div>'}</section>
    \${quantityReminder}
    \${participationReminder}
    <div class="manager-actions main-manager-actions"><button class="button secondary primary-wide" id="copyLink" type="button"><span aria-hidden="true">\u2197</span> \u8907\u88FD\u670B\u53CB\u586B\u5BEB\u9023\u7D50</button><button class="button primary primary-wide finalize-button" id="finalizeBill" type="button" \${finalized||!managerData.readiness.ready?'disabled':''}><span aria-hidden="true">\u2713</span> \${finalized ? '\u5DF2\u7D50\u7B97\u4E26\u767C\u5E03\u7D50\u679C' : '\u7D50\u7B97\u4E26\u767C\u5E03\u7D50\u679C'}</button></div>
    <p class="button-hint" id="readinessHint">\${readinessHint}</p>
    \${finalized ? '<section class="lock-note">\u5E33\u55AE\u5DF2\u5B8C\u6210\uFF1B\u6240\u6709\u4FEE\u6539\u53CA\u65B0\u7533\u5831\u5747\u5DF2\u9396\u5B9A\u3002</section>' : ''}
    <details class="admin-edit"><summary>\u7DE8\u8F2F\u5E33\u55AE\u8CC7\u6599</summary><section class="card edit-card"><label class="field-label" for="bill-title">\u5E33\u55AE\u540D\u7A31</label><input class="text-input" id="bill-title" maxlength="60" value="\${escapeHtml(managerData.title)}"><div class="card-head edit-head"><div><h3>\u9805\u76EE\u53CA\u5B9A\u50F9</h3><p class="card-subtitle">\u55AE\u4F4D\u9078\u586B\uFF1A\u7559\u7A7A\u6309\u4EBA\u5747\u5206\uFF1B\u6709\u55AE\u4F4D\u53EF\u7DAD\u6301\u500B\u4EBA\u6578\u91CF\uFF0C\u6216\u6307\u5B9A\u5171\u4EAB\u9918\u91CF</p></div></div><p class="pricing-rule-note" id="pricingRuleNote">\u55AE\u4F4D\u7559\u7A7A\uFF1A\u6574\u9805\u7E3D\u984D\u7531\u9078\u7528\u8005\u5E73\u5206\u3002\u6709\u55AE\u4F4D\uFF1A\u6309\u500B\u4EBA\u6578\u91CF\u8A08\u6642\uFF0C\u55AE\u50F9\u4E58\u4EFD\u6578\uFF1B\u9078\u7528\u5171\u4EAB\u9918\u91CF\u6642\uFF0C\u9700\u586B\u5BE6\u969B\u5DF2\u8CFC\u6578\u91CF\uFF0C\u5148\u6263\u9664\u500B\u4EBA\u7533\u5831\uFF0C\u518D\u7531\u9078\u64C7\u5171\u4EAB\u7684\u670B\u53CB\u5E73\u5206\u9918\u91CF\u3002</p><div class="edit-list">\${itemRows}</div><button class="button ghost add-button" id="addItem" type="button">\uFF0B \u52A0\u4E00\u9805</button><div class="card-head edit-head"><div><h3>\u670B\u53CB\u540D\u55AE</h3><p class="card-subtitle">\${managerData.progress.submitted} / \${managerData.progress.total} \u4F4D\u5DF2\u63D0\u4EA4</p></div></div><div class="edit-list">\${friendRows}</div><button class="button ghost add-button" id="addFriend" type="button">\uFF0B \u52A0\u4E00\u4F4D\u670B\u53CB</button><div class="manager-actions"><button class="button secondary" id="saveManager" type="button">\u5132\u5B58\u8B8A\u66F4</button></div><p class="field-error hidden" id="managerError" role="alert"></p><div class="status-list">\${statusRows}</div></section></details>\`;
  bindManager();
}
function refreshManagerItem(item) {
  const id = CSS.escape(item.id), unit = item.unit || '', finalized = managerData?.status === 'final';
  if (!unit) item.pricingMode = 'split_total';
  else if (!['per_unit','shared_unit'].includes(item.pricingMode)) item.pricingMode = 'per_unit';
  const mode = item.pricingMode;
  const modeField = $(\`[data-mode-field="\${id}"]\`), modeSelect = $(\`[data-item-pricing-mode="\${id}"]\`);
  if (modeField) modeField.hidden = !unit;
  if (modeSelect) { if (unit) modeSelect.value = mode; modeSelect.disabled = !unit || finalized; }
  const modeHelp = $(\`[data-mode-help="\${id}"]\`);
  if (modeHelp) modeHelp.textContent = mode === 'shared_unit' ? '\u670B\u53CB\u53EF\u7533\u5831\u500B\u4EBA\u6578\u91CF\uFF0C\u6216\u53C3\u8207\u5E73\u5206\u500B\u4EBA\u7533\u5831\u5F8C\u7684\u5269\u9918\u5DF2\u8CFC\u4EFD\u91CF\u3002' : '\u670B\u53CB\u6309\u81EA\u5DF1\u5BE6\u969B\u6578\u91CF\u8A08\u7B97\u3002';
  const modeText = $(\`[data-price-mode="\${id}"]\`);
  if (modeText) modeText.textContent = !unit ? \`\u6574\u9805\u7E3D\u984D\uFF1A\${money(item.priceCents)}\uFF0C\u7531\u9078\u7528\u670B\u53CB\u5E73\u5206\` : mode === 'shared_unit' ? \`\u500B\u4EBA\u6578\u91CF\uFF0B\u5171\u4EAB\u9918\u91CF\uFF1A\u6BCF\${unit} \${money(item.priceCents)}\uFF1B\u500B\u4EBA\u7533\u5831\u5148\u8A08\uFF0C\u53C3\u8207\u8005\u5E73\u5206\u5269\u9918\u5DF2\u8CFC\u4EFD\u91CF\` : \`\u55AE\u50F9\uFF1A\u6BCF\${unit} \${money(item.priceCents)}\uFF0C\u6309\u500B\u4EBA\u6578\u91CF\u8A08\uFF0C\u4E0D\u518D\u5E73\u5206\`;
  const price = $(\`[data-item-price="\${id}"]\`);
  if (price) price.setAttribute('aria-label', unit ? \`\${item.name}\u6BCF\${unit}\u55AE\u50F9\` : \`\${item.name}\u6574\u9805\u7E3D\u984D\`);
  const expectedField = $(\`[data-expected-field="\${id}"]\`), expected = expectedField?.querySelector('[data-item-expected]');
  if (expectedField) expectedField.hidden = !unit;
  if (expected) { expected.disabled = !unit || finalized; expected.required = !!unit; expected.setAttribute('aria-label', \`\${item.name}\u5BE6\u969B\u5DF2\u8CFC\u6578\u91CF\${unit}\`); }
  const expectedUnit = $(\`[data-expected-unit="\${id}"]\`); if (expectedUnit) expectedUnit.textContent = unit;
  const expectedHelp = $(\`[data-expected-help="\${id}"]\`); if (expectedHelp) expectedHelp.textContent = mode === 'shared_unit' ? '\u6309\u6B64\u6578\u91CF\u6263\u9664\u500B\u4EBA\u7533\u5831\u5F8C\uFF0C\u5269\u9918\u4EFD\u91CF\u624D\u7531\u53C3\u8207\u8005\u5E73\u5206\uFF1B\u7D50\u7B97\u524D\u9700\u586B\u5BEB\u3002' : '\u7D50\u7B97\u524D\u9700\u586B\u5BEB\u5BE6\u969B\u5DF2\u8CFC\u6578\u91CF\uFF0C\u4E26\u8207\u670B\u53CB\u7533\u5831\u4EFD\u6578\u76F8\u7B26\u3002';
}
function updateManagerDraftFromInputs() {
  if (!managerData) return;
  if ($('#bill-title')) managerData.title = $('#bill-title').value;
  $$('[data-item-name]').forEach(input => { const item = managerData.items.find(row => row.id === input.dataset.itemName); if (item) item.name = input.value; });
  $$('[data-item-unit]').forEach(input => { const item = managerData.items.find(row => row.id === input.dataset.itemUnit); if (item) { item.unit = input.value.trim(); if (!item.unit) item.pricingMode = 'split_total'; else if (!['per_unit','shared_unit'].includes(item.pricingMode)) item.pricingMode = 'per_unit'; } });
  $$('[data-item-pricing-mode]').forEach(select => { const item = managerData.items.find(row => row.id === select.dataset.itemPricingMode); if (item?.unit) item.pricingMode = select.value; });
  $$('[data-item-expected]').forEach(input => { const item = managerData.items.find(row => row.id === input.dataset.itemExpected); if (item) item.expectedQty = item.unit && input.value !== '' ? Number(input.value) : null; });
  $$('[data-item-price]').forEach(input => { const item = managerData.items.find(row => row.id === input.dataset.itemPrice); if (item) item.priceCents = Math.max(0, Math.round((Number(input.value)||0)*100)); });
  $$('[data-friend-name]').forEach(input => { const friend = managerData.friends.find(row => row.id === input.dataset.friendName); if (friend) friend.name = input.value; });
}
async function saveManagerChanges() {
  updateManagerDraftFromInputs();
  const missingSharedCount = managerData.items.find(item => item.pricingMode === 'shared_unit' && item.expectedQty === null);
  if (missingSharedCount) { showInlineError('#managerError', \`\u300C\${missingSharedCount.name}\u300D\u591A\u4EBA\u5171\u4EAB\u9700\u586B\u5BE6\u969B\u5DF2\u8CFC\u6578\u91CF\u3002\`); $(\`[data-item-expected="\${CSS.escape(missingSharedCount.id)}"]\`)?.focus(); return; }
  try {
    managerData = await api(adminPath(), { method:'PUT', admin:true, body:{ title:managerData.title, items:managerData.items, friends:managerData.friends } });
    renderManagerView();
    await loadPublic();
    flash('\u8B8A\u66F4\u5DF2\u5132\u5B58');
  } catch (error) { showInlineError('#managerError', error.message); }
}
function bindManager() {
  $('#bill-title')?.addEventListener('input', () => { managerData.title = $('#bill-title').value; });
  $$('[data-item-name]').forEach(input => input.addEventListener('input', () => { const item=managerData.items.find(row=>row.id===input.dataset.itemName); if(item)item.name=input.value; }));
  $$('[data-item-unit]').forEach(input => input.addEventListener('input', () => { const item=managerData.items.find(row=>row.id===input.dataset.itemUnit); if(item){ const hadUnit=!!item.unit; item.unit=input.value.trim(); if(!item.unit){ item.pricingMode='split_total'; item.expectedQty=null; } else if(!hadUnit || !['per_unit','shared_unit'].includes(item.pricingMode)){ item.pricingMode='per_unit'; } refreshManagerItem(item); } }));
  $$('[data-item-pricing-mode]').forEach(select => select.addEventListener('change', () => { const item=managerData.items.find(row=>row.id===select.dataset.itemPricingMode); if(item?.unit){ item.pricingMode=select.value; refreshManagerItem(item); } }));
  $$('[data-item-expected]').forEach(input => input.addEventListener('input', () => { const item=managerData.items.find(row=>row.id===input.dataset.itemExpected); if(item)item.expectedQty=item.unit&&input.value!==''?Number(input.value):null; }));
  $$('[data-item-price]').forEach(input => input.addEventListener('input', () => { const item=managerData.items.find(row=>row.id===input.dataset.itemPrice); if(item)item.priceCents=Math.max(0,Math.round((Number(input.value)||0)*100)); }));
  $$('[data-friend-name]').forEach(input => input.addEventListener('input', () => { const friend=managerData.friends.find(row=>row.id===input.dataset.friendName); if(friend)friend.name=input.value; }));
  $('#saveManager')?.addEventListener('click', saveManagerChanges);
  $('#addItem')?.addEventListener('click', () => { updateManagerDraftFromInputs(); managerData.items.push({ id:\`dish-\${crypto.randomUUID().slice(0,8)}\`, name:'\u65B0\u9805\u76EE', unit:'', priceCents:0, pricingMode:'split_total', expectedQty:null }); renderManagerView(); $('#managerView details').open=true; });
  $('#addFriend')?.addEventListener('click', () => { updateManagerDraftFromInputs(); const id=\`friend-\${crypto.randomUUID().slice(0,8)}\`; let name='\u65B0\u670B\u53CB', n=2; while(managerData.friends.some(person=>person.name===name))name=\`\u65B0\u670B\u53CB\${n++}\`; managerData.friends.push({id,name}); renderManagerView(); $('#managerView details').open=true; });
  $$('[data-remove-item]').forEach(button => button.addEventListener('click', () => openDeleteDialog('item', button.dataset.removeItem, button)));
  $$('[data-remove-friend]').forEach(button => button.addEventListener('click', () => openDeleteDialog('friend', button.dataset.removeFriend, button)));
  $('#finalizeBill')?.addEventListener('click', async () => {
    try { managerData = await api(\`\${adminPath()}/finalize\`, { method:'POST', admin:true }); renderManagerView(); await loadPublic(); flash('\u5E33\u55AE\u5DF2\u7D50\u7B97\uFF1B\u5206\u4EAB\u9023\u7D50\u4E0D\u8B8A'); }
    catch (error) {
      if (['not_ready'].includes(error.code)) {
        try { managerData = await api(adminPath(), { admin:true }); renderManagerView(); updateHero(); } catch {}
        if ($('#quantityReminder')) $('#quantityReminder').scrollIntoView({ behavior:'smooth', block:'center' });
        flash(error.message);
      } else showInlineError('#managerError', error.message);
    }
  });
  $('#copyLink')?.addEventListener('click', copyLink);
}
function openDeleteDialog(type, id, trigger) {
  updateManagerDraftFromInputs();
  const entity = type === 'item' ? managerData.items.find(row=>row.id===id) : managerData.friends.find(row=>row.id===id);
  if (!entity) return;
  pendingDelete = { type, id };
  deleteReturnFocus = trigger;
  $('#deleteConfirmTitle').textContent = \`\u78BA\u5B9A\u8981\u522A\u9664\u300C\${entity.name}\u300D\uFF1F\`;
  const hasData = type === 'friend' && managerData.submissions[id]?.submitted;
  $('#deleteConfirmCopy').textContent = type === 'item'
    ? '\u522A\u9664\u5F8C\u6703\u5F9E\u5E33\u55AE\u79FB\u9664\u6B64\u9805\u76EE\uFF0C\u4E26\u4E00\u4F75\u6E05\u9664\u670B\u53CB\u5728\u6B64\u9805\u76EE\u7684\u5DF2\u586B\u4EFD\u6578\u3002'
    : hasData ? \`\u300C\${entity.name}\u300D\u5DF2\u63D0\u4EA4\u8CC7\u6599\uFF1B\u522A\u9664\u670B\u53CB\u6642\uFF0C\u8A72\u670B\u53CB\u7684\u7533\u5831\u8CC7\u6599\u4EA6\u6703\u4E00\u4F75\u79FB\u9664\u3002\` : '\u522A\u9664\u5F8C\u6703\u5F9E\u670B\u53CB\u540D\u55AE\u79FB\u9664\u6B64\u4EBA\u3002';
  $('#deleteConfirmDialog').showModal();
  $('#cancelDelete').focus();
}
function cancelDelete() {
  const dialog = $('#deleteConfirmDialog');
  if (!dialog.open) return;
  dialog.close();
  pendingDelete = null;
  const trigger = deleteReturnFocus;
  deleteReturnFocus = null;
  if (trigger?.isConnected) trigger.focus();
}
async function confirmDelete() {
  if (!pendingDelete || !managerData) return;
  const { type, id } = pendingDelete;
  pendingDelete = null; deleteReturnFocus = null;
  $('#deleteConfirmDialog').close();
  updateManagerDraftFromInputs();
  if (type === 'item') {
    managerData.items = managerData.items.filter(item => item.id !== id);
    Object.values(managerData.submissions).forEach(sub => { if (sub.quantities) delete sub.quantities[id]; });
  } else {
    managerData.friends = managerData.friends.filter(friend => friend.id !== id);
    delete managerData.submissions[id];
  }
  await saveManagerChanges();
  $('#addItem, #addFriend')?.focus();
}
function leaveManager() {
  history.replaceState(null, '', \`/?bill=\${encodedBill}\`);
  activeView = 'friend';
  adminKey = '';
  managerData = null;
  $('#managerView').replaceChildren();
  renderTabs();
  renderFriendView();
}
function syncManagerCheckMarkers() {
  if (!managerData || !publicData || activeView !== 'manager') return;
  const checked = (publicData.items || []).filter(item => item.needsCheck === true);
  const byId = new Map(checked.map(item => [item.id, item]));
  managerData.items.forEach(item => {
    const publicItem = byId.get(item.id);
    const needsCheck = !!publicItem;
    const box = $(\`[data-item-editor="\${CSS.escape(item.id)}"]\`);
    if (!box) return;
    box.classList.toggle('needs-check', needsCheck);
    item.needsCheck = needsCheck;
    let marker = box.querySelector('[data-needs-check-marker]');
    const markerText = (publicItem?.pricingMode || item.pricingMode) === 'shared_unit' ? '\u5927\u5BB6\u518D\u78BA\u8A8D\u4EFD\u91CF\uFF0F\u5171\u4EAB' : '\u5927\u5BB6\u518D\u5C0D\u4E00\u5C0D\u4EFD\u91CF';
    if (needsCheck && !marker) {
      marker = document.createElement('span');
      marker.className = 'needs-check-marker';
      marker.dataset.needsCheckMarker = '';
      marker.textContent = markerText;
      box.querySelector('.item-price-mode')?.after(marker);
    } else if (needsCheck && marker) marker.textContent = markerText;
    else if (!needsCheck && marker) marker.remove();
  });
  const quantityWarningIds = new Set((managerData.readiness?.quantityMismatches || []).map(row => row.id));
  const quantityChecked = checked.filter(item => quantityWarningIds.has(item.id));
  const reminder = $('#quantityReminder');
  if (quantityChecked.length && managerData.status !== 'final') {
    const missingOnly = quantityChecked.every(publicItem => {
      const item = managerData.items.find(row => row.id === publicItem.id);
      return item && (item.expectedQty === null || item.expectedQty === undefined);
    });
    const text = missingOnly ? '\u5BE6\u969B\u8CB7\u5165\u6578\u91CF\u672A\u586B\uFF0C\u5927\u5BB6\u518D\u6838\u5C0D\u4E00\u4E0B\u3002' : '\u7533\u5831\u4EFD\u6578\u540C\u5BE6\u969B\u5DF2\u8CFC\u6578\u91CF\u6709\u5572\u51FA\u5165\uFF0C\u5927\u5BB6\u518D\u6AA2\u67E5\u4E00\u4E0B\u3002';
    let current = reminder;
    if (!current) {
      current = document.createElement('section');
      current.className = 'quantity-reminder';
      current.id = 'quantityReminder';
      current.setAttribute('role','status');
      current.setAttribute('aria-live','polite');
      const actions = $('#managerView .main-manager-actions');
      actions?.parentNode.insertBefore(current, actions);
    }
    current.innerHTML = \`<p>\${text}</p>\`;
  } else if (reminder) reminder.remove();
  setParticipationReminder(managerData.readiness?.participationPrompts || [], managerData.status === 'final');
}
function syncManagerReadiness(fresh) {
  if (!managerData || !fresh || activeView !== 'manager') return;
  managerData.status = fresh.status;
  managerData.progress = fresh.progress;
  managerData.submissions = fresh.submissions;
  managerData.readiness = fresh.readiness;
  managerData.draftResults = fresh.draftResults;
  managerData.results = fresh.results;
  const finalized = fresh.status === 'final';
  const calculations = fresh.results || fresh.draftResults || {};
  const totals = calculations.centsByFriend || {};
  const allocated = calculations.grandCents || 0;
  const unallocated = calculations.unallocatedCents || 0;
  const submitted = fresh.progress?.submitted || 0, totalFriends = fresh.progress?.total || 0;
  const allSubmitted = submitted === totalFriends;
  const total = allSubmitted ? (calculations.billTotalCents ?? allocated + unallocated) : allocated;
  if ($('#summaryLabel')) $('#summaryLabel').textContent = finalized ? '\u5168\u55AE\u7E3D\u984D' : allSubmitted ? '\u9810\u8A08\u5168\u55AE\u7E3D\u984D' : '\u5DF2\u63D0\u4EA4\u4EFD\u91CF\u4F30\u7B97';
  if ($('#summaryTotal')) $('#summaryTotal').textContent = money(total);
  if ($('#summaryPeople')) $('#summaryPeople').textContent = \`\${fresh.friends.length} \u4F4D\u670B\u53CB\`;
  if ($('#summaryProgress')) $('#summaryProgress').textContent = finalized ? '\u5DF2\u7D50\u7B97' : \`\u5DF2\u6536\u9F4A \${submitted} / \${totalFriends}\`;
  fresh.friends.forEach(friend => {
    const row = $(\`[data-person-row="\${CSS.escape(friend.id)}"]\`);
    const sub = fresh.submissions[friend.id];
    if (row) {
      const copy = row.querySelector('.person-copy span'); if (copy) copy.textContent = sub?.submitted ? '\u5DF2\u63D0\u4EA4' : '\u672A\u63D0\u4EA4';
      const amount = row.querySelector('.person-amount'); if (amount) amount.textContent = sub?.submitted ? money(totals[friend.id] || 0) : '\u5C1A\u672A\u63D0\u4EA4';
    }
  });
  let unallocatedEl = $('#unallocatedNote');
  const unallocatedHtml = fresh.readiness?.everyone ? unallocatedSummaryHtml(calculations, finalized) : '';
  if (unallocatedHtml) {
    const template = document.createElement('template');
    template.innerHTML = unallocatedHtml.trim();
    const next = template.content.firstElementChild;
    if (unallocatedEl) unallocatedEl.replaceWith(next);
    else $('#summaryProgress')?.parentNode.insertAdjacentElement('afterend', next);
  } else unallocatedEl?.remove();
  setParticipationReminder(fresh.readiness?.participationPrompts || [], finalized);
  const finalize = $('#finalizeBill');
  if (finalize) { finalize.disabled = finalized || !fresh.readiness?.ready; finalize.innerHTML = \`<span aria-hidden="true">\u2713</span> \${finalized ? '\u5DF2\u7D50\u7B97\u4E26\u767C\u5E03\u7D50\u679C' : '\u7D50\u7B97\u4E26\u767C\u5E03\u7D50\u679C'}\`; }
  if ($('#readinessHint')) $('#readinessHint').textContent = managerReadinessHint(fresh.readiness, allSubmitted, finalized);
  if (finalized && !$('#managerView .lock-note')) $('#readinessHint')?.insertAdjacentHTML('afterend','<section class="lock-note">\u5E33\u55AE\u5DF2\u5B8C\u6210\uFF1B\u6240\u6709\u4FEE\u6539\u53CA\u65B0\u7533\u5831\u5747\u5DF2\u9396\u5B9A\u3002</section>');
  if (!finalized) $('#managerView .lock-note')?.remove();
  syncManagerCheckMarkers();
}

async function copyLink() {
  const link = new URL(location.href);
  link.searchParams.delete('manage');
  try { await navigator.clipboard.writeText(link.href); flash('\u670B\u53CB\u586B\u5BEB\u9023\u7D50\u5DF2\u8907\u88FD'); }
  catch { flash('\u8ACB\u5F9E\u7DB2\u5740\u5217\u8907\u88FD\u5206\u4EAB\u9023\u7D50'); }
}

$('#friendTab').addEventListener('click', leaveManager);
$('#cancelDelete').addEventListener('click', cancelDelete);
$('#confirmDelete').addEventListener('click', confirmDelete);
$('#deleteConfirmDialog').addEventListener('cancel', event => { event.preventDefault(); cancelDelete(); });
$('#deleteConfirmDialog').addEventListener('click', event => { if (event.target === $('#deleteConfirmDialog')) cancelDelete(); });

initPush();
loadPublic().then(() => renderActiveView());
setInterval(async () => {
  const before = publicData ? JSON.stringify(publicData) : '';
  await loadPublic();
  if (before !== JSON.stringify(publicData)) {
    if (activeView === 'friend') renderFriendView();
    else if (adminKey && managerData) {
      try { syncManagerReadiness(await api(adminPath(), { admin:true })); }
      catch { syncManagerCheckMarkers(); }
    } else syncManagerCheckMarkers();
  }
}, 3000);
` }, "/style.css": { "contentType": "text/css; charset=utf-8", "text": "\n.push-card{margin:0 0 16px;padding:17px;border:1px solid #d4e0e1;border-radius:20px;background:#fff;box-shadow:var(--shadow)}.push-card-heading{display:grid;gap:12px}.push-card-heading h3{margin:0;color:#254d43;font-size:19px;line-height:1.3}.push-card-heading p{margin:4px 0 0;color:#788680;font-size:15px}.push-toggle{width:100%;min-height:52px;font-size:17px}.push-note{margin:10px 1px 0;color:#718079;font-size:14px;line-height:1.5}\n" }, "/service-worker.js": { "contentType": "text/javascript; charset=utf-8", "text": "self.addEventListener('push', event => {\n  event.waitUntil((async () => {\n    let payload = {};\n    try { payload = event.data ? event.data.json() : {}; } catch {}\n    const title = payload.title === '\u5206\u5E33\u7D50\u679C\u5DF2\u6E96\u5099\u597D' ? payload.title : '\u5206\u5E33\u7D50\u679C\u5DF2\u6E96\u5099\u597D';\n    const body = '\u958B\u555F\u5206\u5E33\u7BA1\u5BB6\uFF0C\u67E5\u770B\u4F60\u7684\u500B\u4EBA\u7D50\u679C\u3002';\n    let target = new URL('./', self.registration.scope);\n    try {\n      const candidate = new URL(payload.url || './', self.registration.scope);\n      if (candidate.origin === self.location.origin && candidate.pathname.startsWith(new URL(self.registration.scope).pathname)) target = candidate;\n    } catch {}\n    await self.registration.showNotification(title, {\n      body,\n      icon: new URL('icon.png', self.registration.scope).toString(),\n      badge: new URL('icon.png', self.registration.scope).toString(),\n      tag: 'bill-result-ready',\n      renotify: false,\n      data: { url: target.toString() },\n    });\n  })());\n});\n\nself.addEventListener('notificationclick', event => {\n  event.notification.close();\n  event.waitUntil((async () => {\n    let target = new URL('./', self.registration.scope);\n    try {\n      const candidate = new URL(event.notification.data?.url || './', self.registration.scope);\n      if (candidate.origin === self.location.origin && candidate.pathname.startsWith(new URL(self.registration.scope).pathname)) target = candidate;\n    } catch {}\n    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });\n    for (const client of windows) {\n      if ('focus' in client) {\n        await client.navigate(target.toString());\n        return client.focus();\n      }\n    }\n    return self.clients.openWindow(target.toString());\n  })());\n});\n" }, "/manifest.webmanifest": { "contentType": "application/manifest+json; charset=utf-8", "text": '{\n  "name": "\u5206\u5E33\u7BA1\u5BB6",\n  "short_name": "\u5206\u5E33\u7BA1\u5BB6",\n  "start_url": "./?bill=sample-dinner",\n  "scope": "./",\n  "display": "standalone",\n  "background_color": "#f5f8f6",\n  "theme_color": "#f5f8f6",\n  "icons": [\n    { "src": "icon.png", "sizes": "180x180", "type": "image/png", "purpose": "any maskable" }\n  ]\n}\n' }, "/icon.png": { "contentType": "image/png", "base64": "iVBORw0KGgoAAAANSUhEUgAAALQAAAC0CAIAAACyr5FlAAADeklEQVR42u3dvW7iQBSAUTPiGbJ1nizbpqfbNtulp903o94HAFFuEWmFiJD/B9875+uSxtgc7tjGUXbn66Wr1evne6d5nQ7HatvarYqDhtBWVsHBRA4lC+PAIhORxXBgkY/IAjiwyEpkFg4schMpZORuzts0ZXJg0cgIKWQYIcvgIKMpH4UMPubiIKNBH4UMPqbjIKNZH4UMPqbgIKNxH4UMPha4lFVrFWNDj97uQoYevemWFQ1eVowNw8Pk0MjJYWwYHiaHRk4OY0N3DEwO9U0OY0Pfh4fJoWFXK9Jtu/P1EnRN+fvrT5SX+uP3z3CH93Q47pmo+ZpjKSlkeP0ZcESXEW4vimNqXx6ekL58vDmazlKjTo6UMkLsV3EE7V2SqxXBISekS0zdjZ/Whd6F2JNj+yf8EW+cZ8AR5bjH9eGcQ3AIDsEhOASH4BAcgkNwCA4JDsEhOLRm+0w7s5FHMkM/w2FyCA7BITgEh+AQHApcqvscaW4wmByCQ3AIDsEhwSE4BIfgEByCQ3AIDuVpn3Kvav5/k6D/S6VFHHd/nfD140pvW81tWVYER62x0fv7KNuCQ3AIjqf06GRwjZPEmtuCQy5lqwyPOvceam4LjtVnfvRtWVYEh+AQHIJDcEhwCA7BIThUKc+QRtoWHMu8Vbc/eobUsiI4Bn+Ue38fZVtwCA7B8ZQ8QwqHXMrO+EB7hhSO0TM/+rYsK4JDcAgOwSE4JDgEh+AQHKqUZ0gjbQuOZd6q2x89Q2pZERyDP8q9v4+yLTgEh+B4Sp4hhUMuZWd8oD1DCsfomR99W5YVwSE4BIfgEBwSHIJDreGI8uV43C/xY0+O7R/30I937F4+3hzcJ7blu+/OOQSH8uFI/J3n9veunA5HR9B+fe90OBbH0R6FP+fI5CPKvhTH1F4kuVqJ7iPW69+dr5eu614/38Md6ED3x8KZ/rpM2fsUKsmyoifg2P7dDlVeU0wODVtWDA/dMTA5NOyE1PAwNlytaNKlrOFhbJgcGj85DA9jo2dy8EGGZUUjlxXDw9jonxx8tCyjf1nho1kZg845+GhTxtATUj4alDHiaoWP1mSMu5TloykZ3dj7HHy0I6ObcBOMj0ZkdP//NGFCEf+aAYt1J4cR0oiMWZPDCEnMYjEciORjsTAORDKxWAUHIjlYrIiDktAmKuFgJZaGu/4BAuKGMkEnDkQAAAAASUVORK5CYII=" }, "/icon.svg": { "contentType": "image/svg+xml; charset=utf-8", "text": '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180"><rect width="180" height="180" rx="42" fill="#16845f"/><rect x="52" y="31" width="76" height="118" rx="13" fill="none" stroke="#fff" stroke-width="10"/><path d="M68 61h44M70 84h7m26 0h7m-40 20h7m26 0h7m-40 20h7m26 0h7" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round"/></svg>\n' } };

// worker/index.js
var SAMPLE_ID = "sample-dinner";
var MAX_BODY = 64 * 1024;
var PIN_ITERATIONS = 1e5;
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Vary": "Origin"
  };
  if (origin && origin === env.ALLOWED_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}
__name(corsHeaders, "corsHeaders");
function json(request, env, status, value) {
  return new Response(JSON.stringify(value), { status, headers: corsHeaders(request, env) });
}
__name(json, "json");
function fail(request, env, status, code, message) {
  return json(request, env, status, { error: code, message });
}
__name(fail, "fail");
function staticAssetResponse(request, url) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
  }
  const path = url.pathname === "/" ? "/index.html" : url.pathname;
  const asset = STATIC_ASSETS[path];
  if (!asset) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  const body = asset.base64 ? Uint8Array.from(atob(asset.base64), (character) => character.charCodeAt(0)) : asset.text;
  const headers = new Headers({
    "Content-Type": asset.contentType,
    "Cache-Control": path === "/index.html" ? "no-cache" : "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Cross-Origin-Resource-Policy": "same-origin"
  });
  if (path === "/service-worker.js") headers.set("Service-Worker-Allowed", "/");
  return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
}
__name(staticAssetResponse, "staticAssetResponse");
function clone(value) {
  return structuredClone(value);
}
__name(clone, "clone");
function safeEqual(a, b) {
  const x = new TextEncoder().encode(String(a || ""));
  const y = new TextEncoder().encode(String(b || ""));
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
__name(safeEqual, "safeEqual");
function isAdmin(request, env) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("Authorization") || "");
  return !!env.ADMIN_KEY && !!match && safeEqual(match[1], env.ADMIN_KEY);
}
__name(isAdmin, "isAdmin");
function b64url(bytes) {
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(b64url, "b64url");
function fromB64url(value) {
  const raw = atob(String(value).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(value).length + 3) % 4));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}
__name(fromB64url, "fromB64url");
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return b64url(bytes);
}
__name(randomToken, "randomToken");
async function tokenHash(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(token || "")));
  return b64url(new Uint8Array(digest));
}
__name(tokenHash, "tokenHash");
async function tokenMatches(token, storedHash) {
  if (!token || !storedHash) return false;
  return safeEqual(await tokenHash(token), storedHash);
}
__name(tokenMatches, "tokenMatches");
async function hashPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: PIN_ITERATIONS, hash: "SHA-256" }, key, 256);
  return { salt: b64url(salt), hash: b64url(new Uint8Array(bits)), iterations: PIN_ITERATIONS };
}
__name(hashPin, "hashPin");
async function pinMatches(pin, record) {
  if (typeof pin !== "string" || !record?.salt || !record?.hash) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: fromB64url(record.salt), iterations: record.iterations || PIN_ITERATIONS, hash: "SHA-256" }, key, 256);
  return safeEqual(b64url(new Uint8Array(bits)), record.hash);
}
__name(pinMatches, "pinMatches");
function makeSample() {
  return {
    id: SAMPLE_ID,
    title: "\u71D2\u8089\u805A\u9910",
    items: [
      { id: "dish-roast", name: "\u70AD\u71D2\u5957\u9910", unit: "\u4EFD", priceCents: 22800, pricingMode: "per_unit", expectedQty: 3 },
      { id: "dish-drink", name: "\u98F2\u54C1", unit: "\u676F", priceCents: 1400, pricingMode: "per_unit", expectedQty: 21 },
      { id: "dish-dessert", name: "\u751C\u54C1", unit: "\u4EFD", priceCents: 3e3, pricingMode: "per_unit", expectedQty: 9 }
    ],
    friends: [
      { id: "friend-ming", name: "\u963F\u660E" },
      { id: "friend-ching", name: "\u5C0F\u6674" },
      { id: "friend-ken", name: "Ken" },
      { id: "friend-yuki", name: "Yuki" }
    ],
    submissions: {},
    completed: false,
    finalizedAt: null
  };
}
__name(makeSample, "makeSample");
function validateId(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{2,63}$/.test(value);
}
__name(validateId, "validateId");
function validateBillInput(input) {
  if (!input || typeof input !== "object" || !validateId(input.id)) throw new Error("\u5E33\u55AE ID \u683C\u5F0F\u4E0D\u6B63\u78BA");
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 30) throw new Error("\u9805\u76EE\u6578\u91CF\u9700\u70BA 1 \u81F3 30");
  if (!Array.isArray(input.friends) || input.friends.length < 1 || input.friends.length > 100) throw new Error("\u670B\u53CB\u6578\u91CF\u9700\u70BA 1 \u81F3 100");
  const title = String(input.title || "").trim().slice(0, 60) || "\u672A\u547D\u540D\u5E33\u55AE";
  const ids = /* @__PURE__ */ new Set();
  const items = input.items.map((item) => {
    if (!item || !validateId(item.id) || ids.has(item.id)) throw new Error("\u9805\u76EE ID \u91CD\u8907\u6216\u683C\u5F0F\u4E0D\u6B63\u78BA");
    ids.add(item.id);
    const priceCents = Number(item.priceCents);
    if (!Number.isSafeInteger(priceCents) || priceCents < 0 || priceCents > 1e8) throw new Error("\u9805\u76EE\u91D1\u984D\u4E0D\u6B63\u78BA");
    const name = String(item.name || "").trim().slice(0, 40);
    if (!name) throw new Error("\u9805\u76EE\u540D\u7A31\u4E0D\u53EF\u7559\u7A7A");
    const unit = String(item.unit ?? "").trim().slice(0, 4);
    const suppliedMode = item.pricingMode;
    if (suppliedMode !== void 0 && !["split_total", "per_unit", "shared_unit"].includes(suppliedMode)) throw new Error("\u8A08\u50F9\u65B9\u5F0F\u4E0D\u6B63\u78BA");
    if (unit && suppliedMode === "split_total") throw new Error("\u6709\u55AE\u4F4D\u9805\u76EE\u9700\u9078\u64C7\u6309\u6578\u91CF\u6216\u591A\u4EBA\u5171\u4EAB");
    if (!unit && suppliedMode && suppliedMode !== "split_total") throw new Error("\u7121\u55AE\u4F4D\u9805\u76EE\u53EA\u53EF\u6309\u6574\u9805\u7E3D\u984D\u5E73\u5206");
    const pricingMode = unit ? suppliedMode || "per_unit" : "split_total";
    let expectedQty = null;
    if (unit && item.expectedQty !== void 0 && item.expectedQty !== null && item.expectedQty !== "") {
      expectedQty = Number(item.expectedQty);
      if (!Number.isSafeInteger(expectedQty) || expectedQty < 0 || expectedQty > 9900) throw new Error("\u5DF2\u8CFC\u6578\u91CF\u9700\u70BA 0 \u81F3 9900 \u7684\u6574\u6578");
    }
    return { id: item.id, name, unit, priceCents, pricingMode, expectedQty };
  });
  ids.clear();
  const friends = input.friends.map((friend) => {
    if (!friend || !validateId(friend.id) || ids.has(friend.id)) throw new Error("\u670B\u53CB ID \u91CD\u8907\u6216\u683C\u5F0F\u4E0D\u6B63\u78BA");
    ids.add(friend.id);
    const name = String(friend.name || "").trim().slice(0, 32);
    if (!name) throw new Error("\u670B\u53CB\u540D\u7A31\u4E0D\u53EF\u7559\u7A7A");
    return { id: friend.id, name };
  });
  return { id: input.id, title, items, friends, submissions: {}, completed: false, finalizedAt: null };
}
__name(validateBillInput, "validateBillInput");
async function readBody(request) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > MAX_BODY) throw new Error("\u8ACB\u6C42\u8CC7\u6599\u592A\u5927");
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw new Error("\u8ACB\u6C42\u8CC7\u6599\u592A\u5927");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("JSON \u683C\u5F0F\u4E0D\u6B63\u78BA");
  }
}
__name(readBody, "readBody");
async function getBill(env, id) {
  const row = await env.DB.prepare("SELECT document FROM bills WHERE id = ?").bind(id).first();
  if (!row) {
    if (id !== SAMPLE_ID) return null;
    const sample = makeSample();
    await env.DB.prepare("INSERT OR IGNORE INTO bills (id, document, updated_at) VALUES (?, ?, ?)").bind(sample.id, JSON.stringify(sample), (/* @__PURE__ */ new Date()).toISOString()).run();
    return getBill(env, id);
  }
  try {
    return JSON.parse(row.document);
  } catch {
    throw new Error("\u5E33\u55AE\u8CC7\u6599\u640D\u6BC0");
  }
}
__name(getBill, "getBill");
async function saveBillCAS(env, before, after) {
  const previousJson = JSON.stringify(before);
  const nextJson = JSON.stringify(after);
  const result = await env.DB.prepare("UPDATE bills SET document = ?, updated_at = ? WHERE id = ? AND document = ?").bind(nextJson, (/* @__PURE__ */ new Date()).toISOString(), before.id, previousJson).run();
  return Number(result.meta?.changes || 0) === 1;
}
__name(saveBillCAS, "saveBillCAS");
async function countRecentPinFailures(env, billId, friendId) {
  const result = await env.DB.prepare("SELECT COUNT(*) AS n FROM pin_failures WHERE bill_id = ? AND friend_id = ? AND failed_at > ?").bind(billId, friendId, Date.now() - 15 * 60 * 1e3).first();
  return Number(result?.n || 0);
}
__name(countRecentPinFailures, "countRecentPinFailures");
async function recordWrongPin(env, billId, friendId) {
  await env.DB.prepare("INSERT INTO pin_failures (bill_id, friend_id, failed_at) VALUES (?, ?, ?)").bind(billId, friendId, Date.now()).run();
}
__name(recordWrongPin, "recordWrongPin");
async function clearPinFailures(env, billId, friendId) {
  await env.DB.prepare("DELETE FROM pin_failures WHERE bill_id = ? AND friend_id = ?").bind(billId, friendId).run();
}
__name(clearPinFailures, "clearPinFailures");
function pushIsConfigured(env) {
  return !!(env.VAPID_SUBJECT && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.PUBLIC_APP_URL);
}
__name(pushIsConfigured, "pushIsConfigured");
async function authorizePushOwner(request, env, bill, friendId, body) {
  const friend = friendFor(bill, friendId);
  if (!friend) return fail(request, env, 404, "friend_not_found", "\u627E\u4E0D\u5230\u9019\u4F4D\u670B\u53CB");
  const submission = bill.submissions[friendId];
  if (!submission?.submitted) return fail(request, env, 401, "submission_required", "\u8ACB\u5148\u63D0\u4EA4\u81EA\u5DF1\u7684\u5206\u5E33\uFF0C\u624D\u53EF\u8A2D\u5B9A\u7D50\u679C\u901A\u77E5");
  if (submission.pinRecord) {
    if (await countRecentPinFailures(env, bill.id, friendId) >= 8) return fail(request, env, 429, "rate_limited", "\u5617\u8A66\u6B21\u6578\u904E\u591A\uFF0C\u8ACB\u7A0D\u5F8C\u518D\u8A66");
    if (!body.pin || !await pinMatches(body.pin, submission.pinRecord)) {
      if (body.pin) await recordWrongPin(env, bill.id, friendId);
      return fail(request, env, 401, body.pin ? "wrong_pin" : "pin_required", "\u8ACB\u7528\u81EA\u5DF1\u7684\u4E09\u5B57\u5143\u7DE8\u8F2F\u78BC\u78BA\u8A8D\u901A\u77E5\u8A2D\u5B9A");
    }
  } else if (!await tokenMatches(body.ownerToken, submission.ownerTokenHash)) {
    return fail(request, env, 401, "device_required", "\u8ACB\u5728\u9996\u6B21\u63D0\u4EA4\u7684\u88DD\u7F6E\u8A2D\u5B9A\u901A\u77E5");
  }
  await clearPinFailures(env, bill.id, friendId);
  return null;
}
__name(authorizePushOwner, "authorizePushOwner");
async function handlePushSubscription(request, env, bill, friendId, body) {
  const denial = await authorizePushOwner(request, env, bill, friendId, body);
  if (denial) return denial;
  if (request.method === "POST") {
    if (bill.completed) return fail(request, env, 423, "bill_finalized", "\u5E33\u55AE\u5DF2\u7D50\u7B97\uFF1B\u4E0D\u80FD\u518D\u8A2D\u5B9A\u7D50\u679C\u901A\u77E5");
    if (!pushIsConfigured(env)) return fail(request, env, 503, "push_unavailable", "\u6B64\u8A66\u7528\u7AD9\u5C1A\u672A\u8A2D\u5B9A\u624B\u6A5F\u63A8\u9001\u670D\u52D9");
    const subscription = body.subscription;
    let parsed;
    try {
      parsed = new URL(subscription?.endpoint);
    } catch {
      return fail(request, env, 400, "invalid_subscription", "\u901A\u77E5\u8A02\u95B1\u8CC7\u6599\u4E0D\u6B63\u78BA");
    }
    const host = parsed.hostname.toLowerCase();
    const allowedHost = host === "fcm.googleapis.com" || host.endsWith(".push.services.mozilla.com") || host === "push.services.mozilla.com" || host.endsWith(".push.apple.com") || host.endsWith(".notify.windows.com");
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || !allowedHost || parsed.href.length > 4096 || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return fail(request, env, 400, "invalid_subscription", "\u901A\u77E5\u670D\u52D9\u7AEF\u9EDE\u683C\u5F0F\u4E0D\u6B63\u78BA");
    }
    const saved = { endpoint: parsed.href, expirationTime: subscription.expirationTime ?? null, keys: { p256dh: String(subscription.keys.p256dh), auth: String(subscription.keys.auth) } };
    const previous = await env.DB.prepare("SELECT endpoint FROM push_subscriptions WHERE bill_id = ? AND friend_id = ?").bind(bill.id, friendId).first();
    await env.DB.prepare(`INSERT INTO push_subscriptions (bill_id, friend_id, endpoint, subscription_json, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (bill_id, friend_id) DO UPDATE SET endpoint = excluded.endpoint, subscription_json = excluded.subscription_json, created_at = excluded.created_at`).bind(bill.id, friendId, saved.endpoint, JSON.stringify(saved), (/* @__PURE__ */ new Date()).toISOString()).run();
    return json(request, env, 200, { ok: true, subscribed: true, replaced: !!previous && previous.endpoint !== saved.endpoint, deviceLimit: 1 });
  }
  if (request.method === "DELETE") {
    const endpoint = String(body.endpoint || "");
    if (!endpoint) return fail(request, env, 400, "invalid_subscription", "\u627E\u4E0D\u5230\u6B64\u88DD\u7F6E\u7684\u901A\u77E5\u8A02\u95B1");
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE bill_id = ? AND friend_id = ? AND endpoint = ?").bind(bill.id, friendId, endpoint).run();
    return json(request, env, 200, { ok: true, subscribed: false });
  }
  return fail(request, env, 405, "method_not_allowed", "\u6B64\u64CD\u4F5C\u4E0D\u652F\u63F4");
}
__name(handlePushSubscription, "handlePushSubscription");
async function sendResultPushes(env, billId) {
  if (!pushIsConfigured(env)) return;
  const rows = await env.DB.prepare("SELECT id, endpoint, subscription_json FROM push_subscriptions WHERE bill_id = ?").bind(billId).all();
  const publicUrl = new URL(env.PUBLIC_APP_URL);
  publicUrl.searchParams.set("bill", billId);
  const message = {
    data: JSON.stringify(resultNotification(publicUrl.toString())),
    options: { ttl: 86400, urgency: "normal", topic: `bill-${billId}`.slice(0, 32) }
  };
  const vapid = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  for (const row of rows.results || []) {
    try {
      const subscription = JSON.parse(row.subscription_json);
      const payload = await buildPushPayload(message, subscription, vapid);
      const response = await fetch(subscription.endpoint, payload);
      if (response.status === 404 || response.status === 410) {
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(row.id).run();
      } else if (!response.ok) {
        console.warn("push service response status", response.status);
      }
    } catch (error) {
      console.warn("push send failed", String(error?.message || error).slice(0, 160));
    }
  }
}
__name(sendResultPushes, "sendResultPushes");
function publicBill(bill) {
  const readiness = readyToFinalize(bill);
  const needsCheckIds = new Set([...readiness.quantityMismatches, ...readiness.participationPrompts].map((row) => row.id));
  const selections = Object.fromEntries(bill.friends.flatMap(({ id }) => {
    const submission = bill.submissions[id];
    if (!submission?.submitted) return [];
    const quantities = Object.fromEntries(bill.items.map((item) => {
      const qty = Math.max(0, Number(submission.quantities?.[item.id]) || 0);
      return [item.id, !item.unit ? qty > 0 ? 1 : 0 : qty];
    }));
    const sharing = Object.fromEntries(bill.items.map((item) => [item.id, item.pricingMode === "shared_unit" && submission.sharing?.[item.id] === true]));
    return [[id, { quantities, sharing }]];
  }));
  return {
    id: bill.id,
    title: bill.title,
    items: bill.items.map(({ id, name, unit, priceCents, pricingMode }) => ({ id, name, unit, priceCents, pricingMode, needsCheck: needsCheckIds.has(id) })),
    friends: bill.friends.map(({ id, name }) => ({ id, name })),
    selections,
    status: bill.completed ? "final" : "draft"
  };
}
__name(publicBill, "publicBill");
function calculate(bill) {
  const centsByFriend = Object.fromEntries(bill.friends.map((friend) => [friend.id, 0]));
  const breakdown = [];
  let unallocatedCents = 0;
  for (const item of bill.items) {
    const claims = bill.friends.map((friend, order) => ({
      id: friend.id,
      order,
      qty: Math.max(0, Number(bill.submissions[friend.id]?.quantities?.[item.id]) || 0)
    }));
    let shares, itemTotalCents, itemUnallocatedCents = 0;
    if (item.pricingMode === "shared_unit") {
      const personalQty = claims.reduce((sum, claim) => sum + claim.qty, 0);
      const remainingQty = Number(item.expectedQty) - personalQty;
      const sharers = bill.friends.filter((friend) => bill.submissions[friend.id]?.sharing?.[item.id] === true);
      const sharedPoolCents = Math.max(0, remainingQty) * item.priceCents;
      const each = sharers.length ? Math.floor(sharedPoolCents / sharers.length) : 0;
      let remainderCents = sharers.length ? sharedPoolCents - each * sharers.length : 0;
      const shareCents = new Map(sharers.map((friend) => [friend.id, each + (remainderCents-- > 0 ? 1 : 0)]));
      shares = claims.map((claim) => ({ id: claim.id, cents: claim.qty * item.priceCents + (shareCents.get(claim.id) || 0), order: claim.order }));
      itemUnallocatedCents = sharedPoolCents - [...shareCents.values()].reduce((sum, cents) => sum + cents, 0);
      itemTotalCents = claims.reduce((sum, claim) => sum + claim.qty * item.priceCents, 0) + sharedPoolCents;
    } else if (item.unit) {
      shares = claims.map((claim) => ({ id: claim.id, cents: item.priceCents * claim.qty, order: claim.order }));
      itemTotalCents = shares.reduce((sum, share) => sum + share.cents, 0);
    } else {
      const selected = claims.filter((claim) => claim.qty > 0);
      const each = selected.length ? Math.floor(item.priceCents / selected.length) : 0;
      let remaining = selected.length ? item.priceCents - each * selected.length : 0;
      const selectedIds = new Set(selected.map((claim) => claim.id));
      shares = claims.map((claim) => ({ id: claim.id, cents: selectedIds.has(claim.id) ? each + (remaining-- > 0 ? 1 : 0) : 0, order: claim.order }));
      itemTotalCents = shares.reduce((sum, share) => sum + share.cents, 0);
    }
    shares.forEach((share) => {
      centsByFriend[share.id] += share.cents;
    });
    unallocatedCents += itemUnallocatedCents;
    breakdown.push({
      id: item.id,
      name: item.name,
      unit: item.unit,
      priceCents: item.priceCents,
      pricingMode: item.pricingMode,
      expectedTotalCents: item.unit ? item.priceCents * (Number(item.expectedQty) || 0) : itemTotalCents,
      totalCents: itemTotalCents,
      unallocatedCents: itemUnallocatedCents,
      shares: shares.map(({ id, cents }) => ({ id, cents }))
    });
  }
  const grandCents = Object.values(centsByFriend).reduce((sum, value) => sum + value, 0);
  return { centsByFriend, breakdown, grandCents, unallocatedCents, billTotalCents: grandCents + unallocatedCents };
}
__name(calculate, "calculate");
function readyToFinalize(bill) {
  const everyone = bill.friends.length > 0 && bill.friends.every((friend) => bill.submissions[friend.id]?.submitted === true);
  const anyParticipant = /* @__PURE__ */ __name((item) => bill.friends.some((friend) => (bill.submissions[friend.id]?.quantities?.[item.id] || 0) > 0 || bill.submissions[friend.id]?.sharing?.[item.id] === true), "anyParticipant");
  const allClaimed = bill.items.length > 0 && bill.items.every((item) => item.pricingMode === "shared_unit" || item.unit && Number(item.expectedQty) === 0 || anyParticipant(item));
  const quantityMismatches = [];
  if (everyone) for (const item of bill.items.filter((row) => row.unit)) {
    const claimedQty = bill.friends.reduce((sum, friend) => sum + Math.max(0, Number(bill.submissions[friend.id]?.quantities?.[item.id]) || 0), 0);
    if (item.expectedQty === null || item.expectedQty === void 0) {
      quantityMismatches.push({ id: item.id, name: item.name, unit: item.unit, expectedQty: null, claimedQty, difference: null, reason: "expected_missing" });
    } else if (item.pricingMode !== "shared_unit" ? claimedQty !== item.expectedQty : claimedQty > item.expectedQty) {
      quantityMismatches.push({ id: item.id, name: item.name, unit: item.unit, expectedQty: item.expectedQty, claimedQty, difference: claimedQty - item.expectedQty, reason: "quantity_mismatch" });
    }
  }
  const participationPrompts = [];
  if (everyone) for (const item of bill.items.filter((row) => row.pricingMode === "shared_unit")) {
    const personalQty = bill.friends.reduce((sum, friend) => sum + Math.max(0, Number(bill.submissions[friend.id]?.quantities?.[item.id]) || 0), 0);
    const remainingQty = Number(item.expectedQty) - personalQty;
    const participantCount = bill.friends.reduce((sum, friend) => sum + (bill.submissions[friend.id]?.sharing?.[item.id] === true ? 1 : 0), 0);
    if (remainingQty > 0 && participantCount === 0) participationPrompts.push({ id: item.id, name: item.name, unit: item.unit, participantCount, expectedQty: item.expectedQty, remainingQty, totalCents: item.priceCents * remainingQty, reason: "no_participants" });
  }
  const quantityMatches = quantityMismatches.length === 0;
  const unallocatedCents = calculate(bill).unallocatedCents;
  const fullyAllocated = unallocatedCents === 0 && !participationPrompts.some((row) => row.reason === "no_participants");
  return { ready: everyone && allClaimed && quantityMatches && fullyAllocated, everyone, allClaimed, quantityMatches, quantityMismatches, participationPrompts, unallocatedCents, fullyAllocated };
}
__name(readyToFinalize, "readyToFinalize");
function adminBill(bill) {
  const ready = readyToFinalize(bill);
  const calculations = calculate(bill);
  return {
    ...publicBill(bill),
    items: clone(bill.items).map((item) => ({ ...item, needsCheck: [...ready.quantityMismatches, ...ready.participationPrompts].some((row) => row.id === item.id) })),
    progress: { submitted: bill.friends.filter((friend) => bill.submissions[friend.id]?.submitted).length, total: bill.friends.length },
    readiness: ready,
    submissions: Object.fromEntries(Object.entries(bill.submissions).map(([id, sub]) => [id, { submitted: sub.submitted, quantities: clone(sub.quantities), sharing: clone(sub.sharing || {}), submittedAt: sub.submittedAt }])),
    draftResults: bill.completed ? null : calculations,
    results: bill.completed ? calculations : null
  };
}
__name(adminBill, "adminBill");
function friendFor(bill, friendId) {
  return bill.friends.find((friend) => friend.id === friendId);
}
__name(friendFor, "friendFor");
async function accessSubmission(request, env, bill, friendId, body) {
  const friend = friendFor(bill, friendId);
  if (!friend) return fail(request, env, 404, "friend_not_found", "\u627E\u4E0D\u5230\u9019\u4F4D\u670B\u53CB");
  const submission = bill.submissions[friendId];
  if (submission?.pinRecord) {
    if (!body.pin) return fail(request, env, 401, "pin_required", "\u8ACB\u8F38\u5165\u500B\u4EBA\u5BC6\u78BC");
    if (await countRecentPinFailures(env, bill.id, friendId) >= 8) return fail(request, env, 429, "rate_limited", "\u5617\u8A66\u6B21\u6578\u904E\u591A\uFF0C\u8ACB\u7A0D\u5F8C\u518D\u8A66");
    if (!await pinMatches(body.pin, submission.pinRecord)) {
      await recordWrongPin(env, bill.id, friendId);
      return fail(request, env, 401, "wrong_pin", "\u5BC6\u78BC\u4E0D\u6B63\u78BA\uFF1B\u672A\u986F\u793A\u500B\u4EBA\u8CC7\u6599");
    }
  } else if (submission?.ownerTokenHash && !await tokenMatches(body.ownerToken, submission.ownerTokenHash)) {
    return fail(request, env, 401, "device_required", "\u6B64\u4EFD\u8CC7\u6599\u53EA\u53EF\u7531\u539F\u88DD\u7F6E\u6216\u500B\u4EBA\u5BC6\u78BC\u958B\u555F");
  }
  await clearPinFailures(env, bill.id, friendId);
  if (bill.completed) {
    const results = calculate(bill);
    const readiness = readyToFinalize(bill);
    const needsCheckIds = new Set([...readiness.quantityMismatches, ...readiness.participationPrompts].map((row) => row.id));
    const ownBreakdown = results.breakdown.map((item) => ({ id: item.id, name: item.name, unit: item.unit, pricingMode: item.pricingMode, quantity: Number(submission.quantities[item.id] || 0), sharing: submission.sharing?.[item.id] === true, priceCents: item.priceCents, cents: item.shares.find((share) => share.id === friendId)?.cents || 0, needsCheck: needsCheckIds.has(item.id) }));
    return json(request, env, 200, { mode: "result", friend: { id: friend.id, name: friend.name }, amountCents: results.centsByFriend[friendId] || 0, breakdown: ownBreakdown });
  }
  return json(request, env, 200, submission ? { mode: "edit", friend: { id: friend.id, name: friend.name }, quantities: clone(submission.quantities), sharing: clone(submission.sharing || {}), pinProtected: !!submission.pinRecord } : { mode: "new", friend: { id: friend.id, name: friend.name }, quantities: Object.fromEntries(bill.items.map((item) => [item.id, 0])), sharing: {} });
}
__name(accessSubmission, "accessSubmission");
function validPin(pin) {
  return typeof pin === "string" && Array.from(pin).length === 3;
}
__name(validPin, "validPin");
async function saveSubmission(request, env, bill, friendId, body) {
  const friend = friendFor(bill, friendId);
  if (!friend) return fail(request, env, 404, "friend_not_found", "\u627E\u4E0D\u5230\u9019\u4F4D\u670B\u53CB");
  if (bill.completed) return fail(request, env, 423, "bill_finalized", "\u5E33\u55AE\u5DF2\u5B8C\u6210\uFF0C\u4E0D\u80FD\u518D\u4FEE\u6539");
  if (!body.quantities || typeof body.quantities !== "object" || Array.isArray(body.quantities)) return fail(request, env, 400, "invalid_quantities", "\u4EFD\u6578\u683C\u5F0F\u4E0D\u6B63\u78BA");
  const itemIds = new Set(bill.items.map((item) => item.id));
  if (Object.keys(body.quantities).some((id) => !itemIds.has(id))) return fail(request, env, 400, "invalid_quantities", "\u4EFD\u6578\u5305\u542B\u4E0D\u5B58\u5728\u7684\u9805\u76EE");
  if (body.sharing !== void 0 && (!body.sharing || typeof body.sharing !== "object" || Array.isArray(body.sharing) || Object.keys(body.sharing).some((id) => !itemIds.has(id)))) return fail(request, env, 400, "invalid_sharing", "\u5171\u4EAB\u9078\u9805\u683C\u5F0F\u4E0D\u6B63\u78BA");
  const quantities = {};
  const sharing = {};
  for (const item of bill.items) {
    const value = Number(body.quantities[item.id] ?? 0);
    if (!Number.isInteger(value) || value < 0 || value > 99) return fail(request, env, 400, "invalid_quantities", "\u6BCF\u9805\u4EFD\u6578\u9700\u70BA 0 \u81F3 99 \u7684\u6574\u6578");
    const optsIntoSharing = body.sharing?.[item.id] === true;
    if (body.sharing?.[item.id] !== void 0 && typeof body.sharing[item.id] !== "boolean") return fail(request, env, 400, "invalid_sharing", "\u5171\u4EAB\u9078\u9805\u9700\u70BA\u662F\u6216\u5426");
    if (item.pricingMode === "shared_unit" && optsIntoSharing && value > 0) return fail(request, env, 400, "conflicting_claim", "\u540C\u4E00\u9805\u76EE\u8ACB\u9078\u500B\u4EBA\u6578\u91CF\u6216\u53C3\u8207\u5171\u4EAB\u5176\u4E2D\u4E00\u7A2E");
    quantities[item.id] = !item.unit ? value > 0 ? 1 : 0 : value;
    sharing[item.id] = item.pricingMode === "shared_unit" && optsIntoSharing;
  }
  const previous = bill.submissions[friendId];
  if (previous?.pinRecord) {
    if (await countRecentPinFailures(env, bill.id, friendId) >= 8) return fail(request, env, 429, "rate_limited", "\u5617\u8A66\u6B21\u6578\u904E\u591A\uFF0C\u8ACB\u7A0D\u5F8C\u518D\u8A66");
    if (!body.pin || !await pinMatches(body.pin, previous.pinRecord)) {
      if (body.pin) await recordWrongPin(env, bill.id, friendId);
      return fail(request, env, 401, body.pin ? "wrong_pin" : "pin_required", body.pin ? "\u5BC6\u78BC\u4E0D\u6B63\u78BA\uFF1B\u672A\u4FEE\u6539\u7533\u5831" : "\u8ACB\u8F38\u5165\u500B\u4EBA\u5BC6\u78BC");
    }
  } else if (previous?.ownerTokenHash && !await tokenMatches(body.ownerToken, previous.ownerTokenHash)) {
    return fail(request, env, 401, "device_required", "\u6B64\u4EFD\u8CC7\u6599\u53EA\u53EF\u7531\u539F\u88DD\u7F6E\u6216\u500B\u4EBA\u5BC6\u78BC\u4FEE\u6539");
  }
  let pinRecord = previous?.pinRecord || null;
  let ownerTokenHash = previous?.ownerTokenHash || null;
  let ownerToken;
  if (!pinRecord && body.pin) {
    if (!validPin(body.pin)) return fail(request, env, 400, "invalid_pin", "\u5BC6\u78BC\u8981\u525B\u597D\u4E09\u500B\u5B57\u5143");
    pinRecord = await hashPin(body.pin);
    ownerTokenHash = null;
  } else if (!previous && !body.pin) {
    ownerToken = randomToken();
    ownerTokenHash = await tokenHash(ownerToken);
  }
  const next = clone(bill);
  next.submissions[friendId] = { submitted: true, quantities, sharing, submittedAt: (/* @__PURE__ */ new Date()).toISOString(), pinRecord, ownerTokenHash };
  if (!await saveBillCAS(env, bill, next)) return fail(request, env, 409, "write_conflict", "\u5E33\u55AE\u525B\u6709\u5176\u4ED6\u66F4\u65B0\uFF1B\u8ACB\u91CD\u65B0\u8F09\u5165\u5F8C\u518D\u8A66\u3002");
  await clearPinFailures(env, bill.id, friendId);
  return json(request, env, 200, { ok: true, submitted: true, ...ownerToken ? { ownerToken } : {} });
}
__name(saveSubmission, "saveSubmission");
async function handleApi(request, env, url, ctx) {
  if (!env.DB) return fail(request, env, 503, "storage_unavailable", "\u5171\u4EAB\u8CC7\u6599\u5EAB\u672A\u8A2D\u5B9A");
  if (url.pathname === "/healthz" && request.method === "GET") return json(request, env, 200, { ok: true, sampleBill: SAMPLE_ID, storage: "d1-persistent" });
  if (url.pathname === "/api/push-config" && request.method === "GET") return json(request, env, 200, { enabled: pushIsConfigured(env), applicationServerKey: pushIsConfigured(env) ? env.VAPID_PUBLIC_KEY : null });
  if (url.pathname === "/api/bills" && request.method === "POST") {
    if (!isAdmin(request, env)) return fail(request, env, 401, "admin_required", "\u7BA1\u7406\u8005\u8A8D\u8B49\u5931\u6557");
    let body;
    try {
      body = await readBody(request);
    } catch (error) {
      return fail(request, env, 400, "bad_json", error.message);
    }
    let bill2;
    try {
      bill2 = validateBillInput(body);
    } catch (error) {
      return fail(request, env, 400, "invalid_bill", error.message);
    }
    const inserted = await env.DB.prepare("INSERT OR IGNORE INTO bills (id, document, updated_at) VALUES (?, ?, ?)").bind(bill2.id, JSON.stringify(bill2), (/* @__PURE__ */ new Date()).toISOString()).run();
    if (Number(inserted.meta?.changes || 0) !== 1) return fail(request, env, 409, "bill_exists", "\u6B64\u5E33\u55AE ID \u5DF2\u5B58\u5728");
    return json(request, env, 201, { id: bill2.id, title: bill2.title });
  }
  const route = url.pathname.match(/^\/api\/bills\/([a-z0-9-]+)(.*)$/);
  if (!route) return fail(request, env, 404, "not_found", "\u627E\u4E0D\u5230 API \u8DEF\u5F91");
  const [, billId, suffix] = route;
  if (!validateId(billId)) return fail(request, env, 404, "not_found", "\u627E\u4E0D\u5230\u5E33\u55AE");
  const bill = await getBill(env, billId);
  if (!bill) return fail(request, env, 404, "bill_not_found", "\u627E\u4E0D\u5230\u5E33\u55AE");
  if (suffix === "/public" && request.method === "GET") return json(request, env, 200, publicBill(bill));
  const adminRoute = suffix === "/admin" || suffix === "/admin/finalize";
  if (adminRoute && !isAdmin(request, env)) return fail(request, env, 401, "admin_required", "\u7BA1\u7406\u8005\u8A8D\u8B49\u5931\u6557");
  if (suffix === "/admin" && request.method === "GET") return json(request, env, 200, adminBill(bill));
  if (suffix === "/admin" && request.method === "PUT") {
    if (bill.completed) return fail(request, env, 423, "bill_finalized", "\u5E33\u55AE\u5DF2\u5B8C\u6210\uFF0C\u4E0D\u80FD\u4FEE\u6539");
    let body;
    try {
      body = await readBody(request);
    } catch (error) {
      return fail(request, env, 400, "bad_json", error.message);
    }
    let validated;
    try {
      validated = validateBillInput({ id: bill.id, ...body });
    } catch (error) {
      return fail(request, env, 400, "invalid_bill", error.message);
    }
    const friendIds = new Set(validated.friends.map((friend) => friend.id));
    const itemIds = new Set(validated.items.map((item) => item.id));
    const submissions = {};
    for (const [friendId, sub] of Object.entries(bill.submissions)) {
      if (!friendIds.has(friendId)) continue;
      const quantities = Object.fromEntries(Object.entries(sub.quantities).filter(([itemId]) => itemIds.has(itemId)));
      const sharing = Object.fromEntries(Object.entries(sub.sharing || {}).filter(([itemId]) => itemIds.has(itemId)));
      for (const item of validated.items) {
        if (!(item.id in quantities)) quantities[item.id] = 0;
        if (!(item.id in sharing)) sharing[item.id] = false;
        if (!item.unit) quantities[item.id] = quantities[item.id] > 0 ? 1 : 0;
        if (item.pricingMode !== "shared_unit") sharing[item.id] = false;
        if (item.pricingMode === "shared_unit" && sharing[item.id]) quantities[item.id] = 0;
      }
      submissions[friendId] = { ...sub, quantities, sharing };
    }
    const next = { ...bill, title: validated.title, items: validated.items, friends: validated.friends, submissions };
    if (!await saveBillCAS(env, bill, next)) return fail(request, env, 409, "write_conflict", "\u5E33\u55AE\u525B\u6709\u5176\u4ED6\u66F4\u65B0\uFF1B\u8ACB\u91CD\u65B0\u8F09\u5165\u5F8C\u518D\u5132\u5B58\u3002");
    return json(request, env, 200, adminBill(next));
  }
  if (suffix === "/admin" && request.method === "DELETE") {
    if (billId === SAMPLE_ID) return fail(request, env, 403, "sample_protected", "\u793A\u7BC4\u5E33\u55AE\u4E0D\u53EF\u522A\u9664");
    const result = await env.DB.prepare("DELETE FROM bills WHERE id = ? AND document = ?").bind(billId, JSON.stringify(bill)).run();
    if (Number(result.meta?.changes || 0) !== 1) return fail(request, env, 409, "write_conflict", "\u5E33\u55AE\u525B\u6709\u5176\u4ED6\u66F4\u65B0\uFF1B\u8ACB\u91CD\u65B0\u8F09\u5165\u5F8C\u518D\u8A66\u3002");
    await env.DB.prepare("DELETE FROM pin_failures WHERE bill_id = ?").bind(billId).run();
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE bill_id = ?").bind(billId).run();
    return json(request, env, 200, { deleted: true });
  }
  if (suffix === "/admin/finalize" && request.method === "POST") {
    if (bill.completed) return json(request, env, 200, adminBill(bill));
    const ready = readyToFinalize(bill);
    if (!ready.ready) return fail(request, env, 409, "not_ready", "\u8ACB\u5148\u586B\u59A5\u6BCF\u9805\u5DF2\u8CFC\u6578\u91CF\uFF0C\u4E26\u78BA\u8A8D\u6240\u6709\u4EFD\u91CF\u5747\u5DF2\u8A8D\u9818\u6216\u5171\u4EAB");
    const next = { ...bill, completed: true, finalizedAt: (/* @__PURE__ */ new Date()).toISOString() };
    if (!await saveBillCAS(env, bill, next)) return fail(request, env, 409, "write_conflict", "\u5E33\u55AE\u525B\u6709\u5176\u4ED6\u66F4\u65B0\uFF1B\u8ACB\u91CD\u65B0\u6838\u5C0D\u5F8C\u518D\u7D50\u7B97\u3002");
    if (ctx) ctx.waitUntil(sendResultPushes(env, billId));
    return json(request, env, 200, adminBill(next));
  }
  const friendRoute = suffix.match(/^\/friends\/([a-z0-9-]+)\/(access|submissions|push-subscriptions)$/);
  if (friendRoute && (request.method === "POST" || request.method === "DELETE" && friendRoute[2] === "push-subscriptions")) {
    let body;
    try {
      body = await readBody(request);
    } catch (error) {
      return fail(request, env, 400, "bad_json", error.message);
    }
    if (friendRoute[2] === "access") return accessSubmission(request, env, bill, friendRoute[1], body);
    if (friendRoute[2] === "submissions") return saveSubmission(request, env, bill, friendRoute[1], body);
    return handlePushSubscription(request, env, bill, friendRoute[1], body);
  }
  return fail(request, env, 404, "not_found", "\u627E\u4E0D\u5230 API \u8DEF\u5F91");
}
__name(handleApi, "handleApi");
var index_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    if (origin && origin !== env.ALLOWED_ORIGIN) return fail(request, env, 403, "origin_not_allowed", "\u6B64\u7DB2\u7AD9\u4E0D\u5141\u8A31\u9023\u63A5\u5171\u7528\u5E33\u55AE API");
    if (request.method === "OPTIONS") {
      if (origin !== env.ALLOWED_ORIGIN) return new Response(null, { status: 403, headers: corsHeaders(request, env) });
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    try {
      if (!url.pathname.startsWith("/api/") && url.pathname !== "/healthz") return staticAssetResponse(request, url);
      return await handleApi(request, env, url, ctx);
    } catch (error) {
      console.error("request failed", String(error?.message || error));
      return fail(request, env, 500, "server_error", "\u4F3A\u670D\u5668\u66AB\u6642\u767C\u751F\u932F\u8AA4");
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
