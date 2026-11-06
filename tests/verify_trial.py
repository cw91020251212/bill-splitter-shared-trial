#!/usr/bin/env python3
"""End-to-end smoke/regression test against the deployed Pages + Worker + D1 trial."""
from __future__ import annotations
import json, os, secrets, time
from pathlib import Path
from urllib.parse import urlsplit
import requests
from playwright.sync_api import sync_playwright

SITE = os.environ.get('SITE_URL', 'https://cw91020251212.github.io/bill-splitter-shared-trial/').rstrip('/') + '/'
API = os.environ.get('API_URL', 'https://bill-splitter-shared-trial.cw9102025.workers.dev').rstrip('/')
KEY = os.environ.get('ADMIN_KEY') or Path(os.environ['ADMIN_KEY_FILE']).read_text(encoding='utf-8').strip()
ORIGIN = f"{urlsplit(SITE).scheme}://{urlsplit(SITE).netloc}"
checks: list[str] = []

def check(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)
    checks.append(message)

def bill_url(bill_id: str, manage: bool = False) -> str:
    return f"{SITE}?bill={bill_id}" + ('&manage=1' if manage else '')

def endpoint(bill_id: str, suffix: str = '') -> str:
    return f'{API}/api/bills/{bill_id}{suffix}'

def admin_headers():
    return {'Authorization': f'Bearer {KEY}'}

def post_friend(session: requests.Session, bill_id: str, friend_id: str, payload: dict):
    return session.post(endpoint(bill_id, f'/friends/{friend_id}/submissions'), json=payload, timeout=20)

def create_bill(session: requests.Session, bill_id: str, mode: str = 'shared_unit', expected=2):
    item = {'id':'coffee','name':'咖啡','unit':'杯','priceCents':1000,'pricingMode':mode,'expectedQty':expected}
    body = {'id':bill_id,'title':'虛構共享測試','items':[item], 'friends':[
        {'id':'friend-a','name':'阿A'}, {'id':'friend-b','name':'阿B'}, {'id':'friend-c','name':'阿C'}]}
    response = session.post(f'{API}/api/bills', headers=admin_headers(), json=body, timeout=20)
    check(response.status_code == 201, f'{bill_id} 測試帳單建立成功')
    return body

def set_manager_bill(session: requests.Session, bill_id: str, body: dict):
    response = session.put(endpoint(bill_id, '/admin'), headers=admin_headers(), json={k:v for k,v in body.items() if k != 'id'}, timeout=20)
    return response

def cleanup(session: requests.Session, bill_ids: list[str]):
    for bill_id in bill_ids:
        try:
            session.delete(endpoint(bill_id, '/admin'), headers=admin_headers(), timeout=15)
        except Exception:
            pass

session = requests.Session()
session.headers.update({'Origin': ORIGIN})
created: list[str] = []
health = session.get(f'{API}/healthz', timeout=20)
check(health.ok and health.json().get('storage') == 'd1-persistent', 'Worker 健康檢查確認資料存於 D1')
push_config = session.get(f'{API}/api/push-config', timeout=20).json()
check(push_config.get('enabled') is True and bool(push_config.get('applicationServerKey')), 'Worker 提供 Web Push 公開設定，私密金鑰不回傳')
check(session.get(endpoint('sample-dinner','/admin'), timeout=20).status_code == 401, '未認證管理請求遭拒')
check(session.options(endpoint('sample-dinner','/public'), headers={'Origin':ORIGIN,'Access-Control-Request-Method':'GET'}).status_code == 204, 'GitHub Pages 來源的 CORS 預檢成功')
check(session.options(endpoint('sample-dinner','/public'), headers={'Origin':'https://not-allowed.example','Access-Control-Request-Method':'GET'}).status_code == 403, '其他網站來源遭 CORS 拒絕')

main_id = 'trial-share-' + secrets.token_hex(4)
gate_id = 'trial-gate-' + secrets.token_hex(4)
unit_id = 'trial-unit-' + secrets.token_hex(4)
push_id = 'trial-push-' + secrets.token_hex(4)
created.extend([main_id, gate_id, unit_id, push_id])
main_body = create_bill(session, main_id)
create_bill(session, push_id)
public = session.get(endpoint(main_id,'/public'), timeout=20).json()
check(public['status'] == 'draft' and public['selections'] == {}, '公開帳單只顯示空白的共享名單')
check(all('expectedQty' not in item for item in public['items']), '朋友 API 不透露管理者填寫的已購數量')
check(not any(key in json.dumps(public) for key in ['pinRecord','ownerToken','ownerTokenHash','salt','hash']), '公開 API 不含 PIN/裝置 token/雜湊')

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'), headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
    ctx_a = browser.new_context(viewport={'width':320,'height':900}, device_scale_factor=1, is_mobile=True, has_touch=True)
    ctx_b = browser.new_context(viewport={'width':390,'height':900}, device_scale_factor=1, is_mobile=True, has_touch=True)
    a = ctx_a.new_page(); b = ctx_b.new_page()
    page_errors = []
    a.on('pageerror', lambda e: page_errors.append(f'A: {e}'))
    b.on('pageerror', lambda e: page_errors.append(f'B: {e}'))
    a.goto(bill_url(main_id), wait_until='domcontentloaded')
    b.goto(bill_url(main_id), wait_until='domcontentloaded')
    a.wait_for_selector('[data-select-friend="friend-a"]', timeout=15000)
    b.wait_for_selector('[data-select-friend="friend-a"]', timeout=15000)
    check(a.locator('[data-select-friend]').count() == 3 and b.locator('[data-select-friend]').count() == 3, '兩個獨立手機瀏覽器都開啟同一份名單')
    for page, width, label in [(a,320,'320px'),(b,390,'390px')]:
        metrics = page.evaluate('({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})')
        check(metrics['scroll'] <= metrics['client'], f'{label} 介面沒有水平溢位')

    # A first claims the name and sets a private 3-character edit code.
    a.locator('[data-select-friend="friend-a"]').click()
    a.locator('#submissionForm').wait_for(timeout=10000)
    a.locator('#editPin').fill('A1!')
    a.locator('[data-qty="coffee"]').fill('0')
    a.locator('#submitOwnBill').click()
    a.locator('[data-submission-saved="friend-a"]').wait_for(timeout=10000)
    check(True, '朋友 A 以 3 字元編輯碼首次提交')

    # B sees A's selection, but cannot edit A without their code.
    b.reload(wait_until='domcontentloaded')
    b.wait_for_selector('[data-shared-choice="friend-a"]', timeout=10000)
    check('已提交' in b.locator('[data-shared-choice="friend-a"]').inner_text(), '另一裝置讀到朋友 A 的提交狀態')
    b.locator('[data-select-friend="friend-a"]').click()
    b.locator('#pinGate').wait_for(timeout=10000)
    check(b.locator('[data-qty]').count() == 0, '未驗證時另一裝置沒有申報編輯欄')
    b.locator('#pinGate').fill('BAD')
    b.locator('#pinGateForm button[type=submit]').click()
    b.locator('#pinGateError:not(.hidden)').wait_for(timeout=10000)
    check(b.locator('[data-qty]').count() == 0, '錯誤編輯碼不能開啟朋友 A 的編輯')
    denied = post_friend(session, main_id, 'friend-a', {'pin':'BAD','quantities':{'coffee':2}})
    check(denied.status_code == 401, '錯誤 PIN 的修改 API 請求遭拒')
    claimed_b = post_friend(session, main_id, 'friend-b', {'pin':'B2!','quantities':{'coffee':0},'sharing':{'coffee':False}})
    check(claimed_b.ok, '朋友 B 首次自行設定編輯碼並認領自己的分帳')
    cross = post_friend(session, main_id, 'friend-b', {'pin':'A1!','quantities':{'coffee':2}})
    check(cross.status_code == 401, '朋友 A 的 PIN 不能修改已由 B 認領的分帳')

    # A can correct the entry on the second device; the first device sees it through polling.
    b.locator('#pinGate').fill('A1!')
    b.locator('#pinGateForm button[type=submit]').click()
    b.locator('[data-personal-view="friend-a"]').wait_for(timeout=10000)
    b.locator('[data-qty="coffee"]').fill('1')
    b.locator('#submitOwnBill').click()
    b.locator('[data-submission-saved="friend-a"]').wait_for(timeout=10000)
    a.wait_for_function("document.querySelector('[data-shared-choice=\\\"friend-a\\\"]')?.innerText.includes('咖啡（個人 1 杯）')", timeout=12000)
    check(True, '朋友 A 在第二裝置修正份量，第一裝置透過輪詢看到更新')

    # B and C both opt in to share the remaining purchased cup.
    for fid, pin, sharing in [('friend-b','B2!','coffee'),('friend-c','C3!','coffee')]:
        res = post_friend(session, main_id, fid, {'pin':pin,'quantities':{'coffee':0},'sharing':{sharing:True}})
        check(res.ok, f'{fid} 選擇參與剩餘份量共享')
    main_admin = session.get(endpoint(main_id,'/admin'), headers=admin_headers(), timeout=20).json()
    check(main_admin['readiness']['ready'] is True, '2 杯已完整認領：A 個人 1 杯、B/C 共享餘下 1 杯')

    # The dedicated management view is separate from the friend page and gated.
    manager_url = bill_url(main_id, manage=True)
    b.goto(manager_url, wait_until='domcontentloaded')
    b.locator('#adminLogin').wait_for(timeout=10000)
    check(b.locator('.summary-card').count() == 0, '管理頁未認證前不載入任何金額摘要')
    b.locator('#adminKeyInput').fill(KEY)
    b.locator('#adminLogin button[type=submit]').click()
    b.locator('#finalizeBill').wait_for(timeout=10000)
    check(not b.locator('#finalizeBill').is_disabled(), '份量完整認領後管理頁開放結算')
    b.locator('#finalizeBill').click()
    b.locator('.lock-note').wait_for(timeout=10000)
    check(True, '管理頁結算成功並鎖定申報')
    a.wait_for_selector('[data-personal-result="friend-a"]', timeout=12000)
    check(a.locator('.result-amount').inner_text().strip() == 'HK$10.00', '結算完成時已開啟的 A 頁面收到本人結果提示')

    amounts = {}
    for fid, pin in [('friend-a','A1!'),('friend-b','B2!'),('friend-c','C3!')]:
        result = session.post(endpoint(main_id,f'/friends/{fid}/access'), json={'pin':pin}, timeout=20)
        check(result.ok and result.json()['mode'] == 'result', f'{fid} 只可取得自己的結算結果')
        amounts[fid] = result.json()['amountCents']
    check(amounts == {'friend-a':1000,'friend-b':500,'friend-c':500}, '2 杯 × HK$10 的指定例為 HK$10／HK$5／HK$5')
    check(sum(amounts.values()) == 2000, '指定例逐仙守恆，沒有未分配金額')
    post_final = post_friend(session, main_id, 'friend-a', {'pin':'A1!','quantities':{'coffee':2}})
    check(post_final.status_code == 423, '結算後朋友修改遭鎖定')

    # Opt-in is user-initiated and the fake PushManager never contacts a push service.
    push_context = browser.new_context(viewport={'width':360,'height':900}, device_scale_factor=1, is_mobile=True, has_touch=True)
    push_context.add_init_script('''
      (() => {
        window.__notificationPromptCount = 0;
        class FakeNotification { static permission = 'default'; static async requestPermission() { window.__notificationPromptCount++; return 'granted'; } }
        Object.defineProperty(window, 'Notification', { configurable:true, value:FakeNotification });
        Object.defineProperty(window, 'PushManager', { configurable:true, value:function PushManager(){} });
        const endpoint = 'https://fcm.googleapis.com/fcm/send/synthetic-only';
        const makeSub = () => ({ endpoint, expirationTime:null, keys:{p256dh:'synthetic-public-key',auth:'synthetic-auth-key'}, toJSON(){ return {endpoint,expirationTime:null,keys:{p256dh:'synthetic-public-key',auth:'synthetic-auth-key'}}; }, async unsubscribe(){ window.__fakePushSub=null; return true; } });
        window.__fakePushSub = null;
        const registration = { pushManager:{ async getSubscription(){ return window.__fakePushSub; }, async subscribe(){ window.__fakePushSub=makeSub(); return window.__fakePushSub; } } };
        Object.defineProperty(navigator, 'serviceWorker', { configurable:true, value:{ async register(){ return registration; }, ready:Promise.resolve(registration) } });
      })();
    ''')
    push_page = push_context.new_page()
    push_page.goto(bill_url(push_id), wait_until='domcontentloaded')
    push_page.locator('[data-select-friend="friend-a"]').click()
    push_page.locator('#editPin').fill('P1!')
    push_page.locator('#submitOwnBill').click()
    push_page.locator('[data-submission-saved="friend-a"]').wait_for(timeout=10000)
    push_page.locator('#pushToggle').wait_for(timeout=10000)
    check(push_page.evaluate('window.__notificationPromptCount') == 0, '開啟帳單不會自動要求通知授權')
    push_page.locator('#pushToggle').click()
    push_page.get_by_role('button', name='停用此裝置通知').wait_for(timeout=10000)
    check(push_page.evaluate('window.__notificationPromptCount') == 1, '通知權限只在本人按下啟用按鈕後請求')
    push_text = push_page.locator('#pushStatus').inner_text()
    check('不會顯示姓名或金額' in push_text and 'Cue 聊天' in push_text, '通知說明清楚表示是 App 自己的通知且不含個人資料')
    push_page.locator('#pushToggle').click()
    push_page.get_by_role('button', name='開啟結算通知').wait_for(timeout=10000)
    check(push_page.evaluate('window.__fakePushSub === null'), '朋友可關閉並刪除本裝置通知訂閱')
    push_context.close()
    browser.close()

# Readiness gate: a remaining shared quantity with nobody opting in cannot finalize.
gate_body = create_bill(session, gate_id)
for fid, pin, sharing in [('friend-a','GA1',False),('friend-b','GB2',False),('friend-c','GC3',False)]:
    response = post_friend(session, gate_id, fid, {'pin':pin,'quantities':{'coffee':1 if fid == 'friend-a' else 0},'sharing':{'coffee':sharing}})
    check(response.ok, f'{fid} 虛構共享測試份量已提交')
gate_body['items'][0]['expectedQty'] = None
missing_shared = set_manager_bill(session, gate_id, gate_body)
check(missing_shared.ok, '管理者可暫存尚未確認實購數的共享項目')
gate_admin = session.get(endpoint(gate_id,'/admin'), headers=admin_headers(), timeout=20).json()
check(not gate_admin['readiness']['ready'] and gate_admin['readiness']['quantityMismatches'][0]['reason'] == 'expected_missing', '共享項目漏填實購數同樣阻止結算')
blocked = session.post(endpoint(gate_id,'/admin/finalize'), headers=admin_headers(), timeout=20)
check(blocked.status_code == 409, '共享項目缺少實購數時伺服器拒絕結算')
gate_body['items'][0]['expectedQty'] = 2
restored_shared = set_manager_bill(session, gate_id, gate_body)
check(restored_shared.ok, '管理者補回共享項目實購數後保存成功')
gate_admin = session.get(endpoint(gate_id,'/admin'), headers=admin_headers(), timeout=20).json()
check(not gate_admin['readiness']['ready'] and len(gate_admin['readiness']['participationPrompts']) == 1, '有餘量但無人共享時管理端標出柔和提醒並阻擋')
check(gate_admin['draftResults']['unallocatedCents'] == 1000 and sum(gate_admin['draftResults']['centsByFriend'].values()) == 1000, '未共享的餘額獨立列示，不自動加到朋友或管理者')
blocked = session.post(endpoint(gate_id,'/admin/finalize'), headers=admin_headers(), timeout=20)
check(blocked.status_code == 409, '無人共享餘量時伺服器拒絕結算')
res = post_friend(session, gate_id, 'friend-b', {'pin':'GB2','quantities':{'coffee':0},'sharing':{'coffee':True}})
check(res.ok, '朋友 B 參與共享後保存成功')
gate_admin = session.get(endpoint(gate_id,'/admin'), headers=admin_headers(), timeout=20).json()
check(gate_admin['readiness']['ready'] is True, '有人參與共享後結算條件恢復就緒')

# Per-unit coverage: missing purchased qty, under-claim, and over-claim all block finalization.
unit_body = create_bill(session, unit_id, mode='per_unit', expected=2)
for fid, pin, qty in [('friend-a','UA1',1),('friend-b','UB2',0),('friend-c','UC3',0)]:
    response = post_friend(session, unit_id, fid, {'pin':pin,'quantities':{'coffee':qty}})
    check(response.ok, f'{fid} 一般單價份量已提交')
unit_admin = session.get(endpoint(unit_id,'/admin'), headers=admin_headers(), timeout=20).json()
check(not unit_admin['readiness']['ready'] and unit_admin['readiness']['quantityMismatches'][0]['difference'] == -1, '有單位項目少報會阻擋結算')
blocked = session.post(endpoint(unit_id,'/admin/finalize'), headers=admin_headers(), timeout=20)
check(blocked.status_code == 409, '少報狀態由伺服器拒絕結算')
unit_body['items'][0]['expectedQty'] = None
missing = set_manager_bill(session, unit_id, unit_body)
check(missing.ok, '管理者可暫存尚未填實際已購數量的項目')
unit_admin = session.get(endpoint(unit_id,'/admin'), headers=admin_headers(), timeout=20).json()
check(not unit_admin['readiness']['ready'] and unit_admin['readiness']['quantityMismatches'][0]['reason'] == 'expected_missing', '漏填實際已購數量會阻擋結算')
unit_body['items'][0]['expectedQty'] = 2
restored = set_manager_bill(session, unit_id, unit_body)
check(restored.ok, '管理者補回實際已購數量後成功保存')
res = post_friend(session, unit_id, 'friend-b', {'pin':'UB2','quantities':{'coffee':2}})
check(res.ok, '本人更正份數保存成功')
unit_admin = session.get(endpoint(unit_id,'/admin'), headers=admin_headers(), timeout=20).json()
check(not unit_admin['readiness']['ready'] and unit_admin['readiness']['quantityMismatches'][0]['difference'] == 1, '有單位項目超報會阻擋結算')
res = post_friend(session, unit_id, 'friend-b', {'pin':'UB2','quantities':{'coffee':1}})
check(res.ok, '本人將份數修正為實際已購數量')
unit_admin = session.get(endpoint(unit_id,'/admin'), headers=admin_headers(), timeout=20).json()
check(unit_admin['readiness']['ready'] is True, '每人按單價申報且總數吻合時才允許結算')

# Durable read-after-write verification through a new client session.
new_session = requests.Session()
new_session.headers.update({'Origin':ORIGIN})
persisted = new_session.get(endpoint(main_id,'/public'), timeout=20).json()
check(persisted['status'] == 'final' and persisted['selections']['friend-a']['quantities']['coffee'] == 1, '新 HTTP session 仍能讀取 D1 中已結算帳單')

cleanup(session, created)
summary = {'site':SITE,'api':API,'checks':checks,'check_count':len(checks),'synthetic_bills_deleted':created,'page_errors':page_errors}
Path(__file__).with_name('verification-results.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
if page_errors:
    raise AssertionError('瀏覽器出現 JavaScript 錯誤: ' + '; '.join(page_errors))
print(json.dumps(summary, ensure_ascii=False, indent=2))
