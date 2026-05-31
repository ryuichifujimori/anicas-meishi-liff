# QR 生成の検証

c-cloud 実物名刺と同じ `qr-code-styling` スタイルへ QR 生成を移行し、ロゴ右下合成・
プレビュー/保存画像の一致・実機読み取り可否を **実コンポーネントの headless レンダリング**
と **実デコード** で検証した（PIL 等での見た目再現オーバーレイは検証根拠にしていない）。

## 1. 見た目一致（実レンダリング）

`app/components/MeishiPreview.tsx` を本番ビルドした Next アプリを Chrome
（puppeteer, headless）で実際にレンダリングし、フォームを Step1→Step4 まで操作して
プレビューに表示された QR `<img>`（= `lib/qr.ts` が生成し payload に載せる data URL
そのもの）を取得した。

- `docs/qr-comparison.png` … 実物名刺の QR（`public/sample-meishi.png` の右下を実測切り出し）
  と、生成 QR を並べた比較。両者とも **extra-rounded ドット / 円形ファインダ枠・中心 /
  黒一色 / 右下 anicas ロゴ** で一致。
- `docs/qr-card-render.png` … 名刺プレビュー全体の実レンダリング。QR が右下に配置され、
  ロゴが 3 つのファインダパターンに被っていないことを確認。

> ⚠️ `public/anicas_logo_br_square.png` は現状 **sample-meishi.png から抽出した低解像度の
> 仮素材**。藤森さんの本物 500×500 透過 PNG で差し替えてください（位置・サイズ比率の
> ロジックは素材非依存なのでそのまま使えます）。

## 2. 実デコード（実機読み取り相当）

生成された QR PNG（ロゴ合成済み・背景透明）を白背景に合成して `pyzbar`(zbar) で
デコードした結果:

```
入力: 生成 QR PNG（1000×1000, ロゴ右下合成済み）
pyzbar decode → "https://www.instagram.com/peco_channel"
```

タレントの Instagram プロフィール URL が正しくデコードされ、ロゴ合成後も
読み取り可能であることを確認した（errorCorrectionLevel = "H"）。

## 3. プレビュー = 保存画像の一致

`app/page.tsx` で `ig_handle` から生成した data URL（`data.qr_base64`）を、

- プレビュー: `MeishiPreview` の `qrSrc` に渡す
- 送信: `SubmitPayload.qr_base64` に載せる

の **両方で同一の文字列**を使う。GAS 側は受信した `qr_base64` をそのまま
`{ig_handle}_qr.png` として保存するため、プレビューと Drive 保存画像は完全一致する。
