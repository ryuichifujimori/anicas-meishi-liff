"use client";

type Props = {
  igHandle: string;
  igName: string;
  ownerName: string;
  onChange: (v: { ig_handle: string; ig_name: string; owner_name: string }) => void;
  onNext: () => void;
  onBack: () => void;
};

export function Step3Account({
  igHandle,
  igName,
  ownerName,
  onChange,
  onNext,
  onBack,
}: Props) {
  const update = (key: "ig_handle" | "ig_name" | "owner_name", val: string) => {
    onChange({
      ig_handle: key === "ig_handle" ? val : igHandle,
      ig_name: key === "ig_name" ? val : igName,
      owner_name: key === "owner_name" ? val : ownerName,
    });
  };

  const valid = igHandle.trim().length > 0 && igName.trim().length > 0;

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-center">アカウント情報</h2>

      <SampleGuide />

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Instagram ハンドル <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-gray-500 mb-2">
            名刺に載せるInstagramの情報をご記入ください
          </p>
          <div className="flex items-center">
            <span className="px-3 py-2 bg-gray-100 border border-r-0 border-gray-300 rounded-l text-gray-500">
              @
            </span>
            <input
              type="text"
              value={igHandle}
              onChange={(e) =>
                update("ig_handle", e.target.value.replace(/^@+/, ""))
              }
              placeholder="peco_channel"
              autoCapitalize="none"
              autoCorrect="off"
              className="flex-1 px-3 py-2 rounded-r border border-gray-300 focus:border-[#2D6A4F] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Instagramのアカウント名 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={igName}
            onChange={(e) => update("ig_name", e.target.value)}
            placeholder="例: ペコ★トイプードル"
            className="w-full px-3 py-2 rounded border border-gray-300 focus:border-[#2D6A4F] focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            オーナー名 <span className="text-gray-400 text-xs">（任意）</span>
          </label>
          <p className="text-xs text-gray-500 mb-2">
            名刺のowner表記を非表示にしたい場合は空欄でOK
          </p>
          <input
            type="text"
            value={ownerName}
            onChange={(e) => update("owner_name", e.target.value)}
            placeholder="例: 鈴木太郎"
            className="w-full px-3 py-2 rounded border border-gray-300 focus:border-[#2D6A4F] focus:outline-none"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-3 rounded-lg border border-gray-300 bg-white text-gray-700 font-semibold"
        >
          戻る
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!valid}
          className="flex-1 py-3 rounded-lg bg-[#2D6A4F] text-white font-semibold disabled:opacity-50"
        >
          次へ
        </button>
      </div>
    </div>
  );
}

/**
 * Side-by-side visual guide showing how the user's Instagram handle and
 * display name map onto the printed business card.
 *   ① = Instagram handle (peco_channel → @peco_channel on the card)
 *   ② = Instagram display name (ペコ★トイプードル on both)
 */
function SampleGuide() {
  return (
    <section className="space-y-2">
      <p className="text-xs text-gray-500 text-center">
        ↓ 入力した情報は名刺にこのように反映されます
      </p>
      <div className="grid grid-cols-1 gap-3 justify-items-center">
        <figure className="w-full max-w-[300px]">
          <div
            className="relative rounded-lg border border-gray-200 overflow-hidden bg-white"
            style={{ containerType: "inline-size" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/sample-instagram.png"
              alt="Instagram プロフィール例"
              className="block w-full h-auto"
            />
            <Marker n={1} top="6%" left="14%" />
            <Marker n={2} top="23%" left="28%" />
          </div>
          <figcaption className="text-[10px] text-gray-500 mt-1 text-center">
            Instagram プロフィール
          </figcaption>
        </figure>

        <figure className="w-full max-w-[220px]">
          <div
            className="relative rounded-lg border border-gray-200 overflow-hidden bg-white"
            style={{ containerType: "inline-size" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/sample-meishi.png"
              alt="完成名刺の例"
              className="block w-full h-auto"
            />
            <Marker n={2} top="83%" left="16%" />
            <Marker n={1} top="87%" left="16%" />
          </div>
          <figcaption className="text-[10px] text-gray-500 mt-1 text-center">
            完成名刺
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

function Marker({
  n,
  top,
  left,
}: {
  n: 1 | 2;
  top: string;
  left: string;
}) {
  return (
    <span
      aria-hidden
      className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full bg-emerald-700 text-white font-bold ring-2 ring-white shadow"
      style={{
        top,
        left,
        width: "8cqw",
        height: "8cqw",
        fontSize: "4.2cqw",
        lineHeight: 1,
      }}
    >
      {n}
    </span>
  );
}
