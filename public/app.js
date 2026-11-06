const DEFAULT_BILL = 'sample-dinner';
const TOKEN_PREFIX = 'shared-bill-device:';
const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/$/, '');
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

function deviceKey(friendId) { return `${TOKEN_PREFIX}${billId}:${friendId}`; }
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
  if (admin && adminKey) headers.Authorization = `Bearer ${adminKey}`;
  const response = await fetch(`${API_BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache:'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || `伺服器回應 ${response.status}`);
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
  return `<section class="push-card" aria-label="結算結果通知"><div class="push-card-heading"><div><h3>結果通知</h3><p>由你自行選擇，亦可隨時停用</p></div><button class="button secondary push-toggle" id="pushToggle" type="button" disabled>正在檢查…</button></div><p class="push-note" id="pushStatus">只提示「分帳結果已準備好」，不顯示姓名或金額；這是分帳 app 自己的手機通知，不會發到 Cue 聊天。</p></section>`;
}
function vapidApplicationKey(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}
function pushAuthBody() {
  return { ...(activePin ? { pin:activePin } : {}), ...(activeOwnerToken ? { ownerToken:activeOwnerToken } : {}) };
}
function pushSubscriptionPath() {
  return `/api/bills/${encodedBill}/friends/${encodeURIComponent(selectedFriendId)}/push-subscriptions`;
}
async function refreshPushButton() {
  const button = $('#pushToggle');
  if (!button || !pushRegistration) return;
  try {
    pushDeviceSubscription = await pushRegistration.pushManager.getSubscription();
    button.textContent = pushDeviceSubscription ? '停用此裝置通知' : '開啟結算通知';
    button.disabled = false;
    $('#pushStatus').textContent = pushDeviceSubscription
      ? '此裝置已開啟通知；只提示結果已準備好，不會顯示姓名或金額；這是分帳 app 自己的通知，不是 Cue 聊天訊息。'
      : '只提示「分帳結果已準備好」，不顯示姓名或金額；這是分帳 app 自己的手機通知，不會發到 Cue 聊天。';
  } catch {
    button.textContent = '暫時未能檢查通知';
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
      flash('已停用此裝置的結果通知');
    } else {
      const permissionPromise = Notification.permission === 'default' ? Notification.requestPermission() : Promise.resolve(Notification.permission);
      const permission = await permissionPromise;
      if (permission !== 'granted') throw new Error('此裝置尚未允許通知；可在瀏覽器或主畫面 App 設定中開啟。');
      const subscription = await pushRegistration.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:vapidApplicationKey(pushConfig.applicationServerKey) });
      try {
        const response = await api(pushSubscriptionPath(), { method:'POST', body:{ subscription:subscription.toJSON(), ...pushAuthBody() } });
        pushDeviceSubscription = subscription;
        flash(response.replaced ? '此裝置已接收結果通知；另一裝置的訂閱已替換' : '已開啟結算結果通知');
      } catch (error) {
        await subscription.unsubscribe();
        throw error;
      }
    }
    await refreshPushButton();
  } catch (error) {
    flash(error.message || '暫時未能設定通知');
    if (button.isConnected) button.disabled = false;
  }
}
function publicPath() { return `/api/bills/${encodedBill}/public`; }
function adminPath() { return `/api/bills/${encodedBill}/admin`; }
function setConnection(message, bad=false) {
  const el = $('#connectionStatus');
  el.textContent = message;
  el.classList.toggle('error-text', bad);
}
function updateHero() {
  const status = publicData?.status === 'final' ? '已結算' : '填寫中';
  $('#stateBadge').textContent = activeView === 'manager' ? '管理者' : status;
  $('#categoryTag').textContent = activeView === 'manager' && managerData ? (managerData.status === 'final' ? '週末聚餐 · 已結算' : '週末聚餐 · 草稿') : (publicData?.title ? '週末聚餐' : '共用帳單');
  if (activeView === 'manager') {
    $('#screenTitle').textContent = managerData?.title || publicData?.title || '管理者登入';
    $('#screenCopy').textContent = managerData ? '核對朋友申報，一次結算並發布結果。' : '登入後管理帳單及查看申報。';
  } else if (friendPanel?.mode === 'result') {
    $('#screenTitle').textContent = `${friendPanel.friendName}的分帳結果`;
    $('#screenCopy').textContent = '';
  } else {
    $('#screenTitle').textContent = '填寫你的分帳';
    $('#screenCopy').textContent = '選擇名字，加入自己的項目與份量。';
  }
}
async function loadPublic() {
  try {
    const previousStatus = publicData?.status;
    const next = await api(publicPath());
    const changed = JSON.stringify(next) !== JSON.stringify(publicData);
    publicData = next;
    const justFinalized = previousStatus !== 'final' && publicData.status === 'final';
    setConnection(publicData.status === 'final' ? '帳單已結算；可在此查看個人結果。' : '');
    updateHero();
    if (changed) {
      if (activeView === 'friend') {
        if (justFinalized && selectedFriendId && ['saved','edit','new'].includes(friendPanel?.mode)) {
          try {
            const friendId = encodeURIComponent(selectedFriendId);
            const result = await api(`/api/bills/${encodedBill}/friends/${friendId}/access`, {
              method:'POST', body:{ ...(activePin ? { pin:activePin } : {}), ...(activeOwnerToken ? { ownerToken:activeOwnerToken } : {}) }
            });
            if (result.mode === 'result') friendPanel = { ...result, mode:'result', friendName:result.friend.name };
          } catch {}
        }
        renderFriendView();
        if (justFinalized && !document.hidden) flash('帳單已結算；此頁已更新結果');
      }
      else syncManagerCheckMarkers();
    }
    return true;
  } catch (error) {
    setConnection(`連線失敗：${error.message}`, true);
    $('#friendView').innerHTML = '<div class="empty-state">暫時未能連接，請稍後重試。</div>';
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
  if (!publicData) { host.innerHTML = '<div class="empty-state">正在連接共用帳單…</div>'; return; }
  if (!selectedFriendId || !friendPanel) {
    const people = publicData.friends.map(friend => `<button class="friend-choice" type="button" data-select-friend="${escapeHtml(friend.id)}"><span class="avatar" aria-hidden="true">${escapeHtml(friend.name.slice(0,1))}</span><span class="friend-choice-name">${escapeHtml(friend.name)}</span><span class="choice-arrow" aria-hidden="true">›</span></button>`).join('');
    host.innerHTML = `<section class="card chooser-card"><div class="section-heading"><h2>選擇你的名字</h2><span class="meta-count">${publicData.friends.length} 位朋友</span></div><p class="card-subtitle">朋友可查看所有已提交的項目和份量；只有本人可修改自己的申報。</p><div class="friend-picker" role="group" aria-label="選擇朋友名字">${people || '<div class="empty-state">尚未有朋友名單。</div>'}</div></section>${renderSharedChoices()}`;
    $$('[data-select-friend]', host).forEach(button => button.addEventListener('click', () => openFriend(button.dataset.selectFriend)));
    $$('[data-edit-friend]', host).forEach(button => button.addEventListener('click', () => openFriend(button.dataset.editFriend)));
    return;
  }
  host.innerHTML = `<div id="personalPanel">${renderFriendPanel()}</div>${renderSharedChoices()}`;
  bindFriendPanel();
}
function friendIdentity(friendName) {
  const choices = selectingFriend ? `<div class="name-options" role="group" aria-label="更改填寫人">${publicData.friends.map(friend => `<button class="name-option" type="button" data-select-friend="${escapeHtml(friend.id)}" ${friend.id === selectedFriendId ? 'aria-current="true"' : ''}>${escapeHtml(friend.name)}</button>`).join('')}</div>` : '';
  return `<section class="identity-card"><span class="avatar avatar-large" aria-hidden="true">${escapeHtml(friendName.slice(0,1))}</span><div class="identity-copy"><span class="identity-label">填寫人</span><strong>${escapeHtml(friendName)}</strong></div><button class="text-action" id="changeFriend" type="button">${selectingFriend ? '收起' : '更改'}</button>${choices}</section>`;
}

function renderSharedChoices() {
  const selections = publicData?.selections || {};
  const submittedCount = Object.keys(selections).length;
  const mode = friendPanel?.mode || '';
  const ownAuthorized = selectedFriendId && ['new','edit','saved','result'].includes(mode) ? selectedFriendId : '';
  const checkedItems = (publicData?.items || []).filter(item => item.needsCheck === true);
  const checkList = checkedItems.length && !['new','edit','result'].includes(mode)
    ? `<div class="shared-check-items" role="group" aria-label="朋友檢查提示">${checkedItems.map(item => `<div class="shared-check-item" data-public-check-item="${escapeHtml(item.id)}"><strong>${escapeHtml(item.name)}</strong><span class="needs-check-marker">${item.pricingMode === 'shared_unit' ? '大家再確認份量／共享' : '大家再對一對份量'}</span></div>`).join('')}</div>`
    : '';
  const rows = (publicData?.friends || []).map(friend => {
    const selection = selections[friend.id];
    const own = friend.id === ownAuthorized;
    const pending = friend.id === selectedFriendId && mode === 'gate';
    const badge = own ? '本人' : pending ? '待本人驗證' : selection ? '已提交' : '尚未提交';
    const picks = selection ? publicData.items.map(item => {
      const qty = Number(selection.quantities?.[item.id] || 0);
      const sharing = selection.sharing?.[item.id] === true;
      if (item.pricingMode === 'shared_unit') {
        if (sharing) return `<span class="shared-choice-pick">${escapeHtml(item.name)}（參與共享）</span>`;
        if (qty > 0) return `<span class="shared-choice-pick">${escapeHtml(item.name)}（個人 ${qty} ${escapeHtml(item.unit)}）</span>`;
        return '';
      }
      if (qty <= 0) return '';
      return item.unit
          ? `<span class="shared-choice-pick">${escapeHtml(item.name)} × ${qty} ${escapeHtml(item.unit)}</span>`
          : `<span class="shared-choice-pick">${escapeHtml(item.name)}（參與均分）</span>`;
    }).filter(Boolean).join('') : '';
    const detail = selection ? (picks || '<span class="shared-choice-empty">已提交，未選項目</span>') : '<span class="shared-choice-empty">尚未提交</span>';
    const canEdit = own && publicData.status !== 'final' && mode !== 'result';
    const action = canEdit ? `<button class="shared-edit-button" type="button" data-edit-friend="${escapeHtml(friend.id)}">${mode === 'edit' || mode === 'new' ? '編輯中 · 前往本人項目' : '修改本人申報'}</button>` : '';
    return `<div class="shared-choice-row ${own ? 'is-own' : ''}" data-shared-choice="${escapeHtml(friend.id)}"><div class="shared-choice-head"><strong>${escapeHtml(friend.name)}</strong><span class="shared-choice-badge ${own ? 'own-badge' : ''}">${badge}</span></div><div class="shared-choice-details">${detail}</div>${action}</div>`;
  }).join('');
  return `<section class="card shared-choice-card" aria-label="朋友已填項目和份量"><div class="section-heading"><h2>朋友已填項目和份量</h2><span class="meta-count">${submittedCount} / ${(publicData?.friends || []).length}</span></div><p class="card-subtitle">已提交的選項對朋友公開；只有本人可編輯自己的申報。</p>${checkList}<div class="shared-choice-list">${rows || '<div class="empty-state">尚未有朋友名單。</div>'}</div></section>`;
}
function renderFriendPanel() {
  const mode = friendPanel?.mode;
  if (mode === 'loading') return '<div class="card empty-state">正在開啟個人資料…</div>';
  if (mode === 'gate') return `<section class="card gate-card"><div class="section-heading"><h2>${escapeHtml(friendPanel.friendName)}的個人資料</h2><span class="meta-count">本人專用</span></div><p class="card-subtitle">${friendPanel.code === 'device_required' ? '這份申報只可在首次填單的裝置開啟；如有設定個人密碼，請在此輸入。' : '請輸入自己設定的三個字元編輯碼。'}</p><form id="pinGateForm"><label class="field-label" for="pinGate">3 位編輯碼</label><input class="text-input pin-input" id="pinGate" type="password" inputmode="text" autocomplete="current-password" maxlength="3" aria-describedby="pinGateError" required><p class="field-error ${friendPanel.code === 'wrong_pin' ? '' : 'hidden'}" id="pinGateError" role="alert">${friendPanel.code === 'wrong_pin' ? '編輯碼不正確；未開啟個人編輯資料。' : ''}</p><button class="button primary primary-wide" type="submit">開啟我的分帳</button></form><p class="field-help">編輯碼由你自行設定；可留空，留空後只可在原裝置修改。</p><button class="button ghost primary-wide" id="backToChooser" type="button">返回選擇名字</button></section>`;
  if (mode === 'error') return `<div class="field-error" role="alert">${escapeHtml(friendPanel.message)}</div>`;
  if (mode === 'result') {
    const rows = friendPanel.breakdown.map(row => { const qty = Number(row.quantity || 0); const selected = qty > 0 || row.sharing === true; const label = row.pricingMode === 'shared_unit' ? (row.sharing ? '參與共享' : qty > 0 ? `個人 ${qty} ${escapeHtml(row.unit)}` : '未選') : row.unit ? `${qty} ${escapeHtml(row.unit)}` : selected ? '參與均分' : '未選'; const marker = row.needsCheck ? `<span class="needs-check-marker">${row.pricingMode === 'shared_unit' ? '大家再確認份量／共享' : '大家再對一對份量'}</span>` : ''; return `<div class="breakdown-row ${row.needsCheck?'needs-check':''}" data-item-row="${escapeHtml(row.id)}"><span>${escapeHtml(row.name)}<span class="share-dot">·</span> ${label}${marker}</span><strong>${money(row.cents)}</strong></div>`; }).join('');
    return `<div class="result-screen" data-personal-result="${escapeHtml(selectedFriendId)}"><section class="result-hero"><span class="result-check" aria-hidden="true">✓</span><p class="result-label">你應付</p><strong class="result-amount">${money(friendPanel.amountCents)}</strong><p class="result-caption">分帳已完成</p></section><section class="card result-breakdown"><div class="section-heading"><h2>我的項目</h2><span class="meta-count">${friendPanel.breakdown.length} 項</span></div><div class="breakdown">${rows}</div></section><p class="privacy-note"><span aria-hidden="true">♙</span> 分攤金額只顯示本人；朋友選項僅供查看</p><button class="button secondary primary-wide result-edit" id="editOwnResult" type="button" disabled aria-describedby="resultLockNote">修改我的分帳</button><p class="result-lock-note" id="resultLockNote">帳單已結算，所有申報已鎖定，不能再修改。</p><p class="result-footer">${escapeHtml(publicData.title)} · 分帳結果</p></div>`;
  }
  if (mode === 'saved') return `<section class="card saved-card" data-submission-saved="${escapeHtml(selectedFriendId)}"><div class="saved-check">✓</div><h2 class="card-title">已儲存你的分帳</h2><p class="card-subtitle">朋友可查看你的已選項目；只有你可修改自己的申報。</p></section>${pushControlMarkup()}`;
  if (mode === 'edit' || mode === 'new') {
    const isNew = mode === 'new';
    const rows = publicData.items.map(item => {
      const qty = Number(friendPanel.quantities?.[item.id] || 0);
      const unit = item.unit || '';
      const shared = item.pricingMode === 'shared_unit';
      const sharing = friendPanel.sharing?.[item.id] === true;
      const selectionLabel = shared ? (sharing ? '參與共享' : qty > 0 ? `個人 ${qty} ${unit}` : '未選') : unit ? String(qty) : qty > 0 ? '已選' : '未選';
      const priceLabel = !unit
        ? `整項總額 ${money(item.priceCents)}；選用朋友平分`
        : shared
          ? `每${escapeHtml(unit)} ${money(item.priceCents)}；個人數量照計，參與者平分剩餘已購份量`
          : `每${escapeHtml(unit)} ${money(item.priceCents)}；按數量計，不再平分`;
      const control = shared
        ? `<span class="shared-item-controls"><span class="quantity-control"><button class="qty-button" type="button" data-step="-1" data-item="${escapeHtml(item.id)}" aria-label="減少${escapeHtml(item.name)}個人數量">−</button><input class="qty-input" type="number" min="0" max="99" step="1" inputmode="numeric" data-qty="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)}${escapeHtml(unit)}個人數量" value="${qty}"><button class="qty-button" type="button" data-step="1" data-item="${escapeHtml(item.id)}" aria-label="增加${escapeHtml(item.name)}個人數量">＋</button></span><label class="quantity-control split-toggle shared-toggle"><input type="checkbox" data-share-item="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)}參與共享剩餘份量" ${sharing ? 'checked' : ''}><span>參與共享</span></label></span>`
        : unit
          ? `<span class="quantity-control"><button class="qty-button" type="button" data-step="-1" data-item="${escapeHtml(item.id)}" aria-label="減少${escapeHtml(item.name)}數量">−</button><input class="qty-input" type="number" min="0" max="99" step="1" inputmode="numeric" data-qty="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)}${escapeHtml(unit)}數量" value="${qty}"><button class="qty-button" type="button" data-step="1" data-item="${escapeHtml(item.id)}" aria-label="增加${escapeHtml(item.name)}數量">＋</button></span>`
          : `<span class="quantity-control split-toggle"><input type="checkbox" data-qty="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.name)}是否參與均分" ${qty > 0 ? 'checked' : ''}><span>參與均分</span></span>`;
      const marker = item.needsCheck ? `<span class="needs-check-marker">${shared ? '大家再確認份量／共享' : '大家再對一對份量'}</span>` : '';
      return `<div class="dish-row ${shared?'shared-dish-row':''} ${item.needsCheck?'needs-check':''}" data-item-row="${escapeHtml(item.id)}"><span class="dish-copy"><span class="dish-name">${escapeHtml(item.name)}</span><span class="dish-qty-label"><span data-qty-label="${escapeHtml(item.id)}">${selectionLabel}</span>${unit && !shared ? ` ${escapeHtml(unit)}` : ''}</span><span class="dish-price">${priceLabel}</span>${marker}</span>${control}</div>`;
    }).join('');
    const selectedItems = publicData.items.reduce((sum,item) => sum + (Number(friendPanel.quantities?.[item.id] || 0) > 0 || friendPanel.sharing?.[item.id] === true ? 1 : 0), 0);
    const pinField = friendPanel.pinProtected
      ? '<p class="safe-note">已用你剛才輸入的編輯碼開啟；再次修改仍需編輯碼。</p>'
      : '<div class="pin-card"><div><strong>3 位編輯碼</strong><p>可選；方便日後更換裝置修改</p></div><input class="pin-inline" id="editPin" type="password" inputmode="text" autocomplete="new-password" maxlength="3" placeholder="選填" aria-label="自行設定 3 位編輯碼"></div>';
    const disabled = publicData.status === 'final' ? 'disabled' : '';
    return `<form class="entry-screen" id="submissionForm" data-personal-view="${escapeHtml(selectedFriendId)}">${friendIdentity(friendPanel.friendName)}<div class="section-heading entry-heading"><h2>我的項目</h2><span class="meta-count">${publicData.items.length} 項</span></div><p class="pricing-rule-note entry-pricing-note">有單位：按個人數量計，或在指定項目參與共享剩餘份量；無單位：整項金額由有選的人平分。</p><section class="card item-card"><div class="dish-list">${rows || '<div class="empty-state">帳單沒有項目。</div>'}</div></section><div class="item-total-action" aria-label="此版本項目管理由管理者處理">＋ 帳單項目由管理者設定</div>${pinField}<p class="inline-error hidden" id="submitError" role="alert"></p><div class="entry-total"><span>已選項目</span><strong><span id="totalQty">${selectedItems}</span> 項</strong></div><button class="button primary primary-wide" id="submitOwnBill" type="submit" ${disabled}>${isNew ? '提交我的分帳' : '儲存我的更新'}</button></form>`;
  }
  return '<div class="empty-state">選擇自己的名字，開始填分帳。</div>';
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
    const response = await api(`/api/bills/${encodedBill}/friends/${encodeURIComponent(friendId)}/access`, {
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
    if (Array.from(pin).length !== 3) { showInlineError('#pinGateError', '編輯碼要剛好 3 個字元。'); return; }
    await openFriend(selectedFriendId, pin);
  });
  $$('[data-step]').forEach(button => button.addEventListener('click', () => {
    const input = $(`[data-qty="${CSS.escape(button.dataset.item)}"]`);
    if (!input) return;
    input.value = Math.max(0, Math.min(99, (Number(input.value) || 0) + Number(button.dataset.step)));
    updateQuantitySummary(input);
  }));
  $$('#personalPanel [data-qty]').forEach(input => input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', () => {
    if (input.type !== 'checkbox') input.value = Math.max(0, Math.min(99, Math.floor(Number(input.value) || 0)));
    updateQuantitySummary(input);
  }));
  $$('#personalPanel [data-share-item]').forEach(input => input.addEventListener('change', () => {
    const qtyInput = $(`[data-qty="${CSS.escape(input.dataset.shareItem)}"]`);
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
    if ($('#editPin')?.value && Array.from($('#editPin').value).length !== 3) { showInlineError('#submitError', '編輯碼要剛好 3 個字元；不設可留空。'); return; }
    try {
      const response = await api(`/api/bills/${encodedBill}/friends/${encodeURIComponent(selectedFriendId)}/submissions`, {
        method:'POST', body:{ quantities, sharing, ...(pin ? { pin } : {}), ...(activeOwnerToken ? { ownerToken:activeOwnerToken } : {}) }
      });
      if (response.ownerToken) localStorage.setItem(deviceKey(selectedFriendId), response.ownerToken);
      if (pin) localStorage.removeItem(deviceKey(selectedFriendId));
      activePin = pin; activeOwnerToken = response.ownerToken || activeOwnerToken;
      friendPanel = { mode:'saved', friendName:publicData.friends.find(friend => friend.id === selectedFriendId)?.name || '', updated:!friendPanel || friendPanel.mode !== 'new' };
      renderFriendView();
      flash('已儲存你的分帳');
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
  const label = $(`[data-qty-label="${CSS.escape(id)}"]`);
  const item = publicData?.items.find(row => row.id === id);
  if (item?.pricingMode === 'shared_unit') {
    const qtyInput = $(`[data-qty="${CSS.escape(id)}"]`), shareInput = $(`[data-share-item="${CSS.escape(id)}"]`);
    if (input.dataset.qty && Number(qtyInput?.value || 0) > 0 && shareInput) shareInput.checked = false;
    const qty = Number(qtyInput?.value || 0);
    if (label) label.textContent = shareInput?.checked ? '參與共享' : qty > 0 ? `個人 ${qty} ${item.unit}` : '未選';
  } else if (label) label.textContent = input.type === 'checkbox' ? (input.checked ? '已選' : '未選') : String(input.value || 0);
  const selected = publicData.items.reduce((sum,item) => {
    const qtyInput = $(`[data-qty="${CSS.escape(item.id)}"]`), shareInput = $(`[data-share-item="${CSS.escape(item.id)}"]`);
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
  const rows = prompts.map(row => `<p>${row.reason === 'no_participants' ? `「${escapeHtml(row.name)}」仲有 ${row.remainingQty} ${escapeHtml(row.unit)}未有人認領／共享，大家再對一對；有人選擇共享或修正資料後先可以結算。` : `「${escapeHtml(row.name)}」目前只有一位朋友參與共享；剩餘 ${row.remainingQty} ${escapeHtml(row.unit)}（${money(row.totalCents)}）會由該朋友分擔，大家再確認一下。`}</p>`).join('');
  return `<section class="quantity-reminder shared-participation-reminder" id="participationReminder" role="status" aria-live="polite">${rows}</section>`;
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
  const action = finalized ? '帳單尚有份量未被認領，不能完成結算。' : '完成認領／共享後才可以結算。';
  const pendingRows = (calculations?.breakdown || []).filter(row => row.unallocatedCents > 0).map(row => `<li>${escapeHtml(row.name)}：尚有 ${money(row.unallocatedCents)} 待認領／共享</li>`).join('');
  return `<section class="unallocated-note" id="unallocatedNote"><p><strong>尚待認領／共享 ${money(unallocatedCents)}</strong>；不會分到任何人。${action}</p>${pendingRows ? `<ul>${pendingRows}</ul>` : ''}<p class="allocation-reconciliation" id="allocationReconciliation">已認領 ${money(allocatedCents)} ＋ 尚待認領／共享 ${money(unallocatedCents)} ＝ 預計全單總額 ${money(billTotalCents)}</p></section>`;
}
function managerReadinessHint(readiness, allSubmitted, finalized=false) {
  if (finalized) return '帳單已結算；所有項目均已完成認領。';
  if ((readiness?.participationPrompts || []).some(row => row.reason === 'no_participants')) return '呢項仲有份量未有人認領／共享，大家再對一對；完成後才可結算。';
  const mismatches = readiness?.quantityMismatches || [];
  if (mismatches.length) return mismatches.every(row => row.reason === 'expected_missing') ? '實際已購數量未填，大家再對一對；填妥後才可結算。' : '份數同實際已購數量有啲出入，大家再對一對；修正後才可結算。';
  if (!allSubmitted) return '等大家提交後，再核對每項份量。';
  if (!readiness?.allClaimed) return '每項都要有人認領，大家再對一對。';
  return '所有項目都已認領；核對後可以結算。';
}
function renderManagerView() {
  const host = $('#managerView');
  if (!managerData) {
    host.innerHTML = `<section class="card login-card"><div class="manager-symbol" aria-hidden="true">⌘</div><h2>管理者登入</h2><p class="card-subtitle">管理摘要及朋友申報只會在通過驗證後載入。</p><form id="adminLogin"><label class="field-label" for="adminKeyInput">臨時管理密鑰</label><input class="text-input" id="adminKeyInput" type="password" autocomplete="current-password" required><p class="field-error hidden" id="adminLoginError" role="alert"></p><button class="button primary primary-wide" type="submit">開啟管理面板</button></form><p class="field-help">密鑰只保留在這個分頁，切回朋友頁會清除。</p></section>`;
    $('#adminLogin')?.addEventListener('submit', async event => {
      event.preventDefault();
      adminKey = $('#adminKeyInput').value;
      try { managerData = await api(adminPath(), { admin:true }); renderManagerView(); updateHero(); }
      catch { adminKey = ''; showInlineError('#adminLoginError', '密鑰不正確或管理面板暫不可用。'); }
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
  const summaryLabel = finalized ? '全單總額' : allSubmitted ? '預計全單總額' : '已提交份量估算';
  const peopleRows = managerData.friends.map(friend => {
    const submitted = managerData.submissions[friend.id]?.submitted;
    const amount = submitted ? money(totals[friend.id] || 0) : '尚未提交';
    return `<div class="person-row" data-person-row="${escapeHtml(friend.id)}"><span class="avatar avatar-row" aria-hidden="true">${escapeHtml(friend.name.slice(0,1))}</span><div class="person-copy"><strong>${escapeHtml(friend.name)}</strong><span>${submitted ? '已提交' : '未提交'}</span></div><strong class="person-amount">${amount}</strong></div>`;
  }).join('');
  const itemRows = managerData.items.map(item => {
    const id = escapeHtml(item.id), name = escapeHtml(item.name), unit = item.unit || '';
    const mode = unit ? (item.pricingMode === 'shared_unit' ? 'shared_unit' : 'per_unit') : 'split_total';
    const modeLabel = !unit ? `整項總額：${money(item.priceCents)}，由選用朋友平分` : mode === 'shared_unit' ? `個人數量＋共享餘量：每${escapeHtml(unit)} ${money(item.priceCents)}；個人申報先計，參與者平分剩餘已購份量` : `單價：每${escapeHtml(unit)} ${money(item.priceCents)}，按個人數量計，不再平分`;
    const priceAria = unit ? `${name}每${escapeHtml(unit)}單價` : `${name}整項總額`;
    const expected = item.expectedQty === null || item.expectedQty === undefined ? '' : String(item.expectedQty);
    const marker = item.needsCheck ? `<span class="needs-check-marker" data-needs-check-marker>${mode === 'shared_unit' ? '大家再確認份量／共享' : '大家再對一對份量'}</span>` : '';
    const modeControl = `<div class="pricing-mode-field" data-mode-field="${id}" ${unit?'':'hidden'}><label for="item-mode-${id}">有單位的分攤方式</label><select class="pricing-mode-select" id="item-mode-${id}" data-item-pricing-mode="${id}" aria-label="${name}分攤方式" ${!unit||finalized?'disabled':''}><option value="per_unit" ${mode==='per_unit'?'selected':''}>按各人數量計</option><option value="shared_unit" ${mode==='shared_unit'?'selected':''}>個人數量＋參與共享餘量</option></select><p class="field-help" data-mode-help="${id}">${mode==='shared_unit'?'朋友可申報個人數量，或參與平分個人申報後的剩餘已購份量。':'朋友按自己實際數量計算。'}</p></div>`;
    const required = unit ? 'required' : '';
    const expectedHelp = mode === 'shared_unit' ? '按此數量扣除個人申報後，剩餘份量才由參與者平分；結算前需填寫。' : '結算前需填寫實際已購數量，並與朋友申報份數相符。';
    return `<div class="item-editor ${item.needsCheck?'needs-check':''}" data-item-editor="${id}"><div class="edit-row item-edit"><label class="sr-only" for="item-name-${id}">${name}名稱</label><input class="text-input" id="item-name-${id}" data-item-name="${id}" maxlength="40" value="${name}" ${finalized?'disabled':''}><label class="sr-only" for="item-unit-${id}">${name}單位（選填）</label><input class="unit-input" id="item-unit-${id}" data-item-unit="${id}" maxlength="4" placeholder="選填" value="${escapeHtml(unit)}" aria-label="${name}單位（選填）" ${finalized?'disabled':''}><label class="sr-only" for="item-price-${id}">${priceAria}</label><input class="money-input" id="item-price-${id}" data-item-price="${id}" type="number" min="0" step="0.01" value="${(item.priceCents/100).toFixed(2)}" aria-label="${priceAria}" ${finalized?'disabled':''}><button class="icon-button" type="button" data-remove-item="${id}" aria-label="移除${name}" ${finalized||managerData.items.length<=1?'disabled':''}>×</button></div><p class="item-price-mode" data-price-mode="${id}">${modeLabel}</p>${modeControl}${marker}<div class="expected-qty-field" data-expected-field="${id}" ${unit?'':'hidden'}><label for="item-expected-${id}">實際已購數量（<span data-expected-unit="${id}">${escapeHtml(unit)}</span>）</label><input class="expected-qty-input" id="item-expected-${id}" data-item-expected="${id}" type="number" min="0" max="9900" step="1" inputmode="numeric" value="${escapeHtml(expected)}" placeholder="請填已購數量" aria-label="${name}實際已購數量${escapeHtml(unit)}" ${!unit||finalized?'disabled':''} ${required}><p class="field-help" data-expected-help="${id}">${expectedHelp}</p></div></div>`;
  }).join('');
  const friendRows = managerData.friends.map((friend,index) => `<div class="edit-row person-edit"><span class="avatar" aria-hidden="true">${escapeHtml(friend.name.slice(0,1))}</span><label class="sr-only" for="friend-name-${escapeHtml(friend.id)}">朋友 ${index+1} 名稱</label><input class="text-input" id="friend-name-${escapeHtml(friend.id)}" data-friend-name="${escapeHtml(friend.id)}" maxlength="32" value="${escapeHtml(friend.name)}" ${finalized?'disabled':''}><button class="icon-button" type="button" data-remove-friend="${escapeHtml(friend.id)}" aria-label="移除${escapeHtml(friend.name)}" ${finalized||managerData.friends.length<=1?'disabled':''}>×</button></div>`).join('');
  const quantityWarnings = managerData.readiness?.quantityMismatches || [];
  const reminderText = quantityWarnings.length && quantityWarnings.every(row => row.reason === 'expected_missing') ? '實際買入數量未填，大家再核對一下。' : '份數同實際買入數量有啲出入，大家再檢查一下。';
  const quantityReminder = !finalized && quantityWarnings.length ? `<section class="quantity-reminder" id="quantityReminder" role="status" aria-live="polite"><p>${reminderText}</p></section>` : '';
  const participationPrompts = managerData.readiness?.participationPrompts || [];
  const participationReminder = participationReminderHtml(participationPrompts, finalized);
  const unallocatedNote = managerData.readiness?.everyone ? unallocatedSummaryHtml(calculations, finalized) : '';
  const statusRows = managerData.friends.map(friend => {
    const sub = managerData.submissions[friend.id];
    const detail = sub?.submitted ? managerData.items.map(item => {
      const qty = Number(sub.quantities[item.id] || 0);
      return item.pricingMode === 'shared_unit' ? `${escapeHtml(item.name)} ${sub.sharing?.[item.id] ? '參與共享' : qty > 0 ? `個人 ${qty} ${escapeHtml(item.unit)}` : '未選'}` : item.unit ? `${escapeHtml(item.name)} ${qty} ${escapeHtml(item.unit)}` : `${escapeHtml(item.name)} ${qty > 0 ? '參與均分' : '未選'}`;
    }).join(' · ') : '未提交';
    return `<div class="status-row ${sub?.submitted?'done':''}"><strong>${escapeHtml(friend.name)}</strong><span>${detail}</span></div>`;
  }).join('');
  const readinessHint = managerReadinessHint(managerData.readiness, allSubmitted, finalized);
  host.innerHTML = `<section class="summary-card"><div class="summary-label" id="summaryLabel">${summaryLabel}</div><strong class="summary-total" id="summaryTotal">${money(totalCents)}</strong><div class="summary-meta"><span id="summaryPeople">${managerData.friends.length} 位朋友</span><strong id="summaryProgress">${finalized ? '已結算' : `已收齊 ${managerData.progress.submitted} / ${managerData.progress.total}`}</strong></div>${unallocatedNote}</section>
    <div class="section-heading manager-heading"><h2>朋友分帳</h2><span class="manager-view-label">管理者檢視</span></div>
    <section class="card people-card">${peopleRows || '<div class="empty-state">尚未有朋友名單。</div>'}</section>
    ${quantityReminder}
    ${participationReminder}
    <div class="manager-actions main-manager-actions"><button class="button secondary primary-wide" id="copyLink" type="button"><span aria-hidden="true">↗</span> 複製朋友填寫連結</button><button class="button primary primary-wide finalize-button" id="finalizeBill" type="button" ${finalized||!managerData.readiness.ready?'disabled':''}><span aria-hidden="true">✓</span> ${finalized ? '已結算並發布結果' : '結算並發布結果'}</button></div>
    <p class="button-hint" id="readinessHint">${readinessHint}</p>
    ${finalized ? '<section class="lock-note">帳單已完成；所有修改及新申報均已鎖定。</section>' : ''}
    <details class="admin-edit"><summary>編輯帳單資料</summary><section class="card edit-card"><label class="field-label" for="bill-title">帳單名稱</label><input class="text-input" id="bill-title" maxlength="60" value="${escapeHtml(managerData.title)}"><div class="card-head edit-head"><div><h3>項目及定價</h3><p class="card-subtitle">單位選填：留空按人均分；有單位可維持個人數量，或指定共享餘量</p></div></div><p class="pricing-rule-note" id="pricingRuleNote">單位留空：整項總額由選用者平分。有單位：按個人數量計時，單價乘份數；選用共享餘量時，需填實際已購數量，先扣除個人申報，再由選擇共享的朋友平分餘量。</p><div class="edit-list">${itemRows}</div><button class="button ghost add-button" id="addItem" type="button">＋ 加一項</button><div class="card-head edit-head"><div><h3>朋友名單</h3><p class="card-subtitle">${managerData.progress.submitted} / ${managerData.progress.total} 位已提交</p></div></div><div class="edit-list">${friendRows}</div><button class="button ghost add-button" id="addFriend" type="button">＋ 加一位朋友</button><div class="manager-actions"><button class="button secondary" id="saveManager" type="button">儲存變更</button></div><p class="field-error hidden" id="managerError" role="alert"></p><div class="status-list">${statusRows}</div></section></details>`;
  bindManager();
}
function refreshManagerItem(item) {
  const id = CSS.escape(item.id), unit = item.unit || '', finalized = managerData?.status === 'final';
  if (!unit) item.pricingMode = 'split_total';
  else if (!['per_unit','shared_unit'].includes(item.pricingMode)) item.pricingMode = 'per_unit';
  const mode = item.pricingMode;
  const modeField = $(`[data-mode-field="${id}"]`), modeSelect = $(`[data-item-pricing-mode="${id}"]`);
  if (modeField) modeField.hidden = !unit;
  if (modeSelect) { if (unit) modeSelect.value = mode; modeSelect.disabled = !unit || finalized; }
  const modeHelp = $(`[data-mode-help="${id}"]`);
  if (modeHelp) modeHelp.textContent = mode === 'shared_unit' ? '朋友可申報個人數量，或參與平分個人申報後的剩餘已購份量。' : '朋友按自己實際數量計算。';
  const modeText = $(`[data-price-mode="${id}"]`);
  if (modeText) modeText.textContent = !unit ? `整項總額：${money(item.priceCents)}，由選用朋友平分` : mode === 'shared_unit' ? `個人數量＋共享餘量：每${unit} ${money(item.priceCents)}；個人申報先計，參與者平分剩餘已購份量` : `單價：每${unit} ${money(item.priceCents)}，按個人數量計，不再平分`;
  const price = $(`[data-item-price="${id}"]`);
  if (price) price.setAttribute('aria-label', unit ? `${item.name}每${unit}單價` : `${item.name}整項總額`);
  const expectedField = $(`[data-expected-field="${id}"]`), expected = expectedField?.querySelector('[data-item-expected]');
  if (expectedField) expectedField.hidden = !unit;
  if (expected) { expected.disabled = !unit || finalized; expected.required = !!unit; expected.setAttribute('aria-label', `${item.name}實際已購數量${unit}`); }
  const expectedUnit = $(`[data-expected-unit="${id}"]`); if (expectedUnit) expectedUnit.textContent = unit;
  const expectedHelp = $(`[data-expected-help="${id}"]`); if (expectedHelp) expectedHelp.textContent = mode === 'shared_unit' ? '按此數量扣除個人申報後，剩餘份量才由參與者平分；結算前需填寫。' : '結算前需填寫實際已購數量，並與朋友申報份數相符。';
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
  if (missingSharedCount) { showInlineError('#managerError', `「${missingSharedCount.name}」多人共享需填實際已購數量。`); $(`[data-item-expected="${CSS.escape(missingSharedCount.id)}"]`)?.focus(); return; }
  try {
    managerData = await api(adminPath(), { method:'PUT', admin:true, body:{ title:managerData.title, items:managerData.items, friends:managerData.friends } });
    renderManagerView();
    await loadPublic();
    flash('變更已儲存');
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
  $('#addItem')?.addEventListener('click', () => { updateManagerDraftFromInputs(); managerData.items.push({ id:`dish-${crypto.randomUUID().slice(0,8)}`, name:'新項目', unit:'', priceCents:0, pricingMode:'split_total', expectedQty:null }); renderManagerView(); $('#managerView details').open=true; });
  $('#addFriend')?.addEventListener('click', () => { updateManagerDraftFromInputs(); const id=`friend-${crypto.randomUUID().slice(0,8)}`; let name='新朋友', n=2; while(managerData.friends.some(person=>person.name===name))name=`新朋友${n++}`; managerData.friends.push({id,name}); renderManagerView(); $('#managerView details').open=true; });
  $$('[data-remove-item]').forEach(button => button.addEventListener('click', () => openDeleteDialog('item', button.dataset.removeItem, button)));
  $$('[data-remove-friend]').forEach(button => button.addEventListener('click', () => openDeleteDialog('friend', button.dataset.removeFriend, button)));
  $('#finalizeBill')?.addEventListener('click', async () => {
    try { managerData = await api(`${adminPath()}/finalize`, { method:'POST', admin:true }); renderManagerView(); await loadPublic(); flash('帳單已結算；分享連結不變'); }
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
  $('#deleteConfirmTitle').textContent = `確定要刪除「${entity.name}」？`;
  const hasData = type === 'friend' && managerData.submissions[id]?.submitted;
  $('#deleteConfirmCopy').textContent = type === 'item'
    ? '刪除後會從帳單移除此項目，並一併清除朋友在此項目的已填份數。'
    : hasData ? `「${entity.name}」已提交資料；刪除朋友時，該朋友的申報資料亦會一併移除。` : '刪除後會從朋友名單移除此人。';
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
  history.replaceState(null, '', `/?bill=${encodedBill}`);
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
    const box = $(`[data-item-editor="${CSS.escape(item.id)}"]`);
    if (!box) return;
    box.classList.toggle('needs-check', needsCheck);
    item.needsCheck = needsCheck;
    let marker = box.querySelector('[data-needs-check-marker]');
    const markerText = (publicItem?.pricingMode || item.pricingMode) === 'shared_unit' ? '大家再確認份量／共享' : '大家再對一對份量';
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
    const text = missingOnly ? '實際買入數量未填，大家再核對一下。' : '申報份數同實際已購數量有啲出入，大家再檢查一下。';
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
    current.innerHTML = `<p>${text}</p>`;
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
  if ($('#summaryLabel')) $('#summaryLabel').textContent = finalized ? '全單總額' : allSubmitted ? '預計全單總額' : '已提交份量估算';
  if ($('#summaryTotal')) $('#summaryTotal').textContent = money(total);
  if ($('#summaryPeople')) $('#summaryPeople').textContent = `${fresh.friends.length} 位朋友`;
  if ($('#summaryProgress')) $('#summaryProgress').textContent = finalized ? '已結算' : `已收齊 ${submitted} / ${totalFriends}`;
  fresh.friends.forEach(friend => {
    const row = $(`[data-person-row="${CSS.escape(friend.id)}"]`);
    const sub = fresh.submissions[friend.id];
    if (row) {
      const copy = row.querySelector('.person-copy span'); if (copy) copy.textContent = sub?.submitted ? '已提交' : '未提交';
      const amount = row.querySelector('.person-amount'); if (amount) amount.textContent = sub?.submitted ? money(totals[friend.id] || 0) : '尚未提交';
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
  if (finalize) { finalize.disabled = finalized || !fresh.readiness?.ready; finalize.innerHTML = `<span aria-hidden="true">✓</span> ${finalized ? '已結算並發布結果' : '結算並發布結果'}`; }
  if ($('#readinessHint')) $('#readinessHint').textContent = managerReadinessHint(fresh.readiness, allSubmitted, finalized);
  if (finalized && !$('#managerView .lock-note')) $('#readinessHint')?.insertAdjacentHTML('afterend','<section class="lock-note">帳單已完成；所有修改及新申報均已鎖定。</section>');
  if (!finalized) $('#managerView .lock-note')?.remove();
  syncManagerCheckMarkers();
}

async function copyLink() {
  const link = new URL(location.href);
  link.searchParams.delete('manage');
  try { await navigator.clipboard.writeText(link.href); flash('朋友填寫連結已複製'); }
  catch { flash('請從網址列複製分享連結'); }
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
