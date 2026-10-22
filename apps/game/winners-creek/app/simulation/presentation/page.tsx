"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StepIndicator } from "@/components/simulation/step-indicator";
import { UploadDropzone } from "@/components/simulation/upload-dropzone";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  PRESENTATION_TYPES,
  AUDIENCES,
  DURATION_PRESETS,
  EVALUATION_MODES,
  type EvaluationMode,
} from "@/lib/domain/types";
import { ChevronLeft, ChevronRight, AlertTriangle } from "@/components/ui/icons";

const STEPS = ["Setup", "Upload", "Review"];

export default function PresentationSetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [title, setTitle] = useState("");
  const [presentationType, setPresentationType] = useState<string>(PRESENTATION_TYPES[0]);
  const [audience, setAudience] = useState<string>(AUDIENCES[0]);
  const [durationSeconds, setDurationSeconds] = useState<number>(300);
  const [customMinutes, setCustomMinutes] = useState<string>("");
  const [evaluationMode, setEvaluationMode] = useState<EvaluationMode>("practice");

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function validateFile(f: File): string | null {
    const ext = f.name.toLowerCase().split(".").pop();
    if (ext !== "pdf" && ext !== "pptx") return "Please upload a .pdf or .pptx file.";
    if (f.size === 0) return "That file is empty.";
    if (f.size > 50 * 1024 * 1024) return "File is larger than the 50MB limit.";
    return null;
  }

  function handleFileSelected(f: File) {
    const err = validateFile(f);
    setFileError(err);
    setFile(f);
  }

  const canProceedStep0 = title.trim().length > 0 && (durationSeconds > 0 || Number(customMinutes) > 0);
  const canProceedStep1 = Boolean(file) && !fileError;

  function submit() {
    if (!file) return;
    setUploading(true);
    setSubmitError(null);

    const finalDuration = customMinutes ? Number(customMinutes) * 60 : durationSeconds;
    const form = new FormData();
    form.set("title", title.trim());
    form.set("presentationType", presentationType);
    form.set("audience", audience);
    form.set("targetDurationSeconds", String(finalDuration));
    form.set("evaluationMode", evaluationMode);
    form.set("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/simulation/presentation");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          router.push(`/simulation/presentation/${data.sessionId}/prepare`);
        } catch {
          setSubmitError("Unexpected response from the server. Please try again.");
        }
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          setSubmitError(data.error ?? "Upload failed. Please try again.");
        } catch {
          setSubmitError("Upload failed. Please try again.");
        }
      }
    };
    xhr.onerror = () => {
      setUploading(false);
      setSubmitError("Network error during upload. Check your connection and try again.");
    };
    xhr.send(form);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 pb-16 pt-4">
      <div className="flex flex-col gap-4">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-tertiary">
          Presentation Simulator
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-primary">Set up your session</h1>
        <StepIndicator steps={STEPS} current={step} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-6 p-6">
          {step === 0 ? (
            <>
              <Field label="Presentation title">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Q3 Product Review"
                  className="h-10 rounded-[var(--radius-sm)] border border-border-default bg-surface-0 px-3 text-sm text-ink-primary outline-none focus-visible:border-accent-500"
                />
              </Field>

              <Field label="Presentation type">
                <SelectPills options={[...PRESENTATION_TYPES]} value={presentationType} onChange={setPresentationType} />
              </Field>

              <Field label="Audience">
                <SelectPills options={[...AUDIENCES]} value={audience} onChange={setAudience} />
              </Field>

              <Field label="Duration">
                <div className="flex flex-wrap gap-2">
                  {DURATION_PRESETS.map((d) => (
                    <button
                      key={d.seconds}
                      type="button"
                      onClick={() => {
                        setDurationSeconds(d.seconds);
                        setCustomMinutes("");
                      }}
                      className={pillClass(durationSeconds === d.seconds && !customMinutes)}
                    >
                      {d.label}
                    </button>
                  ))}
                  <input
                    type="number"
                    min={1}
                    placeholder="Custom (min)"
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(e.target.value)}
                    className="h-9 w-32 rounded-full border border-border-default bg-surface-0 px-3 text-sm text-ink-primary outline-none focus-visible:border-accent-500"
                  />
                </div>
              </Field>

              <Field label="Evaluation mode">
                <div className="flex flex-col gap-2">
                  {EVALUATION_MODES.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setEvaluationMode(m.value)}
                      className={`flex flex-col items-start gap-0.5 rounded-[var(--radius-md)] border p-3 text-left transition-colors ${
                        evaluationMode === m.value
                          ? "border-accent-500 bg-accent-50"
                          : "border-border-default hover:border-border-strong"
                      }`}
                    >
                      <span className="text-sm font-medium text-ink-primary">{m.label}</span>
                      <span className="text-xs text-ink-secondary">{m.description}</span>
                    </button>
                  ))}
                </div>
              </Field>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <Field label="Upload your slides">
                <UploadDropzone file={file} onFileSelected={handleFileSelected} onClear={() => setFile(null)} error={fileError} />
              </Field>
              <p className="flex items-start gap-2 text-xs text-ink-tertiary">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Your file is converted to slide images and text on our server so the simulator can show it back to
                you — it is stored privately and only visible to you and your trainer.
              </p>
            </>
          ) : null}

          {step === 2 ? (
            <div className="flex flex-col gap-4">
              <SummaryRow label="Title" value={title} />
              <SummaryRow label="Type" value={presentationType} />
              <SummaryRow label="Audience" value={audience} />
              <SummaryRow
                label="Duration"
                value={customMinutes ? `${customMinutes} min (custom)` : `${durationSeconds / 60} min`}
              />
              <SummaryRow label="Evaluation mode" value={EVALUATION_MODES.find((m) => m.value === evaluationMode)?.label ?? ""} />
              <SummaryRow label="File" value={file?.name ?? ""} />

              {uploading ? (
                <div className="flex flex-col gap-2">
                  <ProgressBar value={uploadPct} />
                  <p className="text-xs text-ink-tertiary">
                    {uploadPct < 100 ? `Uploading — ${uploadPct}%` : "Processing your slides…"}
                  </p>
                </div>
              ) : null}
              {submitError ? <p className="text-sm text-danger-500">{submitError}</p> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="ghost" disabled={step === 0 || uploading} onClick={() => setStep((s) => s - 1)}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        {step < 2 ? (
          <Button
            disabled={(step === 0 && !canProceedStep0) || (step === 1 && !canProceedStep1)}
            onClick={() => setStep((s) => s + 1)}
          >
            Continue <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button disabled={uploading} onClick={submit}>
            {uploading ? "Uploading…" : "Create session"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-ink-secondary">{label}</span>
      {children}
    </label>
  );
}

function SelectPills({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button key={opt} type="button" onClick={() => onChange(opt)} className={pillClass(value === opt)}>
          {opt}
        </button>
      ))}
    </div>
  );
}

function pillClass(active: boolean) {
  return `h-9 rounded-full border px-4 text-sm transition-colors ${
    active
      ? "border-accent-500 bg-accent-500 text-white"
      : "border-border-default text-ink-secondary hover:border-border-strong"
  }`;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle pb-2 text-sm last:border-0">
      <span className="text-ink-tertiary">{label}</span>
      <span className="font-medium text-ink-primary">{value}</span>
    </div>
  );
}
