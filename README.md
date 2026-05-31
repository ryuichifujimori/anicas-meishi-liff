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

## QR コード生成

名刺の QR は実物名刺（c-cloud / qr.c-cloud.co.jp）と同じ `qr-code-styling`
ベースで **LIFF フロント側（ブラウザ）** で生成する。

- エンコード対象: `https://www.instagram.com/{ig_handle}`
- スタイル: `dotsOptions.type = "extra-rounded"` / `cornersSquareOptions.type = "dot"`
  （円形ファインダ枠）/ `cornersDotOptions.type = "dot"`（円形ファインダ中心）/
  黒一色・背景透明・`errorCorrectionLevel = "H"`
- 右下に `public/anicas_logo_br_square.png` を canvas 合成（中央固定の
  `image` オプションは使わない）。ファインダパターンに被らない位置・サイズ。
- 生成ロジックは `lib/qr.ts`。プレビュー（`MeishiPreview`）と Drive 保存画像は
  **同一の data URL** を使うため完全一致する。
- `qr-code-styling` は DOM/canvas 依存のため GAS V8 では動かせない。QR 生成は
  フロントに一元化し、GAS 側の QuickChart 呼び出しは廃止する。

## GAS への送信ペイロード

```json
{
  "ig_handle": "kotetsutokotatsu",
  "ig_name": "YUKO",
  "owner_name": "金野祐子",
  "pets": [{ "breed": "ポメラニアン", "name": "コテツ" }],
  "photo_base64": "data:image/png;base64,...",
  "qr_base64": "data:image/png;base64,...",
  "line_user_id": "Uxxxx"
}
```

`qr_base64` はロゴ合成済みの QR PNG（data URL）。GAS 側は受信した `qr_base64` を
そのまま `{ig_handle}_qr.png` として Drive に保存するだけでよい（QuickChart 呼び出しは不要）。

> **GAS WebApp 側の変更が必要**（本リポジトリには GAS ソースは含まれない）:
> 1. `doPost` で `qr_base64` を取り出し、既存の base64→Drive 保存処理を流用して
>    `{ig_handle}_qr.png` を保存する。
> 2. 旧来の QuickChart で QR を生成していた処理を削除する。
> 3. 既存の Drive フォルダ ID・スプレッドシート追記ロジックはそのまま流用。
> 4. **デプロイ→デプロイを管理→新バージョン** で再デプロイする（コード push だけでは
>    本番反映されない）。WebApp URL は変更しない。

GAS は CORS ヘッダを返さないため、`fetch` は `mode: "no-cors"` で送信している
（POST 自体は到達するがレスポンスは opaque）。
