"use client";

import { useEffect, useState } from "react";
import { StepIndicator } from "./components/StepIndicator";
import { Step1PetCount } from "./components/Step1PetCount";
import { Step2PetInfo } from "./components/Step2PetInfo";
import { Step3Account } from "./components/Step3Account";
import { Step4Photos } from "./components/Step4Photos";
import { Step5Confirm } from "./components/Step5Confirm";
import type { FormData, Pet, PetPhoto } from "@/lib/types";
import { type FaceAdjust, untouchedCard } from "@/lib/card-adjust";
import { closeLiffWindow, getLineUserId, initLiff } from "@/lib/liff";
import { generateMeishiQr } from "@/lib/qr";
import { buildSubmitPayload, postMeishiOrder } from "@/lib/submit";

const TOTAL_STEPS = 5;

const initialPet = (): Pet => ({ breed: "", name: "" });

const initialData: FormData = {
  petCount: 1,
  pets: [initialPet(), initialPet(), initialPet()],
  photos: [null, null, null],
  composedPhoto: null,
  adjust: untouchedCard(), // every part exactly where the design put it
  qr: null,
  ig_handle: "",
  ig_name: "",
  owner_name: "",
};

export default function Page() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<FormData>(initialData);
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    initLiff().then(() => {
      setLineUserId(getLineUserId());
    });
  }, []);

  // Regenerate the styled QR whenever the Instagram handle changes. One
  // result feeds both the preview and the print PDF, so the QR on screen and
  // the QR on the card are guaranteed to be the same one.
  useEffect(() => {
    let cancelled = false;
    const handle = data.ig_handle.trim();
    if (!handle) {
      setData((d) => (d.qr === null ? d : { ...d, qr: null }));
      return;
    }
    generateMeishiQr(handle)
      .then((qr) => {
        if (!cancelled) setData((d) => ({ ...d, qr }));
      })
      .catch((e) => console.error("QR generation failed", e));
    return () => {
      cancelled = true;
    };
  }, [data.ig_handle]);

  const setPetCount = (n: 1 | 2 | 3) => setData((d) => ({ ...d, petCount: n }));
  const setPets = (pets: Pet[]) => setData((d) => ({ ...d, pets }));
  const setPhotos = (photos: (PetPhoto | null)[]) =>
    setData((d) => ({ ...d, photos }));
  const setComposed = (composedPhoto: string) =>
    setData((d) => ({ ...d, composedPhoto }));
  const setFrontAdjust = (front: FaceAdjust) =>
    setData((d) => ({ ...d, adjust: { ...d.adjust, front } }));
  const setAccount = (v: { ig_handle: string; ig_name: string; owner_name: string }) =>
    setData((d) => ({ ...d, ...v }));

  const next = () => setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  const submit = async () => {
    setSubmitError(null);

    const gasUrl = process.env.NEXT_PUBLIC_GAS_URL;
    if (!gasUrl) {
      setSubmitError("送信先URLが設定されていません。管理者にお問い合わせください。");
      return;
    }
    if (!data.composedPhoto) {
      setSubmitError("写真が準備できていません。");
      return;
    }

    setSubmitting(true);
    try {
      // Rendering the print-ready PDF lives in lib/submit + lib/print, not in
      // this handler, so the same two calls can be made from a payment
      // completion handler later. The existing "送信中…" state covers the
      // extra second the render takes; nothing new is shown to the talent.
      const payload = await buildSubmitPayload(data, lineUserId);
      await postMeishiOrder(gasUrl, payload);
      setSubmitted(true);
      setTimeout(() => closeLiffWindow(), 1500);
    } catch (e) {
      console.error(e);
      setSubmitError("送信に失敗しました。電波の良い場所で再度お試しください。");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <main className="mx-auto w-full max-w-[480px] min-h-screen p-6 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-[#2D6A4F] text-white flex items-center justify-center text-3xl mb-4">
          ✓
        </div>
        <h1 className="text-xl font-bold mb-2">送信完了しました</h1>
        <p className="text-sm text-gray-600">
          ご注文ありがとうございます。確認次第、ご連絡いたします。
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[480px] min-h-screen p-4 pb-12">
      <header className="text-center pt-2 pb-1">
        <h1 className="text-lg font-bold text-[#2D6A4F]">anicas 名刺フォーム</h1>
      </header>
      <StepIndicator current={step} total={TOTAL_STEPS} />

      <section className="mt-2">
        {step === 1 && (
          <Step1PetCount
            value={data.petCount}
            onChange={setPetCount}
            onNext={next}
          />
        )}
        {step === 2 && (
          <Step2PetInfo
            pets={data.pets.slice(0, data.petCount)}
            onChange={(pets) => {
              const merged = data.pets.slice();
              pets.forEach((p, i) => (merged[i] = p));
              setPets(merged);
            }}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 3 && (
          <Step3Account
            igHandle={data.ig_handle}
            igName={data.ig_name}
            ownerName={data.owner_name}
            onChange={setAccount}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 4 && (
          <Step4Photos
            petCount={data.petCount}
            pets={data.pets}
            photos={data.photos}
            qrSrc={data.qr?.png ?? null}
            igHandle={data.ig_handle}
            igName={data.ig_name}
            ownerName={data.owner_name}
            adjust={data.adjust.front}
            onPhotosChange={setPhotos}
            onComposed={setComposed}
            onAdjustChange={setFrontAdjust}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 5 && (
          <Step5Confirm
            data={data}
            submitting={submitting}
            error={submitError}
            onSubmit={submit}
            onBack={back}
          />
        )}
      </section>
    </main>
  );
}
