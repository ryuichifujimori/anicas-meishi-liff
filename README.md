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
3. Instagram ハンドル・IG NAME・オーナー名
4. 写真アップロード (HEIC 自動変換) ／ 複数匹は Canvas 合成エディタ／
   拡大率のバー／2匹以上なら「名前の間隔」のバー／名刺プレビュー
5. 確認 → GAS に POST → `liff.closeWindow()`

## QR コード生成

名刺の QR は実物名刺（c-cloud / qr.c-cloud.co.jp）と同じ `qr-code-styling`
ベースで **LIFF フロント側（ブラウザ）** で生成する。

- エンコード対象: `https://www.instagram.com/{ig_handle}`
- スタイル: `dotsOptions.type = "extra-rounded"` / `cornersSquareOptions.type = "dot"`
  （円形ファインダ枠）/ `cornersDotOptions.type = "dot"`（円形ファインダ中心）/
  黒一色・背景透明・`errorCorrectionLevel = "H"`
- 右下に `public/anicas_logo_br_square.png` を canvas 合成（中央固定の
  `image` オプションは使わない）。白い丸はファインダパターン（QRの目）と同じ
  7モジュール径で、「4つめの目」の位置に置く。3つのファインダパターン・
  タイミングパターン・形式情報には掛からない。
- **白い丸は動かさない・大きさも変えない。** `public/meishi-template.png` には
  元から anicas のマークが描かれていて、この丸がそれを覆っている。動かすと
  デザイン側のマークが下から出てきて**マークが2つ見える**（PR #9 で実際に起きた）。
- 丸の中のマークの大きさは `lib/meishi-layout.ts` の `LOGO_IN_DISC`。
  ロゴ画像の字面は円ではなく縦長なので、丸の **84.655%**（= 1 ÷ 1.18127）が
  はみ出さない最大。
- 生成ロジックは `lib/qr.ts`。プレビュー（`MeishiPreview`）と印刷用 PDF は
  **同一の data URL** を使うため完全一致する。
- `qr-code-styling` は DOM/canvas 依存のため GAS V8 では動かせない。QR 生成は
  フロントに一元化し、GAS 側の QuickChart 呼び出しは廃止する。

## 印刷用データ（PDF）の自動生成

送信時に、プレビューと同じ内容の **印刷所入稿用 PDF** をフロント側で生成して
ペイロードに載せる。イラレでの版下作成と飼い主確認のやり取りが不要になる。

- 用紙: **61 × 97 mm**（仕上がり 55 × 91 mm の一般的な名刺サイズ ＋ 塗り足し上下左右3mm）
- 色: RGB（CMYK 変換は試し刷り後に判断）
- 断裁位置は PDF の **TrimBox** に書き込み済み
- 中身の作り分け:

  | | PDF の中でのかたち |
  |---|---|
  | タレントが入力した文字（種類・名前・飼い主名・アカウント名） | 埋め込みフォントの**実テキスト**（選択・検索できる） |
  | QR | モジュールを**パス**として描画 |
  | テンプレート・リボン | 元の PNG をそのまま埋める（1046×1738 = **483dpi 相当**） |
  | anicas マーク | 500×500 の原本をそのまま埋める |
  | ペット写真 | 写真枠の大きさから逆算した画素数にリサンプル（**350dpi ちょうど**） |

  絵柄を輪郭にトレースするのは**やめている**。トレースは元画像の画素の階段を
  そのまま輪郭にしてしまい、肉球・Instagram の印・リボンの文字がかえって
  ガタつくため。元の PNG のままでも 483dpi あり、必要な 350dpi を上回る。

- 2匹以上のとき、ステップ4に「名前の間隔」のバーが出る。ペットどうしのすき間を
  **名前の行にも種類の行にも同じ物理量だけ**足し引きするので、名前とその種類は
  必ず一緒に動く（`petGap`）。既定値は全角スペース1文字と同じ 1em なので、
  バーを触らなければ従来どおりの仕上がり。
- **バーの可動域は固定値ではない**（`spreadLimits`）。入力された文字を実際に
  測って毎回決める。右端＝名前がカードの左右の余白に届くところ、左端＝どれかの
  行で隣り合う文字が接するところ。プレビューは canvas、入稿PDFは fontkit で
  測るので、片方だけ範囲が違うことはない。
- 種類の行は**折り返さない**。文字を置ける範囲に収まらなければ、収まるまで
  文字を小さくする（`fittedSize`、下限 4pt）。行の高さは design のまま保つので、
  下の名前の行は動かない。
- 中央寄せの行は、行頭・行末の字が持つサイドベアリングを差し引いてから中央に
  置く。和文の字は全角の枠のなかで左右の余白が字ごとに違うため、送り幅の中央を
  揃えると**見えている字の中央がずれる**（種類と名前で 0.45mm）。

生成は `lib/print.ts` の `generateMeishiPrintPdf()`。送信ボタンの中には書かず、
`lib/submit.ts` の `buildSubmitPayload()` 経由で呼ぶ独立した関数にしてある
（決済をフローに入れたあと、決済完了後に同じ呼び出しをすればよい）。

レイアウトの定義は `lib/meishi-layout.ts` の1箇所だけ。画面プレビュー
（`MeishiPreview`）と印刷用レンダラ（`lib/print.ts`）が同じ比率から描くので、
片方だけずれることがない。

実測値・比較画像・QR デコード結果:

- `docs/print-quality-verification.md` … 最新（絵柄の輪郭・中心・間隔バー・ロゴ径）
- `docs/print-vector-verification.md` … 文字の実テキスト化と QR のパス化
- `docs/print-pdf-verification.md` … PDF 生成そのものを入れたとき

## GAS への送信ペイロード

```json
{
  "ig_handle": "kotetsutokotatsu",
  "ig_name": "YUKO",
  "owner_name": "金野祐子",
  "pets": [{ "breed": "ポメラニアン", "name": "コテツ" }],
  "photo_base64": "data:image/png;base64,...",
  "print_base64": "data:application/pdf;base64,...",
  "name_spread": 0,
  "line_user_id": "Uxxxx"
}
```

- `photo_base64` … 合成済みのペット写真。作り直し・増刷のときに原本が要るので残す。
- `print_base64` … 印刷用 PDF（data URL）。`{ig_handle}_print.pdf` として保存する。
- `name_spread` … 「名前の間隔」のバーの値（−1〜+1、既定 0）。作り直しのときに
  同じ間隔で組み直せるように残す。GAS 側で使わないなら無視してよい。
- `qr_base64` は **廃止**。QR は `print_base64` の中に描かれているため、
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
