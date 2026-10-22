import { GET as getAIStatus } from "../app/api/v1/system/ai-status/route";
import { POST as postAIHealthCheck } from "../app/api/v1/system/ai/health-check/route";

async function testEndpoints() {
  console.log("==========================================");
  console.log("TESTING SYSTEM AI ENDPOINTS");
  console.log("==========================================");

  // 1. Test GET /api/v1/system/ai-status
  const statusRes = await getAIStatus();
  const statusJson = await statusRes.json();
  console.log("GET /api/v1/system/ai-status response:", JSON.stringify(statusJson, null, 2));

  if (statusJson.provider !== "gemini") throw new Error("Expected provider=gemini");
  if (statusJson.text_model !== "gemini-3.8-flash") throw new Error("Expected text_model=gemini-3.8-flash");
  if (statusJson.transcription_model !== "gemini-3.5-transcribe") throw new Error("Expected transcription_model=gemini-3.5-transcribe");
  if (statusJson.live_model !== "gemini-3.8-live") throw new Error("Expected live_model=gemini-3.8-live");
  if (statusJson.tts_model !== "gemini-3.8-flash-lite-tts") throw new Error("Expected tts_model=gemini-3.8-flash-lite-tts");

  // Verify API key is NOT exposed
  if ("apiKey" in statusJson || "GEMINI_API_KEY" in statusJson || "key" in statusJson) {
    throw new Error("SECURITY VIOLATION: API key exposed in ai-status response!");
  }
  console.log("✓ GET /api/v1/system/ai-status passed securely!");

  // 2. Test POST /api/v1/system/ai/health-check without key
  const healthResUnconfigured = await postAIHealthCheck();
  const healthJsonUnconfigured = await healthResUnconfigured.json();
  console.log("\nPOST /api/v1/system/ai/health-check (unconfigured):", JSON.stringify(healthJsonUnconfigured, null, 2));
  if (healthJsonUnconfigured.status !== "AI_NOT_CONFIGURED") {
    throw new Error(`Expected status=AI_NOT_CONFIGURED, got ${healthJsonUnconfigured.status}`);
  }
  console.log("✓ POST /api/v1/system/ai/health-check handles unconfigured state correctly!");

  // 3. Test POST /api/v1/system/ai/health-check with invalid key (verifies AI_AUTH_ERROR)
  process.env.GEMINI_API_KEY = "test_invalid_gemini_key_12345";
  const healthResInvalid = await postAIHealthCheck();
  const healthJsonInvalid = await healthResInvalid.json();
  console.log("\nPOST /api/v1/system/ai/health-check (invalid key):", JSON.stringify(healthJsonInvalid, null, 2));
  if (healthJsonInvalid.status !== "AI_AUTH_ERROR") {
    throw new Error(`Expected status=AI_AUTH_ERROR, got ${healthJsonInvalid.status}`);
  }
  console.log("✓ POST /api/v1/system/ai/health-check maps provider 400/401/403 to AI_AUTH_ERROR correctly!");
  delete process.env.GEMINI_API_KEY;

  console.log("\n==========================================");
  console.log("ALL SYSTEM ENDPOINT CHECKS PASSED!");
  console.log("==========================================");
}

testEndpoints().catch((e) => {
  console.error("Endpoint test failed:", e);
  process.exit(1);
});
