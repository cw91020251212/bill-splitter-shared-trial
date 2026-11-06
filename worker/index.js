import { buildPushPayload } from '@block65/webcrypto-web-push';
import { resultNotification } from './push-message.js';

const SAMPLE_ID = 'sample-dinner';
const MAX_BODY = 64 * 1024;
const PIN_ITERATIONS = 120000;

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Vary': 'Origin',
  };
  if (origin && origin === env.ALLOWED_ORIGIN) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}
function json(request, env, status, value) {
  return new Response(JSON.stringify(value), { status, headers: corsHeaders(request, env) });
}
function fail(request, env, status, code, message) {
  return json(request, env, status, { error: code, message });
}
function clone(value) { return structuredClone(value); }
function safeEqual(a, b) {
  const x = new TextEncoder().encode(String(a || ''));
  const y = new TextEncoder().encode(String(b || ''));
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
function isAdmin(request, env) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') || '');
  return !!env.ADMIN_KEY && !!match && safeEqual(match[1], env.ADMIN_KEY);
}
function b64url(bytes) {
  let raw = '';
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function fromB64url(value) {
  const raw = atob(String(value).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(value).length + 3) % 4));
  return Uint8Array.from(raw, ch => ch.charCodeAt(0));
}
function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return b64url(bytes);
}
async function tokenHash(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(token || '')));
  return b64url(new Uint8Array(digest));
}
async function tokenMatches(token, storedHash) {
  if (!token || !storedHash) return false;
  return safeEqual(await tokenHash(token), storedHash);
}
async function hashPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: PIN_ITERATIONS, hash: 'SHA-256' }, key, 256);
  return { salt: b64url(salt), hash: b64url(new Uint8Array(bits)), iterations: PIN_ITERATIONS };
}
async function pinMatches(pin, record) {
  if (typeof pin !== 'string' || !record?.salt || !record?.hash) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromB64url(record.salt), iterations: record.iterations || PIN_ITERATIONS, hash: 'SHA-256' }, key, 256);
  return safeEqual(b64url(new Uint8Array(bits)), record.hash);
}
function makeSample() {
  return {
    id: SAMPLE_ID,
    title: '燒肉聚餐',
    items: [
      { id: 'dish-roast', name: '炭燒套餐', unit: '份', priceCents: 22800, pricingMode: 'per_unit', expectedQty: 3 },
      { id: 'dish-drink', name: '飲品', unit: '杯', priceCents: 1400, pricingMode: 'per_unit', expectedQty: 21 },
      { id: 'dish-dessert', name: '甜品', unit: '份', priceCents: 3000, pricingMode: 'per_unit', expectedQty: 9 },
    ],
    friends: [
      { id: 'friend-ming', name: '阿明' },
      { id: 'friend-ching', name: '小晴' },
      { id: 'friend-ken', name: 'Ken' },
      { id: 'friend-yuki', name: 'Yuki' },
    ],
    submissions: {},
    completed: false,
    finalizedAt: null,
  };
}
function validateId(value) { return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{2,63}$/.test(value); }
function validateBillInput(input) {
  if (!input || typeof input !== 'object' || !validateId(input.id)) throw new Error('帳單 ID 格式不正確');
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 30) throw new Error('項目數量需為 1 至 30');
  if (!Array.isArray(input.friends) || input.friends.length < 1 || input.friends.length > 100) throw new Error('朋友數量需為 1 至 100');
  const title = String(input.title || '').trim().slice(0, 60) || '未命名帳單';
  const ids = new Set();
  const items = input.items.map(item => {
    if (!item || !validateId(item.id) || ids.has(item.id)) throw new Error('項目 ID 重複或格式不正確');
    ids.add(item.id);
    const priceCents = Number(item.priceCents);
    if (!Number.isSafeInteger(priceCents) || priceCents < 0 || priceCents > 100000000) throw new Error('項目金額不正確');
    const name = String(item.name || '').trim().slice(0, 40);
    if (!name) throw new Error('項目名稱不可留空');
    const unit = String(item.unit ?? '').trim().slice(0, 4);
    const suppliedMode = item.pricingMode;
    if (suppliedMode !== undefined && !['split_total', 'per_unit', 'shared_unit'].includes(suppliedMode)) throw new Error('計價方式不正確');
    if (unit && suppliedMode === 'split_total') throw new Error('有單位項目需選擇按數量或多人共享');
    if (!unit && suppliedMode && suppliedMode !== 'split_total') throw new Error('無單位項目只可按整項總額平分');
    const pricingMode = unit ? (suppliedMode || 'per_unit') : 'split_total';
    let expectedQty = null;
    if (unit && item.expectedQty !== undefined && item.expectedQty !== null && item.expectedQty !== '') {
      expectedQty = Number(item.expectedQty);
      if (!Number.isSafeInteger(expectedQty) || expectedQty < 0 || expectedQty > 9900) throw new Error('已購數量需為 0 至 9900 的整數');
    }
    return { id: item.id, name, unit, priceCents, pricingMode, expectedQty };
  });
  ids.clear();
  const friends = input.friends.map(friend => {
    if (!friend || !validateId(friend.id) || ids.has(friend.id)) throw new Error('朋友 ID 重複或格式不正確');
    ids.add(friend.id);
    const name = String(friend.name || '').trim().slice(0, 32);
    if (!name) throw new Error('朋友名稱不可留空');
    return { id: friend.id, name };
  });
  return { id: input.id, title, items, friends, submissions: {}, completed: false, finalizedAt: null };
}
async function readBody(request) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_BODY) throw new Error('請求資料太大');
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw new Error('請求資料太大');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new Error('JSON 格式不正確'); }
}
async function getBill(env, id) {
  const row = await env.DB.prepare('SELECT document FROM bills WHERE id = ?').bind(id).first();
  if (!row) {
    if (id !== SAMPLE_ID) return null;
    const sample = makeSample();
    await env.DB.prepare('INSERT OR IGNORE INTO bills (id, document, updated_at) VALUES (?, ?, ?)')
      .bind(sample.id, JSON.stringify(sample), new Date().toISOString()).run();
    return getBill(env, id);
  }
  try { return JSON.parse(row.document); } catch { throw new Error('帳單資料損毀'); }
}
async function saveBillCAS(env, before, after) {
  const previousJson = JSON.stringify(before);
  const nextJson = JSON.stringify(after);
  const result = await env.DB.prepare('UPDATE bills SET document = ?, updated_at = ? WHERE id = ? AND document = ?')
    .bind(nextJson, new Date().toISOString(), before.id, previousJson).run();
  return Number(result.meta?.changes || 0) === 1;
}
async function countRecentPinFailures(env, billId, friendId) {
  const result = await env.DB.prepare('SELECT COUNT(*) AS n FROM pin_failures WHERE bill_id = ? AND friend_id = ? AND failed_at > ?')
    .bind(billId, friendId, Date.now() - 15 * 60 * 1000).first();
  return Number(result?.n || 0);
}
async function recordWrongPin(env, billId, friendId) {
  await env.DB.prepare('INSERT INTO pin_failures (bill_id, friend_id, failed_at) VALUES (?, ?, ?)')
    .bind(billId, friendId, Date.now()).run();
}
async function clearPinFailures(env, billId, friendId) {
  await env.DB.prepare('DELETE FROM pin_failures WHERE bill_id = ? AND friend_id = ?').bind(billId, friendId).run();
}
function pushIsConfigured(env) {
  return !!(env.VAPID_SUBJECT && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.PUBLIC_APP_URL);
}
async function authorizePushOwner(request, env, bill, friendId, body) {
  const friend = friendFor(bill, friendId);
  if (!friend) return fail(request, env, 404, 'friend_not_found', '找不到這位朋友');
  const submission = bill.submissions[friendId];
  if (!submission?.submitted) return fail(request, env, 401, 'submission_required', '請先提交自己的分帳，才可設定結果通知');
  if (submission.pinRecord) {
    if (await countRecentPinFailures(env, bill.id, friendId) >= 8) return fail(request, env, 429, 'rate_limited', '嘗試次數過多，請稍後再試');
    if (!body.pin || !await pinMatches(body.pin, submission.pinRecord)) {
      if (body.pin) await recordWrongPin(env, bill.id, friendId);
      return fail(request, env, 401, body.pin ? 'wrong_pin' : 'pin_required', '請用自己的三字元編輯碼確認通知設定');
    }
  } else if (!await tokenMatches(body.ownerToken, submission.ownerTokenHash)) {
    return fail(request, env, 401, 'device_required', '請在首次提交的裝置設定通知');
  }
  await clearPinFailures(env, bill.id, friendId);
  return null;
}
async function handlePushSubscription(request, env, bill, friendId, body) {
  const denial = await authorizePushOwner(request, env, bill, friendId, body);
  if (denial) return denial;
  if (request.method === 'POST') {
    if (bill.completed) return fail(request, env, 423, 'bill_finalized', '帳單已結算；不能再設定結果通知');
    if (!pushIsConfigured(env)) return fail(request, env, 503, 'push_unavailable', '此試用站尚未設定手機推送服務');
    const subscription = body.subscription;
    let parsed;
    try { parsed = new URL(subscription?.endpoint); } catch { return fail(request, env, 400, 'invalid_subscription', '通知訂閱資料不正確'); }
    const host = parsed.hostname.toLowerCase();
    const allowedHost = host === 'fcm.googleapis.com' || host.endsWith('.push.services.mozilla.com') || host === 'push.services.mozilla.com' || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com');
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || !allowedHost || parsed.href.length > 4096 || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return fail(request, env, 400, 'invalid_subscription', '通知服務端點格式不正確');
    }
    const saved = { endpoint: parsed.href, expirationTime: subscription.expirationTime ?? null, keys: { p256dh: String(subscription.keys.p256dh), auth: String(subscription.keys.auth) } };
    const previous = await env.DB.prepare('SELECT endpoint FROM push_subscriptions WHERE bill_id = ? AND friend_id = ?').bind(bill.id, friendId).first();
    await env.DB.prepare(`INSERT INTO push_subscriptions (bill_id, friend_id, endpoint, subscription_json, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (bill_id, friend_id) DO UPDATE SET endpoint = excluded.endpoint, subscription_json = excluded.subscription_json, created_at = excluded.created_at`)
      .bind(bill.id, friendId, saved.endpoint, JSON.stringify(saved), new Date().toISOString()).run();
    return json(request, env, 200, { ok: true, subscribed: true, replaced: !!previous && previous.endpoint !== saved.endpoint, deviceLimit: 1 });
  }
  if (request.method === 'DELETE') {
    const endpoint = String(body.endpoint || '');
    if (!endpoint) return fail(request, env, 400, 'invalid_subscription', '找不到此裝置的通知訂閱');
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE bill_id = ? AND friend_id = ? AND endpoint = ?').bind(bill.id, friendId, endpoint).run();
    return json(request, env, 200, { ok: true, subscribed: false });
  }
  return fail(request, env, 405, 'method_not_allowed', '此操作不支援');
}
async function sendResultPushes(env, billId) {
  if (!pushIsConfigured(env)) return;
  const rows = await env.DB.prepare('SELECT id, endpoint, subscription_json FROM push_subscriptions WHERE bill_id = ?').bind(billId).all();
  const publicUrl = new URL(env.PUBLIC_APP_URL);
  publicUrl.searchParams.set('bill', billId);
  const message = {
    data: JSON.stringify(resultNotification(publicUrl.toString())),
    options: { ttl: 86400, urgency: 'normal', topic: `bill-${billId}`.slice(0, 32) },
  };
  const vapid = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  for (const row of rows.results || []) {
    try {
      const subscription = JSON.parse(row.subscription_json);
      const payload = await buildPushPayload(message, subscription, vapid);
      const response = await fetch(subscription.endpoint, payload);
      if (response.status === 404 || response.status === 410) {
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(row.id).run();
      } else if (!response.ok) {
        console.warn('push service response status', response.status);
      }
    } catch (error) {
      console.warn('push send failed', String(error?.message || error).slice(0, 160));
    }
  }
}
function publicBill(bill) {
  const readiness = readyToFinalize(bill);
  const needsCheckIds = new Set([...readiness.quantityMismatches, ...readiness.participationPrompts].map(row => row.id));
  const selections = Object.fromEntries(bill.friends.flatMap(({ id }) => {
    const submission = bill.submissions[id];
    if (!submission?.submitted) return [];
    const quantities = Object.fromEntries(bill.items.map(item => {
      const qty = Math.max(0, Number(submission.quantities?.[item.id]) || 0);
      return [item.id, !item.unit ? (qty > 0 ? 1 : 0) : qty];
    }));
    const sharing = Object.fromEntries(bill.items.map(item => [item.id, item.pricingMode === 'shared_unit' && submission.sharing?.[item.id] === true]));
    return [[id, { quantities, sharing }]];
  }));
  return {
    id: bill.id,
    title: bill.title,
    items: bill.items.map(({ id, name, unit, priceCents, pricingMode }) => ({ id, name, unit, priceCents, pricingMode, needsCheck: needsCheckIds.has(id) })),
    friends: bill.friends.map(({ id, name }) => ({ id, name })),
    selections,
    status: bill.completed ? 'final' : 'draft',
  };
}
function calculate(bill) {
  const centsByFriend = Object.fromEntries(bill.friends.map(friend => [friend.id, 0]));
  const breakdown = [];
  let unallocatedCents = 0;
  for (const item of bill.items) {
    const claims = bill.friends.map((friend, order) => ({
      id: friend.id,
      order,
      qty: Math.max(0, Number(bill.submissions[friend.id]?.quantities?.[item.id]) || 0),
    }));
    let shares, itemTotalCents, itemUnallocatedCents = 0;
    if (item.pricingMode === 'shared_unit') {
      const personalQty = claims.reduce((sum, claim) => sum + claim.qty, 0);
      const remainingQty = Number(item.expectedQty) - personalQty;
      const sharers = bill.friends.filter(friend => bill.submissions[friend.id]?.sharing?.[item.id] === true);
      const sharedPoolCents = Math.max(0, remainingQty) * item.priceCents;
      const each = sharers.length ? Math.floor(sharedPoolCents / sharers.length) : 0;
      let remainderCents = sharers.length ? sharedPoolCents - each * sharers.length : 0;
      const shareCents = new Map(sharers.map(friend => [friend.id, each + (remainderCents-- > 0 ? 1 : 0)]));
      shares = claims.map(claim => ({ id: claim.id, cents: claim.qty * item.priceCents + (shareCents.get(claim.id) || 0), order: claim.order }));
      itemUnallocatedCents = sharedPoolCents - [...shareCents.values()].reduce((sum, cents) => sum + cents, 0);
      itemTotalCents = claims.reduce((sum, claim) => sum + claim.qty * item.priceCents, 0) + sharedPoolCents;
    } else if (item.unit) {
      shares = claims.map(claim => ({ id: claim.id, cents: item.priceCents * claim.qty, order: claim.order }));
      itemTotalCents = shares.reduce((sum, share) => sum + share.cents, 0);
    } else {
      const selected = claims.filter(claim => claim.qty > 0);
      const each = selected.length ? Math.floor(item.priceCents / selected.length) : 0;
      let remaining = selected.length ? item.priceCents - each * selected.length : 0;
      const selectedIds = new Set(selected.map(claim => claim.id));
      shares = claims.map(claim => ({ id: claim.id, cents: selectedIds.has(claim.id) ? each + (remaining-- > 0 ? 1 : 0) : 0, order: claim.order }));
      itemTotalCents = shares.reduce((sum, share) => sum + share.cents, 0);
    }
    shares.forEach(share => { centsByFriend[share.id] += share.cents; });
    unallocatedCents += itemUnallocatedCents;
    breakdown.push({
      id: item.id, name: item.name, unit: item.unit, priceCents: item.priceCents,
      pricingMode: item.pricingMode,
      expectedTotalCents: item.unit ? item.priceCents * (Number(item.expectedQty) || 0) : itemTotalCents,
      totalCents: itemTotalCents,
      unallocatedCents: itemUnallocatedCents,
      shares: shares.map(({ id, cents }) => ({ id, cents })),
    });
  }
  const grandCents = Object.values(centsByFriend).reduce((sum, value) => sum + value, 0);
  return { centsByFriend, breakdown, grandCents, unallocatedCents, billTotalCents: grandCents + unallocatedCents };
}
function readyToFinalize(bill) {
  const everyone = bill.friends.length > 0 && bill.friends.every(friend => bill.submissions[friend.id]?.submitted === true);
  const anyParticipant = item => bill.friends.some(friend => (bill.submissions[friend.id]?.quantities?.[item.id] || 0) > 0 || bill.submissions[friend.id]?.sharing?.[item.id] === true);
  const allClaimed = bill.items.length > 0 && bill.items.every(item => item.pricingMode === 'shared_unit' || (item.unit && Number(item.expectedQty) === 0) || anyParticipant(item));
  const quantityMismatches = [];
  if (everyone) for (const item of bill.items.filter(row => row.unit)) {
    const claimedQty = bill.friends.reduce((sum, friend) => sum + Math.max(0, Number(bill.submissions[friend.id]?.quantities?.[item.id]) || 0), 0);
    if (item.expectedQty === null || item.expectedQty === undefined) {
      quantityMismatches.push({ id: item.id, name: item.name, unit: item.unit, expectedQty: null, claimedQty, difference: null, reason: 'expected_missing' });
    } else if (item.pricingMode !== 'shared_unit' ? claimedQty !== item.expectedQty : claimedQty > item.expectedQty) {
      quantityMismatches.push({ id: item.id, name: item.name, unit: item.unit, expectedQty: item.expectedQty, claimedQty, difference: claimedQty - item.expectedQty, reason: 'quantity_mismatch' });
    }
  }
  const participationPrompts = [];
  if (everyone) for (const item of bill.items.filter(row => row.pricingMode === 'shared_unit')) {
    const personalQty = bill.friends.reduce((sum, friend) => sum + Math.max(0, Number(bill.submissions[friend.id]?.quantities?.[item.id]) || 0), 0);
    const remainingQty = Number(item.expectedQty) - personalQty;
    const participantCount = bill.friends.reduce((sum, friend) => sum + (bill.submissions[friend.id]?.sharing?.[item.id] === true ? 1 : 0), 0);
    if (remainingQty > 0 && participantCount === 0) participationPrompts.push({ id: item.id, name: item.name, unit: item.unit, participantCount, expectedQty: item.expectedQty, remainingQty, totalCents: item.priceCents * remainingQty, reason: 'no_participants' });
  }
  const quantityMatches = quantityMismatches.length === 0;
  const unallocatedCents = calculate(bill).unallocatedCents;
  const fullyAllocated = unallocatedCents === 0 && !participationPrompts.some(row => row.reason === 'no_participants');
  return { ready: everyone && allClaimed && quantityMatches && fullyAllocated, everyone, allClaimed, quantityMatches, quantityMismatches, participationPrompts, unallocatedCents, fullyAllocated };
}
function adminBill(bill) {
  const ready = readyToFinalize(bill);
  const calculations = calculate(bill);
  return {
    ...publicBill(bill),
    items: clone(bill.items).map(item => ({ ...item, needsCheck: [...ready.quantityMismatches, ...ready.participationPrompts].some(row => row.id === item.id) })),
    progress: { submitted: bill.friends.filter(friend => bill.submissions[friend.id]?.submitted).length, total: bill.friends.length },
    readiness: ready,
    submissions: Object.fromEntries(Object.entries(bill.submissions).map(([id, sub]) => [id, { submitted: sub.submitted, quantities: clone(sub.quantities), sharing: clone(sub.sharing || {}), submittedAt: sub.submittedAt }])),
    draftResults: bill.completed ? null : calculations,
    results: bill.completed ? calculations : null,
  };
}
function friendFor(bill, friendId) { return bill.friends.find(friend => friend.id === friendId); }
async function accessSubmission(request, env, bill, friendId, body) {
  const friend = friendFor(bill, friendId);
  if (!friend) return fail(request, env, 404, 'friend_not_found', '找不到這位朋友');
  const submission = bill.submissions[friendId];
  if (submission?.pinRecord) {
    if (!body.pin) return fail(request, env, 401, 'pin_required', '請輸入個人密碼');
    if (await countRecentPinFailures(env, bill.id, friendId) >= 8) return fail(request, env, 429, 'rate_limited', '嘗試次數過多，請稍後再試');
    if (!await pinMatches(body.pin, submission.pinRecord)) {
      await recordWrongPin(env, bill.id, friendId);
      return fail(request, env, 401, 'wrong_pin', '密碼不正確；未顯示個人資料');
    }
  } else if (submission?.ownerTokenHash && !await tokenMatches(body.ownerToken, submission.ownerTokenHash)) {
    return fail(request, env, 401, 'device_required', '此份資料只可由原裝置或個人密碼開啟');
  }
  await clearPinFailures(env, bill.id, friendId);
  if (bill.completed) {
    const results = calculate(bill);
    const readiness = readyToFinalize(bill);
    const needsCheckIds = new Set([...readiness.quantityMismatches, ...readiness.participationPrompts].map(row => row.id));
    const ownBreakdown = results.breakdown.map(item => ({ id: item.id, name: item.name, unit: item.unit, pricingMode: item.pricingMode, quantity: Number(submission.quantities[item.id] || 0), sharing: submission.sharing?.[item.id] === true, priceCents: item.priceCents, cents: item.shares.find(share => share.id === friendId)?.cents || 0, needsCheck: needsCheckIds.has(item.id) }));
    return json(request, env, 200, { mode: 'result', friend: { id: friend.id, name: friend.name }, amountCents: results.centsByFriend[friendId] || 0, breakdown: ownBreakdown });
  }
  return json(request, env, 200, submission
    ? { mode: 'edit', friend: { id: friend.id, name: friend.name }, quantities: clone(submission.quantities), sharing: clone(submission.sharing || {}), pinProtected: !!submission.pinRecord }
    : { mode: 'new', friend: { id: friend.id, name: friend.name }, quantities: Object.fromEntries(bill.items.map(item => [item.id, 0])), sharing: {} });
}
function validPin(pin) { return typeof pin === 'string' && Array.from(pin).length === 3; }
async function saveSubmission(request, env, bill, friendId, body) {
  const friend = friendFor(bill, friendId);
  if (!friend) return fail(request, env, 404, 'friend_not_found', '找不到這位朋友');
  if (bill.completed) return fail(request, env, 423, 'bill_finalized', '帳單已完成，不能再修改');
  if (!body.quantities || typeof body.quantities !== 'object' || Array.isArray(body.quantities)) return fail(request, env, 400, 'invalid_quantities', '份數格式不正確');
  const itemIds = new Set(bill.items.map(item => item.id));
  if (Object.keys(body.quantities).some(id => !itemIds.has(id))) return fail(request, env, 400, 'invalid_quantities', '份數包含不存在的項目');
  if (body.sharing !== undefined && (!body.sharing || typeof body.sharing !== 'object' || Array.isArray(body.sharing) || Object.keys(body.sharing).some(id => !itemIds.has(id)))) return fail(request, env, 400, 'invalid_sharing', '共享選項格式不正確');
  const quantities = {};
  const sharing = {};
  for (const item of bill.items) {
    const value = Number(body.quantities[item.id] ?? 0);
    if (!Number.isInteger(value) || value < 0 || value > 99) return fail(request, env, 400, 'invalid_quantities', '每項份數需為 0 至 99 的整數');
    const optsIntoSharing = body.sharing?.[item.id] === true;
    if (body.sharing?.[item.id] !== undefined && typeof body.sharing[item.id] !== 'boolean') return fail(request, env, 400, 'invalid_sharing', '共享選項需為是或否');
    if (item.pricingMode === 'shared_unit' && optsIntoSharing && value > 0) return fail(request, env, 400, 'conflicting_claim', '同一項目請選個人數量或參與共享其中一種');
    quantities[item.id] = !item.unit ? (value > 0 ? 1 : 0) : value;
    sharing[item.id] = item.pricingMode === 'shared_unit' && optsIntoSharing;
  }
  const previous = bill.submissions[friendId];
  if (previous?.pinRecord) {
    if (await countRecentPinFailures(env, bill.id, friendId) >= 8) return fail(request, env, 429, 'rate_limited', '嘗試次數過多，請稍後再試');
    if (!body.pin || !await pinMatches(body.pin, previous.pinRecord)) {
      if (body.pin) await recordWrongPin(env, bill.id, friendId);
      return fail(request, env, 401, body.pin ? 'wrong_pin' : 'pin_required', body.pin ? '密碼不正確；未修改申報' : '請輸入個人密碼');
    }
  } else if (previous?.ownerTokenHash && !await tokenMatches(body.ownerToken, previous.ownerTokenHash)) {
    return fail(request, env, 401, 'device_required', '此份資料只可由原裝置或個人密碼修改');
  }
  let pinRecord = previous?.pinRecord || null;
  let ownerTokenHash = previous?.ownerTokenHash || null;
  let ownerToken;
  if (!pinRecord && body.pin) {
    if (!validPin(body.pin)) return fail(request, env, 400, 'invalid_pin', '密碼要剛好三個字元');
    pinRecord = await hashPin(body.pin);
    ownerTokenHash = null;
  } else if (!previous && !body.pin) {
    ownerToken = randomToken();
    ownerTokenHash = await tokenHash(ownerToken);
  }
  const next = clone(bill);
  next.submissions[friendId] = { submitted: true, quantities, sharing, submittedAt: new Date().toISOString(), pinRecord, ownerTokenHash };
  if (!await saveBillCAS(env, bill, next)) return fail(request, env, 409, 'write_conflict', '帳單剛有其他更新；請重新載入後再試。');
  await clearPinFailures(env, bill.id, friendId);
  return json(request, env, 200, { ok: true, submitted: true, ...(ownerToken ? { ownerToken } : {}) });
}
async function handleApi(request, env, url, ctx) {
  if (!env.DB) return fail(request, env, 503, 'storage_unavailable', '共享資料庫未設定');
  if (url.pathname === '/healthz' && request.method === 'GET') return json(request, env, 200, { ok: true, sampleBill: SAMPLE_ID, storage: 'd1-persistent' });
  if (url.pathname === '/api/push-config' && request.method === 'GET') return json(request, env, 200, { enabled: pushIsConfigured(env), applicationServerKey: pushIsConfigured(env) ? env.VAPID_PUBLIC_KEY : null });
  if (url.pathname === '/api/bills' && request.method === 'POST') {
    if (!isAdmin(request, env)) return fail(request, env, 401, 'admin_required', '管理者認證失敗');
    let body;
    try { body = await readBody(request); } catch (error) { return fail(request, env, 400, 'bad_json', error.message); }
    let bill;
    try { bill = validateBillInput(body); } catch (error) { return fail(request, env, 400, 'invalid_bill', error.message); }
    const inserted = await env.DB.prepare('INSERT OR IGNORE INTO bills (id, document, updated_at) VALUES (?, ?, ?)')
      .bind(bill.id, JSON.stringify(bill), new Date().toISOString()).run();
    if (Number(inserted.meta?.changes || 0) !== 1) return fail(request, env, 409, 'bill_exists', '此帳單 ID 已存在');
    return json(request, env, 201, { id: bill.id, title: bill.title });
  }
  const route = url.pathname.match(/^\/api\/bills\/([a-z0-9-]+)(.*)$/);
  if (!route) return fail(request, env, 404, 'not_found', '找不到 API 路徑');
  const [, billId, suffix] = route;
  if (!validateId(billId)) return fail(request, env, 404, 'not_found', '找不到帳單');
  const bill = await getBill(env, billId);
  if (!bill) return fail(request, env, 404, 'bill_not_found', '找不到帳單');
  if (suffix === '/public' && request.method === 'GET') return json(request, env, 200, publicBill(bill));
  const adminRoute = suffix === '/admin' || suffix === '/admin/finalize';
  if (adminRoute && !isAdmin(request, env)) return fail(request, env, 401, 'admin_required', '管理者認證失敗');
  if (suffix === '/admin' && request.method === 'GET') return json(request, env, 200, adminBill(bill));
  if (suffix === '/admin' && request.method === 'PUT') {
    if (bill.completed) return fail(request, env, 423, 'bill_finalized', '帳單已完成，不能修改');
    let body;
    try { body = await readBody(request); } catch (error) { return fail(request, env, 400, 'bad_json', error.message); }
    let validated;
    try { validated = validateBillInput({ id: bill.id, ...body }); } catch (error) { return fail(request, env, 400, 'invalid_bill', error.message); }
    const friendIds = new Set(validated.friends.map(friend => friend.id));
    const itemIds = new Set(validated.items.map(item => item.id));
    const submissions = {};
    for (const [friendId, sub] of Object.entries(bill.submissions)) {
      if (!friendIds.has(friendId)) continue;
      const quantities = Object.fromEntries(Object.entries(sub.quantities).filter(([itemId]) => itemIds.has(itemId)));
      const sharing = Object.fromEntries(Object.entries(sub.sharing || {}).filter(([itemId]) => itemIds.has(itemId)));
      for (const item of validated.items) {
        if (!(item.id in quantities)) quantities[item.id] = 0;
        if (!(item.id in sharing)) sharing[item.id] = false;
        if (!item.unit) quantities[item.id] = quantities[item.id] > 0 ? 1 : 0;
        if (item.pricingMode !== 'shared_unit') sharing[item.id] = false;
        if (item.pricingMode === 'shared_unit' && sharing[item.id]) quantities[item.id] = 0;
      }
      submissions[friendId] = { ...sub, quantities, sharing };
    }
    const next = { ...bill, title: validated.title, items: validated.items, friends: validated.friends, submissions };
    if (!await saveBillCAS(env, bill, next)) return fail(request, env, 409, 'write_conflict', '帳單剛有其他更新；請重新載入後再儲存。');
    return json(request, env, 200, adminBill(next));
  }
  if (suffix === '/admin' && request.method === 'DELETE') {
    if (billId === SAMPLE_ID) return fail(request, env, 403, 'sample_protected', '示範帳單不可刪除');
    const result = await env.DB.prepare('DELETE FROM bills WHERE id = ? AND document = ?').bind(billId, JSON.stringify(bill)).run();
    if (Number(result.meta?.changes || 0) !== 1) return fail(request, env, 409, 'write_conflict', '帳單剛有其他更新；請重新載入後再試。');
    await env.DB.prepare('DELETE FROM pin_failures WHERE bill_id = ?').bind(billId).run();
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE bill_id = ?').bind(billId).run();
    return json(request, env, 200, { deleted: true });
  }
  if (suffix === '/admin/finalize' && request.method === 'POST') {
    if (bill.completed) return json(request, env, 200, adminBill(bill));
    const ready = readyToFinalize(bill);
    if (!ready.ready) return fail(request, env, 409, 'not_ready', '請先填妥每項已購數量，並確認所有份量均已認領或共享');
    const next = { ...bill, completed: true, finalizedAt: new Date().toISOString() };
    if (!await saveBillCAS(env, bill, next)) return fail(request, env, 409, 'write_conflict', '帳單剛有其他更新；請重新核對後再結算。');
    if (ctx) ctx.waitUntil(sendResultPushes(env, billId));
    return json(request, env, 200, adminBill(next));
  }
  const friendRoute = suffix.match(/^\/friends\/([a-z0-9-]+)\/(access|submissions|push-subscriptions)$/);
  if (friendRoute && (request.method === 'POST' || (request.method === 'DELETE' && friendRoute[2] === 'push-subscriptions'))) {
    let body;
    try { body = await readBody(request); } catch (error) { return fail(request, env, 400, 'bad_json', error.message); }
    if (friendRoute[2] === 'access') return accessSubmission(request, env, bill, friendRoute[1], body);
    if (friendRoute[2] === 'submissions') return saveSubmission(request, env, bill, friendRoute[1], body);
    return handlePushSubscription(request, env, bill, friendRoute[1], body);
  }
  return fail(request, env, 404, 'not_found', '找不到 API 路徑');
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');
    if (origin && origin !== env.ALLOWED_ORIGIN) return fail(request, env, 403, 'origin_not_allowed', '此網站不允許連接共用帳單 API');
    if (request.method === 'OPTIONS') {
      if (origin !== env.ALLOWED_ORIGIN) return new Response(null, { status: 403, headers: corsHeaders(request, env) });
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith('/api/') && url.pathname !== '/healthz') return fail(request, env, 404, 'not_found', '找不到 API 路徑');
      return await handleApi(request, env, url, ctx);
    } catch (error) {
      console.error('request failed', String(error?.message || error));
      return fail(request, env, 500, 'server_error', '伺服器暫時發生錯誤');
    }
  },
};
