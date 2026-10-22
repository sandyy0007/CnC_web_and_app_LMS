"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, FileText, X } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

const ACCEPTED = [".pdf", ".pptx"];
const MAX_BYTES = 50 * 1024 * 1024;

export function UploadDropzone({
  file,
  onFileSelected,
  onClear,
  error,
}: {
  file: File | null;
  onFileSelected: (file: File) => void;
  onClear: () => void;
  error: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const f = files?.[0];
      if (!f) return;
      const ext = `.${f.name.toLowerCase().split(".").pop()}`;
      if (!ACCEPTED.includes(ext)) {
        onFileSelected(f); // let parent surface the validation error consistently
        return;
      }
      if (f.size > MAX_BYTES) {
        onFileSelected(f);
        return;
      }
      onFileSelected(f);
    },
    [onFileSelected],
  );

  if (file) {
    return (
      <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-border-default bg-surface-1 p-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-accent-50 text-accent-600">
            <FileText className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink-primary">{file.name}</p>
            <p className="text-xs text-ink-tertiary">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-label="Remove file"
          className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-ink-tertiary hover:bg-surface-2 hover:text-ink-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        aria-label="Upload presentation file (PDF or PPTX)"
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[var(--radius-md)] border-2 border-dashed p-10 text-center transition-colors",
          dragOver ? "border-accent-500 bg-accent-50" : "border-border-default hover:border-border-strong",
          error && "border-danger-500",
        )}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-ink-secondary">
          <Upload className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-medium text-ink-primary">
            Drag and drop your presentation, or click to browse
          </p>
          <p className="mt-1 text-xs text-ink-tertiary">PDF or PPTX, up to 50MB</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.pptx"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {error ? <p className="mt-2 text-sm text-danger-500">{error}</p> : null}
    </div>
  );
}
