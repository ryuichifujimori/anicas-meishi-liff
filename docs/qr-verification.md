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

> `public/anicas_logo_br_square.png` は藤森さんが提供した本物の 500×500 透過 PNG
> （「a nicas」マーク）。位置・サイズ比率のロジックは素材非依存。

### ロゴ背面の白円

ロゴが QR のドットに直接重なって視認性が落ちるのを防ぐため、合成のレイヤー順を
**QR本体 → 白円(#FFFFFF 完全不透明) → ロゴ** とした（`lib/qr.ts`）。

- 白円の中心はロゴ中心と一致。直径 = ロゴ長辺 × `WHITE_CIRCLE_RATIO`(1.4)
- 縁は canvas の `arc` 塗りで antialias（ジャギーなし）
- 白円は QR データ領域の一部を隠すため、誤り訂正レベル H で復元できる大きさに留めた。
  当初 `LOGO_RATIO=0.2` × 円1.3（白円≒26%幅）ではデコード不可だったため、ロゴを
  `0.15` に縮小（白円 = 0.15 × 1.4 ≒ 21%幅）。本物ロゴ + 白円でも実デコード成功。
- 白円・ロゴはいずれも 3 つのファインダパターンに被らない（右下コーナーに配置）

## 2. 実デコード（実機読み取り相当）

生成された QR PNG（**白円 + ロゴ合成済み**・背景透明）を白背景に合成して `pyzbar`(zbar)
でデコードした結果:

```
入力: 生成 QR PNG（1000×1000, 右下に白円+本物ロゴ合成済み）
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
