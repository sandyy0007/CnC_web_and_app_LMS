export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateAndLogAIStartup } = await import("@/lib/ai/config");
    validateAndLogAIStartup();
  }
}
