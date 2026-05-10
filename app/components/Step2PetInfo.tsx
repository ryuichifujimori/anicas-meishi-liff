"use client";

import type { Pet } from "@/lib/types";

type Props = {
  pets: Pet[];
  onChange: (pets: Pet[]) => void;
  onNext: () => void;
  onBack: () => void;
};

export function Step2PetInfo({ pets, onChange, onNext, onBack }: Props) {
  const update = (i: number, key: keyof Pet, val: string) => {
    const next = pets.map((p, idx) => (idx === i ? { ...p, [key]: val } : p));
    onChange(next);
  };

  const allFilled = pets.every((p) => p.breed.trim() && p.name.trim());

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-center">ペット情報を入力</h2>

      <div className="space-y-5">
        {pets.map((pet, i) => (
          <div
            key={i}
            className="p-4 rounded-lg bg-white border border-gray-200 space-y-3"
          >
            <div className="font-semibold text-[#2D6A4F]">ペット {i + 1}</div>
            <div>
              <label className="block text-sm font-medium mb-1">種類</label>
              <input
                type="text"
                value={pet.breed}
                onChange={(e) => update(i, "breed", e.target.value)}
                placeholder="例: トイプードル"
                className="w-full px-3 py-2 rounded border border-gray-300 focus:border-[#2D6A4F] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">名前</label>
              <input
                type="text"
                value={pet.name}
                onChange={(e) => update(i, "name", e.target.value)}
                placeholder="例: ペコ"
                className="w-full px-3 py-2 rounded border border-gray-300 focus:border-[#2D6A4F] focus:outline-none"
              />
            </div>
          </div>
        ))}
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
          disabled={!allFilled}
          className="flex-1 py-3 rounded-lg bg-[#2D6A4F] text-white font-semibold disabled:opacity-50"
        >
          次へ
        </button>
      </div>
    </div>
  );
}
