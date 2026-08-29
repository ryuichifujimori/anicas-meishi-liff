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
- 生成ロジックは `lib/qr.ts`。プレビュー（`MeishiPreview`）と印刷用 PDF は
  **同一の data URL** を使うため完全一致する。
- `qr-code-styling` は DOM/canvas 依存のため GAS V8 では動かせない。QR 生成は
  フロントに一元化し、GAS 側の QuickChart 呼び出しは廃止する。

## 印刷用データ（PDF）の自動生成

送信時に、プレビューと同じ内容の **印刷所入稿用 PDF** をフロント側で生成して
ペイロードに載せる。イラレでの版下作成と飼い主確認のやり取りが不要になる。

- 用紙: **61 × 97 mm**（仕上がり 55 × 91 mm の一般的な名刺サイズ ＋ 塗り足し上下左右3mm）
- 中身: 全面に **840 × 1336 px = 350dpi 相当** の画像を1枚配置
- 色: RGB（CMYK 変換は試し刷り後に判断）
- 断裁位置は PDF の **TrimBox** に書き込み済み
- QR・ロゴ・リボン・写真・文字はすべて焼き込み済み

生成は `lib/print.ts` の `generateMeishiPrintPdf()`。送信ボタンの中には書かず、
`lib/submit.ts` の `buildSubmitPayload()` 経由で呼ぶ独立した関数にしてある
（決済をフローに入れたあと、決済完了後に同じ呼び出しをすればよい）。

レイアウトの定義は `lib/meishi-layout.ts` の1箇所だけ。画面プレビュー
（`MeishiPreview`）と印刷用レンダラ（`lib/print.ts`）が同じ比率から描くので、
片方だけずれることがない。

実測値・比較画像・QR デコード結果は `docs/print-pdf-verification.md`。

## GAS への送信ペイロード

```json
{
  "ig_handle": "kotetsutokotatsu",
  "ig_name": "YUKO",
  "owner_name": "金野祐子",
  "pets": [{ "breed": "ポメラニアン", "name": "コテツ" }],
  "photo_base64": "data:image/png;base64,...",
  "print_base64": "data:application/pdf;base64,...",
  "line_user_id": "Uxxxx"
}
```

- `photo_base64` … 合成済みのペット写真。作り直し・増刷のときに原本が要るので残す。
- `print_base64` … 印刷用 PDF（data URL）。`{ig_handle}_print.pdf` として保存する。
- `qr_base64` は **廃止**。QR は `print_base64` の中に焼き込まれているため、
  単体で送る必要がなくなった。

> **GAS WebApp 側の変更が必要**（本リポジトリには GAS ソースは含まれない）:
> 1. `doPost` で `print_base64` を取り出し、既存の base64→Drive 保存処理を流用して
>    `{ig_handle}_print.pdf` を保存する（MIME は `application/pdf`）。
> 2. `qr_base64` を受け取って `{ig_handle}_qr.png` を保存していた処理を削除する。
>    （旧来の QuickChart による QR 生成もすでに不要）
> 3. 既存の Drive フォルダ ID・スプレッドシート追記ロジックはそのまま流用。
> 4. **デプロイ→デプロイを管理→新バージョン** で再デプロイする（コード push だけでは
>    本番反映されない）。WebApp URL は変更しない。

GAS は CORS ヘッダを返さないため、`fetch` は `mode: "no-cors"` で送信している
（POST 自体は到達するがレスポンスは opaque）。
