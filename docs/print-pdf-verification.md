# 印刷用PDF生成の検証

LIFF のプレビューと同じ内容を、そのまま印刷所に入稿できる PDF として自動生成し、
送信ペイロードに載せる改修の検証記録。

検証は **本番ビルドした実アプリを headless Chromium で実際に操作し**、送信ボタンを
押して飛んだ POST を受け取り、その中の `print_base64` を実測している。
見た目を別スクリプトで真似て比べる方法は使っていない。

```
next build → next start (:4598)
  ↓ Playwright で Step1〜Step5 を実操作（写真アップロード含む）→「送信する」
GAS の代わりに立てたローカルサーバ (:4599) が POST body をそのまま保存
  ↓
payload.print_base64 を base64 デコード → PDF を PyMuPDF / zxing-cpp で実測
```

`public/sample-meishi.png` の写真枠を切り出したものをアップロード写真として使い、
文言も実物名刺と同じ（トイプードル／ペコ／鈴木太郎／ペコ★トイプードル／
@peco_channel）にそろえて、実物と直接比較できるようにしている。

## 1. 送信ペイロード（実際に飛んだ POST）

```
keys: ['ig_handle', 'ig_name', 'line_user_id', 'owner_name', 'pets',
       'photo_base64', 'print_base64']

  photo_base64   data:image/png;base64          1,417,622 bytes
  print_base64   data:application/pdf;base64      716,501 bytes
  qr_base64      -> 削除済み（QRは印刷用PDFの中に焼き込まれている）
  JSON total     : 2,845,758 bytes (2.71 MB)
```

送るもの 3 つ → 2 つ、Drive に保存されるファイル 3 つ → 2 つ。

送信ボタンを押してから「送信完了しました」までは **832 ms**（3匹の場合 789 ms）。
その間に出るのは既存の「送信中…」表示のみで、画面には何も足していない。

## 2. PDF 実測（PyMuPDF）

```
pages: 1   size: 716,501 bytes
  MediaBox   61.000 x  97.000 mm   (172.913 x 274.961 pt)   origin (0.000, 0.000) mm
  TrimBox    55.000 x  91.000 mm   (155.906 x 257.953 pt)   origin (3.000, 3.000) mm
  BleedBox   61.000 x  97.000 mm   (172.913 x 274.961 pt)   origin (0.000, 0.000) mm

  embedded image: 840 x 1336 px, png, 8 bpc, 717,597 bytes
    placed over : 61.000 x 97.000 mm
    effective   : 349.77 x 349.84 dpi
```

- **受入基準1（用紙 97×61mm）**: MediaBox = 61 × 97 mm。名刺が縦向きのデザインなので
  「幅61mm × 高さ97mm」の縦長ページ。✅
- **受入基準2（1336×840px 相当 / 350dpi）**: 埋め込み画像は 840 × 1336 px、
  実効 349.8 dpi。✅
  （`floor(61 × 350 ÷ 25.4) = 840`, `floor(97 × 350 ÷ 25.4) = 1336`。
  指定どおりの画素数にそろえた結果、実効解像度が 350.0 ではなく 349.8 dpi になる）
- 仕上がり断裁位置は **TrimBox** として PDF に書き込んである（`docs/print-pdf-page.png`
  の赤線）。印刷所が断裁位置を判断できる。
- 画像は PNG（可逆）。QR のモジュールと文字を劣化させないため。この内容だと
  0.68 MB で収まっており、JPEG に落とす必要はなかった。

## 3. レイアウト一致（実測）

生成 PDF を断裁位置（TrimBox）で切り出した 55 × 91 mm のカードと、
① 画面プレビューの実レンダリング、② 実物名刺 `public/sample-meishi.png` の
ランドマーク位置を比較した。位置はカードに対する比率で取り、mm に換算している。

### 3-a. 生成PDF vs 実物名刺 `public/sample-meishi.png`

| ランドマーク | 最大ズレ |
|---|---|
| 写真枠（photo） | **0.09 mm** |
| リボン（ribbon） | **0.17 mm** |
| Instagram アイコン | **0.25 mm** |
| QR | **0.23 mm** |

図版要素はすべて **0.25 mm 以内**。

文字ブロックは縦位置が一致（ペット名ブロック上端 +0.01 mm、IG テキスト上端
+0.05 mm / 下端 +0.16 mm）。左右の広がりだけ 1.5〜2.4 mm ずれるが、これは実物名刺が
Illustrator で別の書体で組まれているためで、配置ではなく書体差。

### 3-b. 生成PDF vs 画面プレビュー（同一ブラウザでの実レンダリング）

**文字を含む全ランドマークで最大 0.32 mm**（= 350 dpi で約 4 px）。

```
photo    left/top/right/bottom   +0.01 / -0.12 / +0.01 / +0.01 mm
ribbon   left/top/right/bottom   -0.01 / +0.00 / -0.02 / -0.02 mm
pet_text left/top/right/bottom   -0.07 / +0.13 / +0.10 / +0.16 mm
ig_icon  left/top/right/bottom   +0.01 / +0.24 / +0.01 / +0.25 mm
ig_text  left/top/right/bottom   +0.06 / +0.27 / +0.32 / +0.28 mm
qr       left/top/right/bottom   -0.07 / +0.18 / +0.03 / +0.29 mm
```

**受入基準3（PDFの見た目が画面プレビューと一致し、実物と同じ配置）** ✅

比較画像:

- `docs/print-pdf-comparison.png` … ①画面プレビュー / ②生成PDF（断裁後） / ③実物名刺
- `docs/print-pdf-page.png` … PDF 1ページ目全体（61 × 97 mm）と断裁位置（赤線）
- `docs/print-pdf-comparison-3pets.png` … 3匹の場合。名前の折り返し位置
  （「ペコ & コテツ & こた / つ」）まで画面と一致する

## 4. QR の実デコード

生成 PDF を画像化して zxing-cpp でデコードした結果:

```
PDF を  350 dpi で画像化 (841x1337) -> 'https://www.instagram.com/peco_channel'
PDF を  300 dpi で画像化 (721x1146) -> 'https://www.instagram.com/peco_channel'
PDF を  200 dpi で画像化 (481x764)  -> 'https://www.instagram.com/peco_channel'
PDF を  150 dpi で画像化 (361x573)  -> 'https://www.instagram.com/peco_channel'

スマホ撮影シミュレーション（縮小＋ぼかし＋ノイズ）:
  カード幅 1000px / blur 0.6 / noise σ3 -> 'https://www.instagram.com/peco_channel'
  カード幅  800px / blur 0.8 / noise σ4 -> 'https://www.instagram.com/peco_channel'
  カード幅  600px / blur 1.0 / noise σ5 -> 'https://www.instagram.com/peco_channel'
  カード幅  500px / blur 1.2 / noise σ6 -> 'https://www.instagram.com/peco_channel'

対照: 実物名刺 public/sample-meishi.png -> 'https://www.instagram.com/peco_channel'
```

3匹版も `https://www.instagram.com/kotetsutokotatsu` を正しく返した。

**受入基準4（QRがPDF内に含まれ、印刷相当の解像度で読み取り可能）** ✅

> OpenCV の `QRCodeDetector` はこの QR をデコードできないが、**実物名刺
> `public/sample-meishi.png` でも同じくデコードできない**（検出はするが空文字を返す）。
> c-cloud 風の extra-rounded ドット／円形ファインダに OpenCV の実装が対応していない
> だけで、生成物側の問題ではない。実機のスキャナに近い zxing-cpp では両方とも通る。

## 5. レイアウト定義の一元化

`lib/meishi-layout.ts` が唯一の定義。位置・サイズはすべて **カードに対する比率**
（px でも % でも cqw でもない）で持ち、

- `app/components/MeishiPreview.tsx` … `pct()` / `cqw()` で CSS に変換して画面に描く
- `lib/print.ts` … 同じ比率をデバイスピクセルに変換して 350 dpi で描く
- `app/components/PhotoComposer.tsx` … 写真枠の縦横比 `PHOTO_SLOT_ASPECT` を
  そこから導出（合成キャンバスの高さを直書きしない）

書体スタックも二重に持たない。`lib/print.ts` は `getComputedStyle(document.body)`
から実際に効いているフォントスタックを読み取って canvas に渡すので、
`app/globals.css` の 1 箇所だけが定義になる。

数値の重複がないことの確認:

```
$ grep -nE "0\.(029|471|845|265|075|076|033|045|038|034)|1046|1738" \
    app/components/*.tsx lib/*.ts | grep -v meishi-layout.ts
lib/print.ts:227:            (コメント文のみ)
```

**受入基準5（レイアウトの定義が1箇所）** ✅

## 6. 写真の解像度

`lib/image.ts` の上限を最長辺 1200px → **2000px** に変更。実フォームに 3000px の
写真をアップロードして、正規化後のサイズを DOM から実測:

```
[photo-cap] source 3000px wide -> normalised 2000 x 1740 px
```

## 7. 塗り足しの作り方

仕上がり 55 × 91 mm を 61 × 97 mm ページの中央に置き、周囲 3 mm が塗り足し。

テンプレート画像の縦横比（1046 : 1738）は 55 : 91 よりわずかに縦長なので、
**縦横比を保ったまま仕上がり枠を覆うように拡大**している（歪ませない）。
はみ出す約 0.19 mm は上下の塗り足しに収まる。左右の塗り足しはテンプレートの地色
と同じ白で塗る。地が白いデザインなので、断裁位置が多少ずれても白のまま続く。
