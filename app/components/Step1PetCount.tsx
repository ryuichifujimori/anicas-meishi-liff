"use client";

type Props = {
  value: 1 | 2 | 3;
  onChange: (count: 1 | 2 | 3) => void;
  onNext: () => void;
};

export function Step1PetCount({ value, onChange, onNext }: Props) {
  const options: Array<1 | 2 | 3> = [1, 2, 3];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-center">ペットの数を選んでください</h2>
      <p className="text-sm text-gray-600 text-center">名刺に載せるペットの数を選択してください。</p>

      <div className="grid grid-cols-3 gap-3">
        {options.map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`py-6 rounded-lg border-2 text-lg font-semibold transition-colors ${
                selected
                  ? "border-[#2D6A4F] bg-[#2D6A4F] text-white"
                  : "border-gray-300 bg-white text-gray-700"
              }`}
            >
              {n}匹
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full py-3 rounded-lg bg-[#2D6A4F] text-white font-semibold disabled:opacity-50"
      >
        次へ
      </button>
    </div>
  );
}
