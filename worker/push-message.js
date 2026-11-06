export function resultNotification(url) {
  return {
    title: '分帳結果已準備好',
    body: '開啟分帳管家，查看你的個人結果。',
    url: String(url),
  };
}
