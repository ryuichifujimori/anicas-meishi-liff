#!/usr/bin/env bash
# Rebuilds public/fonts/*.ttf — the fonts lib/print.ts embeds in the print PDF.
#
# The card's text goes into the PDF as text, so a real font has to travel with
# it; the browser's own UI font cannot be embedded. Noto Sans JP (OFL-1.1, see
# public/fonts/OFL.txt) is cut down to the cp932 repertoire — JIS X 0208 plus
# the NEC/IBM extensions, i.e. every kana and kanji a pet, breed or owner name
# is realistically written with, including the 﨑/髙 surname forms. Noto Emoji
# covers what is left over, and is only fetched when a card actually needs it.
#
# Plain TTF, not WOFF/WOFF2: WOFF2's glyf transform leaves fontkit unable to
# subset at all, and WOFF's per-table deflate has to be undone in JavaScript
# first, which costs seconds on a phone. The file compresses on the wire
# anyway, and pdf-lib subsets again on the way into each PDF, so a finished
# card carries only the glyphs it uses.
#
# Requires: python3 -m pip install fonttools brotli
set -euo pipefail
cd "$(dirname "$0")/.."
out=public/fonts
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

python3 - "$work" <<'CHARSET'
import sys, pathlib
work = pathlib.Path(sys.argv[1])
chars = {chr(c) for c in range(0x20, 0x7F)}
for cp in range(0x20, 0x10000):
    try:
        chr(cp).encode("cp932")
    except Exception:
        continue
    chars.add(chr(cp))
chars.update("★☆♪♡♥→←↑↓〜～　【】〈〉《》「」『』（）〔〕・…‥※＆＠＃")
chars.discard("\x7f")
(work / "charset.txt").write_text("".join(sorted(chars)), encoding="utf-8")
# Emoji and pictograph blocks an Instagram display name may use.
ranges = [(0x2190,0x21FF),(0x2300,0x23FF),(0x2460,0x24FF),(0x25A0,0x27BF),(0x2900,0x297F),
          (0x2B00,0x2BFF),(0x1F000,0x1F0FF),(0x1F100,0x1F1FF),(0x1F200,0x1F2FF),
          (0x1F300,0x1F5FF),(0x1F600,0x1F64F),(0x1F650,0x1F67F),(0x1F680,0x1F6FF),
          (0x1F700,0x1F77F),(0x1F900,0x1F9FF),(0x1FA70,0x1FAFF),(0xFE0F,0xFE0F),(0x20E3,0x20E3)]
(work / "emoji.txt").write_text(",".join(f"U+{a:X}-{b:X}" for a, b in ranges))
CHARSET

css() {
  curl -sS -H "User-Agent: Mozilla/5.0" \
    "https://fonts.googleapis.com/css2?family=$1&display=swap" |
    grep -o 'https://[^)]*\.ttf' | head -1
}

# Glyph outlines are padded to a 4-byte boundary on the way out. pdf-lib
# re-subsets the font in the browser through fontkit, whose subsetter writes a
# short-format `loca` — offsets stored halved — without padding anything
# itself, so a glyph of odd length there truncates that glyph and every one
# after it, and the card prints with characters silently missing. Even glyph
# lengths keep those halved offsets exact. Costs ~11 KB per font.
subset() {
  pyftsubset "$1" "$2" --output-file="$3" \
    --layout-features='' --drop-tables+=GSUB,GPOS,GDEF --no-hinting
  python3 - "$3" <<'PAD'
import sys
from fontTools.ttLib import TTFont
font = TTFont(sys.argv[1])
font["glyf"].padding = 4
font.save(sys.argv[1])
PAD
}

mkdir -p "$out"
for weight in 400 500 700; do
  curl -sS -o "$work/jp-$weight.ttf" "$(css "Noto+Sans+JP:wght@$weight")"
  subset "$work/jp-$weight.ttf" "--text-file=$work/charset.txt" "$out/NotoSansJP-$weight.ttf"
done
curl -sS -o "$work/emoji.ttf" "$(css 'Noto+Emoji:wght@400')"
subset "$work/emoji.ttf" "--unicodes-file=$work/emoji.txt" "$out/NotoEmoji-400.ttf"
curl -sS -o "$out/OFL.txt" https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/LICENSE
ls -l "$out"
