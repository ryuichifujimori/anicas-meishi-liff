"use client";

import type { FormData } from "@/lib/types";
import { MeishiPreview } from "./MeishiPreview";

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

      <MeishiPreview
        photos={data.photos}
        qrSrc={data.qr?.png ?? null}
        pets={data.pets}
        petCount={data.petCount}
        igHandle={data.ig_handle}
        igName={data.ig_name}
        ownerName={data.owner_name}
        adjust={data.adjust.front}
      />

      <dl className="bg-white rounded-lg border divide-y">
        <Row label="Instagram" value={`@${data.ig_handle}`} />
        <Row label="アカウント名" value={data.ig_name} />
        {data.owner_name && <Row label="オーナー名" value={data.owner_name} />}
        <Row label="ペット数" value={`${data.petCount}匹`} />
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
          className="flex-1 py-3 rounded-lg bg-[#2D6A4F] text-white font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {submitting && <Turning />}
          {submitting ? "送信中…" : "送信する"}
        </button>
      </div>
    </div>
  );
}

/**
 * The mark that turns while the order is being sent.
 *
 * Sending is not a wait for the network — most of it is the print-ready PDF
 * being drawn right here, on this phone, which takes the main thread for
 * seconds at a time. A mark moved by JavaScript would stop dead in the middle
 * of exactly the moment it exists for, so this one is a CSS `transform`
 * animation: the browser runs it on the compositor, and it keeps turning
 * while the page itself cannot answer.
 *
 * It says one thing — that something is happening — and it says it without a
 * word, so nothing new is added for the talent to read.
 */
function Turning() {
  return (
    <span
      aria-hidden
      data-turning=""
      className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"
    />
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
