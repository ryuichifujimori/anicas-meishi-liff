"use client";

import { useEffect, useState } from "react";
import { StepIndicator } from "./components/StepIndicator";
import { Step1PetCount } from "./components/Step1PetCount";
import { Step2PetInfo } from "./components/Step2PetInfo";
import { Step3Photos } from "./components/Step3Photos";
import { Step4Account } from "./components/Step4Account";
import { Step5Confirm } from "./components/Step5Confirm";
import type { FormData, Pet, PetPhoto, PhotoTransform, SubmitPayload } from "@/lib/types";
import { closeLiffWindow, getLineUserId, initLiff } from "@/lib/liff";

const TOTAL_STEPS = 5;

const initialPet = (): Pet => ({ breed: "", name: "" });
const initialTransform = (): PhotoTransform => ({ cx: 0.5, cy: 0.5, scale: 1 });

const initialData: FormData = {
  petCount: 1,
  pets: [initialPet(), initialPet(), initialPet()],
  photos: [null, null, null],
  transforms: [initialTransform(), initialTransform(), initialTransform()],
  composedPhoto: null,
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

  const setPetCount = (n: 1 | 2 | 3) => setData((d) => ({ ...d, petCount: n }));
  const setPets = (pets: Pet[]) => setData((d) => ({ ...d, pets }));
  const setPhotos = (photos: (PetPhoto | null)[]) =>
    setData((d) => ({ ...d, photos }));
  const setTransforms = (transforms: PhotoTransform[]) =>
    setData((d) => ({ ...d, transforms }));
  const setComposed = (composedPhoto: string) =>
    setData((d) => ({ ...d, composedPhoto }));
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

    const payload: SubmitPayload = {
      ig_handle: data.ig_handle.trim(),
      ig_name: data.ig_name.trim(),
      owner_name: data.owner_name.trim(),
      pets: data.pets.slice(0, data.petCount).map((p) => ({
        breed: p.breed.trim(),
        name: p.name.trim(),
      })),
      photo_base64: data.composedPhoto,
      line_user_id: lineUserId,
    };

    setSubmitting(true);
    try {
      // GAS doPost typically does not echo CORS headers; mode:"no-cors" makes
      // the response opaque but the POST still reaches the server.
      await fetch(gasUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
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
          <Step3Photos
            petCount={data.petCount}
            photos={data.photos}
            transforms={data.transforms}
            onPhotosChange={setPhotos}
            onTransformsChange={setTransforms}
            onComposed={setComposed}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 4 && (
          <Step4Account
            igHandle={data.ig_handle}
            igName={data.ig_name}
            ownerName={data.owner_name}
            onChange={setAccount}
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
