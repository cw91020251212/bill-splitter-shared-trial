# 分帳管家｜共用試用版

這是與正式版分開的手機優先試用版。朋友可在不同裝置打開同一連結，查看大家已提交的項目和份量，只能在本人驗證後修改自己的申報。前端與 API 由獨立 Cloudflare Worker 同源提供，帳單存於專用 Cloudflare D1，**不是 localStorage 或記憶體暫存**。

> 公開 source repository：`https://github.com/cw91020251212/bill-splitter-shared-trial`。本試用版與 `bill-splitter-ai` 正式網站分開；只含虛構示範資料，沒有收據上載、付款或卡號處理功能。它不會發 WhatsApp 或 Cue 聊天訊息。

## 試用網址

- 朋友填寫頁：<https://bill-splitter-shared-trial.cw9102025.workers.dev/?bill=sample-dinner>
- 管理者專用頁：<https://bill-splitter-shared-trial.cw9102025.workers.dev/?manage=1&bill=sample-dinner>

朋友頁不提供管理頁按鈕；管理 API 另須 Worker secret 的 bearer key 驗證。管理 key 只設定在 Cloudflare Worker secret，沒有放進 GitHub。請勿把管理密鑰貼到朋友連結或公開 repo。GitHub Pages 不屬於這個試用版的必要依賴。

## 分帳規則

- 無單位項目：整項輸入金額由有選擇的朋友平均分；餘分以名單次序分配。
- 有單位、按個人數量計：每人只按自己的申報數量乘單價。
- 有單位、共享餘量：個人申報先按單價計；實際購買量扣除個人申報後，剩餘份量只由選擇共享的人平均分。
- 全員提交後，實際已購數量仍須完全認領。缺少已購數量、少報、超報或有餘量但無人共享都會阻止結算；任何差額不會轉給管理者或其他朋友。
- 結算由伺服器重新核對並使用條件更新；並發寫入相撞會回覆衝突，不以舊資料靜默覆蓋。

## 編輯權限和資料

首次提交可選擇設定自己的三字元編輯碼；不設定時，回傳的隨機裝置 token 只在原瀏覽器本機保存。PIN 使用加鹽 PBKDF2 雜湊，原 PIN 和裝置 token 不回傳到公開 API；錯誤 PIN 次數在 D1 跨 Worker 保存並限速。資料透過同源 HTTPS Worker 和專用 D1 傳送與保存。

這是可供小圈子試用的早期版本，不適合存放敏感個人或付款資料。分享連結可讀取朋友名單和已提交選項；未被首次提交佔用的朋友名稱尚未完成身份驗證，請不要把連結公開散播。三字元碼只用作熟人分帳編輯保護，並非強登入。

## 結算手機通知

結算通知是**分帳網站自己的 Web Push**，不是 Cue 聊天訊息，亦不經 WhatsApp。每位已提交申報的朋友可在自己的儲存確認卡自行按「開啟結算通知」，授權後可在同一位置停用；每份帳單每位朋友只保留一個裝置訂閱，新裝置會取代舊裝置。通知文字固定為「分帳結果已準備好」，不含金額、姓名或項目；點擊只會打開該帳單頁，由朋友自行選擇姓名並驗證後查看本人結果。

通知需要 HTTPS、支援 Web Push 的瀏覽器、用戶主動允許通知，以及伺服器端 VAPID key。iPhone/iPad 要先把網站加入主畫面，並使用 iOS/iPadOS 16.4 或更新版本；一般 Safari 分頁不提供主畫面 Web App 推送。瀏覽器推送服務無法送達、裝置停用通知或系統省電限制時，不保證即時收到；帳單頁仍會顯示結果。

## 本地執行

需 Node.js、Wrangler、Cloudflare D1 綁定及 Worker secrets。設定 `wrangler.toml` 中的 D1 ID，執行 migration；用 `wrangler secret put ADMIN_KEY` 設定管理密鑰，並在正式部署前用 `npm run generate:vapid` 產生 VAPID key pair，再以 `wrangler secret put VAPID_PRIVATE_KEY` 設定私密 key；公開 VAPID key 放在 `VAPID_PUBLIC_KEY` 變數。之後 `npm run dev` 會先把 `public/` 的公開檔案嵌入 Worker，並由同一個 Worker 提供前端及 API。

`npm run test:webpush` 只在本機生成加密 payload、不連接 push service；`npm run test:e2e` 需本機 Worker、測試用 Admin key 與本地 D1。`npm run build:worker-assets` 可單獨重建 Worker 內嵌的公開前端檔案。
