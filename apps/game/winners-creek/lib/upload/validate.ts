import { Errors } from "@/lib/errors";

const MAX_SLIDE_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_RECORDING_BYTES = 500 * 1024 * 1024; // 500MB
const SLIDE_EXTENSIONS = ["pdf", "pptx"];
const SLIDE_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export function validateSlideFile(filename: string, mimeType: string, size: number): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (!SLIDE_EXTENSIONS.includes(ext)) {
    throw Errors.unprocessable(
      `Unsupported file type ".${ext}". Upload a .pdf or .pptx file.`,
      "UNSUPPORTED_FORMAT",
    );
  }
  if (mimeType && !SLIDE_MIME_TYPES.has(mimeType) && mimeType !== "application/octet-stream") {
    throw Errors.unprocessable(
      `The file's content type ("${mimeType}") doesn't match a PDF or PPTX. Please re-export and try again.`,
      "MIME_MISMATCH",
    );
  }
  if (size === 0) {
    throw Errors.unprocessable("That file is empty.", "EMPTY_FILE");
  }
  if (size > MAX_SLIDE_BYTES) {
    throw Errors.unprocessable(
      `File is too large (${(size / 1024 / 1024).toFixed(1)}MB). Maximum is 50MB.`,
      "FILE_TOO_LARGE",
    );
  }
  return ext;
}

export function validateRecordingBlob(mimeType: string, size: number): void {
  if (size === 0) {
    throw Errors.unprocessable("Recording is empty.", "EMPTY_RECORDING");
  }
  if (size > MAX_RECORDING_BYTES) {
    throw Errors.unprocessable("Recording exceeds the 500MB limit.", "RECORDING_TOO_LARGE");
  }
  if (!mimeType.startsWith("video/") && !mimeType.startsWith("audio/")) {
    throw Errors.unprocessable("Unexpected recording content type.", "INVALID_RECORDING_TYPE");
  }
}
