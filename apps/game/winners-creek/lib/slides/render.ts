import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function getPdftoppmBin(): string {
  const envBin = process.env.PDFTOPPM_BIN?.trim();
  if (envBin && existsSync(envBin)) return envBin;

  const candidates = [
    "C:\\Users\\SANDEEP\\AppData\\Local\Programs\\MiKTeX\\miktex\\bin\\x64\\pdftoppm.exe",
    "C:\\Program Files\\MiKTeX\\miktex\\bin\\x64\\pdftoppm.exe",
    "/usr/bin/pdftoppm",
    "/usr/local/bin/pdftoppm",
  ];

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }

  return "pdftoppm";
}

/**
 * Renders every page of a PDF to PNG using poppler's `pdftoppm`.
 */
export async function renderPdfPagesToPng(
  pdfBytes: Uint8Array,
  options?: { scale?: number; dpi?: number },
): Promise<Uint8Array[]> {
  const workDir = mkdtempSync(join(tmpdir(), "wc-pdftoppm-"));
  const pdfPath = join(workDir, "input.pdf");
  writeFileSync(pdfPath, pdfBytes);
  const outPrefix = join(workDir, "slide");

  const dpi = options?.dpi ?? Math.round(72 * (options?.scale ?? 2.0));
  const bin = getPdftoppmBin();

  console.log(`[renderPdfPagesToPng] Running pdftoppm binary: ${bin} at ${dpi} DPI`);

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(bin, ["-png", "-r", String(dpi), pdfPath, outPrefix], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (e) => reject(new Error(`pdftoppm binary not runnable (${bin}): ${e.message}`)));
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`pdftoppm failed (code ${code}): ${stderr.slice(-300)}`));
      else resolve();
    });
  });

  const files = readdirSync(workDir)
    .filter((f) => f.startsWith("slide") && f.endsWith(".png"))
    .sort((a, b) => {
      const na = Number(a.match(/-(\d+)\.png$/)?.[1] ?? 0);
      const nb = Number(b.match(/-(\d+)\.png$/)?.[1] ?? 0);
      return na - nb;
    });

  console.log(`[renderPdfPagesToPng] pdftoppm generated ${files.length} PNG pages: [${files.join(", ")}]`);

  const images = files.map((f) => new Uint8Array(readFileSync(join(workDir, f))));
  try {
    rmSync(workDir, { recursive: true, force: true });
  } catch (err) {
    console.warn("[renderPdfPagesToPng] Failed to clean up temp directory:", err);
  }

  return images;
}
