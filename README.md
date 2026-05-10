# anicas 名刺フォーム LIFF

ペットタレントが名刺注文時に写真・情報を提出する LIFF フォーム。

## 技術スタック

- Next.js (App Router, TypeScript)
- Tailwind CSS v4
- LIFF SDK (`@line/liff`)
- `heic2any` (HEIC → JPEG 変換)
- データ送信先: Google Apps Script WebApp

## セットアップ

```bash
npm install
cp .env.local.example .env.local
# .env.local を編集して以下を設定
#   NEXT_PUBLIC_LIFF_ID=...
#   NEXT_PUBLIC_GAS_URL=...
npm run dev
```

## フォームのステップ

1. ペット数選択 (1〜3 匹)
2. 各ペットの種類・名前
3. 写真アップロード (HEIC 自動変換) ／ 複数匹は Canvas 合成エディタ
4. Instagram ハンドル・IG NAME・オーナー名
5. 確認 → GAS に POST → `liff.closeWindow()`

## GAS への送信ペイロード

```json
{
  "ig_handle": "kotetsutokotatsu",
  "ig_name": "YUKO",
  "owner_name": "金野祐子",
  "pets": [{ "breed": "ポメラニアン", "name": "コテツ" }],
  "photo_base64": "data:image/png;base64,...",
  "line_user_id": "Uxxxx"
}
```

GAS は CORS ヘッダを返さないため、`fetch` は `mode: "no-cors"` で送信している
（POST 自体は到達するがレスポンスは opaque）。
