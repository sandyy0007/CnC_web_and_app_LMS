import fs from "node:fs";
import path from "node:path";
import { getAIConfig } from "../lib/ai/config";
import { convertPptxToPdf } from "../lib/slides/convert";
import { renderPdfPagesToPng } from "../lib/slides/render";
import { parsePresentation } from "../lib/slides/index";
import { putObject, getObject, storageKeyToServeUrl } from "../lib/storage";

async function main() {
  console.log("==================================================");
  console.log("WINNERS CREEK - FULL PIPELINE & AI VERIFICATION");
  console.log("==================================================");

  // 1. Centralized AI Configuration
  console.log("\n[1/5] Verifying Centralized AI Configuration...");
  const aiConfig = getAIConfig();
  console.log("✓ Provider:", aiConfig.provider);
  console.log("✓ Text Model:", aiConfig.textModel);
  console.log("✓ Transcription Model:", aiConfig.transcriptionModel);
  console.log("✓ Live Model:", aiConfig.liveModel);
  console.log("✓ TTS Model:", aiConfig.ttsModel);
  console.log("✓ Configured (API Key present):", aiConfig.isConfigured);

  if (aiConfig.textModel !== "gemini-3.8-flash") {
    throw new Error(`Expected textModel to be gemini-3.8-flash, got ${aiConfig.textModel}`);
  }
  if (aiConfig.transcriptionModel !== "gemini-3.5-transcribe") {
    throw new Error(`Expected transcriptionModel to be gemini-3.5-transcribe, got ${aiConfig.transcriptionModel}`);
  }
  if (aiConfig.liveModel !== "gemini-3.8-live") {
    throw new Error(`Expected liveModel to be gemini-3.8-live, got ${aiConfig.liveModel}`);
  }
  if (aiConfig.ttsModel !== "gemini-3.8-flash-lite-tts") {
    throw new Error(`Expected ttsModel to be gemini-3.8-flash-lite-tts, got ${aiConfig.ttsModel}`);
  }

  // 2. Real PPTX Loading
  const pptxPath = path.resolve(process.cwd(), "test-assets", "test-presentation.pptx");
  if (!fs.existsSync(pptxPath)) {
    throw new Error(`Test PPTX not found at ${pptxPath}`);
  }
  const pptxBytes = fs.readFileSync(pptxPath);
  console.log(`\n[2/5] Read real PPTX file: ${pptxPath} (${pptxBytes.length} bytes)`);

  // 3. Conversion via LibreOffice Headless (soffice.com)
  console.log("\n[3/5] Testing LibreOffice Headless conversion to PDF...");
  const pdfBytes = await convertPptxToPdf(pptxBytes, { filename: "test-presentation.pptx" });
  console.log(`✓ LibreOffice converted PPTX to PDF successfully: ${pdfBytes.length} bytes`);

  // 4. Rasterization via pdftoppm to PNG
  console.log("\n[4/5] Testing pdftoppm rasterization of PDF to PNG slides...");
  const pngPages = await renderPdfPagesToPng(pdfBytes, { dpi: 144 });
  console.log(`✓ pdftoppm rendered ${pngPages.length} slide PNGs:`);
  pngPages.forEach((png, i) => {
    console.log(`   Slide ${i + 1}: ${png.length} bytes`);
  });

  // 5. Full parsePresentation Pipeline & Storage
  console.log("\n[5/5] Testing parsePresentation pipeline with storage & serve URLs...");
  const parsed = await parsePresentation("test-presentation.pptx", pptxBytes);
  console.log(`✓ Parsed text slide count: ${parsed.slides.length}`);
  console.log(`✓ Rendered visual images count: ${parsed.slideImages.length}`);
  console.log(`✓ isSvg flag: ${parsed.isSvg ?? false} (false means pure high-res PNG)`);

  for (let i = 0; i < parsed.slideImages.length; i++) {
    const imgBuffer = Buffer.from(parsed.slideImages[i]);
    const storageKey = await putObject(imgBuffer, { prefix: "slide-images", ext: "png" });
    const retrieved = await getObject(storageKey);
    const serveUrl = storageKeyToServeUrl(storageKey);

    console.log(`✓ Slide ${i + 1}:`);
    console.log(`   - Storage Key: ${storageKey}`);
    console.log(`   - Stored Bytes: ${retrieved.length}`);
    console.log(`   - Browser Serve URL: ${serveUrl}`);
    if (serveUrl !== `/api/media/${storageKey}`) {
      throw new Error(`Unexpected serve URL format: ${serveUrl}`);
    }
  }

  console.log("\n==================================================");
  console.log("ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("FATAL verification error:", err);
  process.exit(1);
});
