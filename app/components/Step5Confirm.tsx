"use client";

import type { FormData } from "@/lib/types";

type Props = {
  data: FormData;
  submitting: boolean;
  error: string | null;
  onSubmit: () => void;
  onBack: () => void;
};

export function Step5Confirm({ data, submitting, error, onSubmit, onBack }: Props) {
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-center">入力内容の確認</h2>

      {data.composedPhoto && (
        <div className="rounded-lg overflow-hidden border bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.composedPhoto} alt="preview" className="w-full h-auto" />
        </div>
      )}

      <dl className="bg-white rounded-lg border divide-y">
        <Row label="Instagram" value={`@${data.ig_handle}`} />
        <Row label="IG NAME" value={data.ig_name} />
        {data.owner_name && <Row label="オーナー名" value={data.owner_name} />}
        <Row
          label="ペット数"
          value={`${data.petCount}匹`}
        />
        {data.pets.slice(0, data.petCount).map((p, i) => (
          <Row
            key={i}
            label={`ペット${i + 1}`}
            value={`${p.name}（${p.breed}）`}
          />
        ))}
      </dl>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="flex-1 py-3 rounded-lg border border-gray-300 bg-white text-gray-700 font-semibold disabled:opacity-50"
        >
          戻る
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="flex-1 py-3 rounded-lg bg-[#2D6A4F] text-white font-semibold disabled:opacity-50"
        >
          {submitting ? "送信中…" : "送信する"}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center px-4 py-3 text-sm">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900 text-right break-all">{value}</dd>
    </div>
  );
}
