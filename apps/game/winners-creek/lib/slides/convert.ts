import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Raised when LibreOffice is missing or fails. */
export class LibreOfficeUnavailableError extends Error {}

export function getLibreOfficeBin(): string {
  const envBin = process.env.LIBREOFFICE_BIN?.trim();
  if (envBin && existsSync(envBin)) return envBin;

  const candidates = [
    "C:\\Program Files\\LibreOffice\\program\\soffice.com",
    "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com",
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    "/usr/bin/soffice",
    "/usr/local/bin/soffice",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  ];

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }

  return "soffice";
}

/**
 * PPTX -> PDF via LibreOffice headless.
 * Uses pathToFileURL for Windows RFC file URLs so LibreOffice initializes a clean user profile.
 */
export function convertPptxToPdf(
  pptxBytes: Uint8Array,
  options?: { filename?: string },
): Promise<Uint8Array> {
  const workDir = mkdtempSync(join(tmpdir(), "wc-soffice-in-"));
  const outDir = mkdtempSync(join(tmpdir(), "wc-soffice-out-"));
  const profile = mkdtempSync(join(tmpdir(), "wc-soffice-profile-"));
  const inputFilename = options?.filename ? options.filename.replace(/[^\w.-]/g, "_") : "input.pptx";
  const inputPath = join(workDir, inputFilename);
  writeFileSync(inputPath, pptxBytes);

  const bin = getLibreOfficeBin();
  const profileUrl = pathToFileURL(profile).href;

  const args = [
    "--headless",
    `-env:UserInstallation=${profileUrl}`,
    "--convert-to",
    "pdf",
    "--outdir",
    outDir,
    inputPath,
  ];

  console.log(`[convertPptxToPdf] Running LibreOffice binary: ${bin} with input: ${inputPath}`);

  return new Promise<Uint8Array>((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    proc.on("error", (e) =>
      reject(new LibreOfficeUnavailableError(`LibreOffice not runnable (${bin}): ${e.message}`)),
    );

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(
          new LibreOfficeUnavailableError(
            `LibreOffice conversion failed (code ${code}): ${stderr || stdout || "(no output)"}`,
          ),
        );
        return;
      }

      const files = readdirSync(outDir);
      const pdf = files.find((f) => f.toLowerCase().endsWith(".pdf"));
      if (!pdf) {
        reject(
          new LibreOfficeUnavailableError(
            `Converted PDF not found in output directory. Output files: [${files.join(", ")}]. Stderr: ${stderr}`,
          ),
        );
        return;
      }

      try {
        const resultBytes = new Uint8Array(readFileSync(join(outDir, pdf)));
        console.log(`[convertPptxToPdf] Successfully converted to PDF: ${pdf} (${resultBytes.byteLength} bytes)`);
        resolve(resultBytes);
      } catch (e) {
        reject(e);
      }
    });
  }).finally(() => {
    try {
      rmSync(workDir, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
      rmSync(profile, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn("[convertPptxToPdf] Failed to clean up temp directories:", cleanupErr);
    }
  });
}
