"use client";

type Props = {
  igHandle: string;
  igName: string;
  ownerName: string;
  onChange: (v: { ig_handle: string; ig_name: string; owner_name: string }) => void;
  onNext: () => void;
  onBack: () => void;
};

export function Step4Account({
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

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Instagram ハンドル <span className="text-red-500">*</span>
          </label>
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
              placeholder="kotetsutokotatsu"
              autoCapitalize="none"
              autoCorrect="off"
              className="flex-1 px-3 py-2 rounded-r border border-gray-300 focus:border-[#2D6A4F] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            IG NAME <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={igName}
            onChange={(e) => update("ig_name", e.target.value)}
            placeholder="例: YUKO"
            className="w-full px-3 py-2 rounded border border-gray-300 focus:border-[#2D6A4F] focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            オーナー名 <span className="text-gray-400 text-xs">（任意）</span>
          </label>
          <input
            type="text"
            value={ownerName}
            onChange={(e) => update("owner_name", e.target.value)}
            placeholder="例: 金野祐子"
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
