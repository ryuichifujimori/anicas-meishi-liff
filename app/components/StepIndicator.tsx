"use client";

export function StepIndicator({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      {Array.from({ length: total }, (_, i) => i + 1).map((step) => {
        const active = step <= current;
        return (
          <span
            key={step}
            aria-label={`step ${step}`}
            className={`inline-block w-3 h-3 rounded-full transition-colors ${
              active ? "bg-[#2D6A4F]" : "bg-gray-300"
            }`}
          />
        );
      })}
    </div>
  );
}
