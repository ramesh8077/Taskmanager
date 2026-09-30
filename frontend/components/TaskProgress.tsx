"use client";

import { useState } from "react";

export function TaskProgressCircle({
  progress,
  size = 48,
  label = "Task progress",
}: {
  progress: number;
  size?: number;
  label?: string;
}) {
  const value = Math.max(0, Math.min(100, Math.round(progress)));
  const stroke = Math.max(3, Math.round(size / 12));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = value === 100 ? "#059669" : value >= 60 ? "#4f46e5" : value >= 30 ? "#d97706" : "#64748b";
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center"
      role="img"
      aria-label={`${label}: ${value}%`}
      title={`${value}% complete`}
      style={{ width: size, height: size, color, fontSize: size * 0.22 }}
    >
      <svg aria-hidden="true" className="absolute inset-0" viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeOpacity=".16" strokeWidth={stroke} />
        <circle
          className="transition-[stroke-dashoffset] duration-300 motion-reduce:transition-none"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span aria-hidden="true" className="relative font-bold leading-none tracking-tight">{value}%</span>
    </span>
  );
}

export function TaskProgressControl({
  progress,
  status,
  disabled = false,
  onSave,
  size = 48,
}: {
  progress: number;
  status: string;
  disabled?: boolean;
  onSave: (progress: number) => Promise<boolean>;
  size?: number;
}) {
  const [draft, setDraft] = useState<{ value: number; baseline: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const value = draft?.baseline === progress ? draft.value : progress;
  const dirty = value !== progress;
  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      if (await onSave(value)) setDraft(null);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex items-center gap-3 min-w-[150px]" aria-label="Update task progress">
      <TaskProgressCircle progress={status === "Completed" ? 100 : progress} size={size} />
      <div className="min-w-0 flex-1">
        <input
          aria-label={`Task progress, ${value}%`}
          type="range"
          min={0}
          max={99}
          step={1}
          value={status === "Completed" ? 100 : value}
          disabled={disabled || saving || status === "Completed"}
          onChange={(event) => setDraft({ value: Number(event.target.value), baseline: progress })}
          className="w-full accent-indigo-600 disabled:opacity-60"
        />
        {status !== "Completed" && (
          <button
            type="button"
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
            disabled={disabled || saving || !dirty}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : dirty ? `Save ${value}%` : "Set progress"}
          </button>
        )}
      </div>
    </div>
  );
}
