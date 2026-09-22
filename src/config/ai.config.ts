import { GoogleGenAI } from "@google/genai";

// Ensure the API key is provided
const apiKey = process.env.GEMINI_API_KEY || process.env.MEALDB_API_KEY;

if (!apiKey) {
  console.warn("WARNING: GEMINI_API_KEY is not set in the environment.");
}

// 1. Centralized Gemini Client
export const geminiClient = apiKey ? new GoogleGenAI({ apiKey }) : null;

// 2. Centralized Model Identifier
// gemini-3.6-flash is the standard production-ready multimodal model.
export const GEMINI_MODEL = "gemini-3.6-flash";

// Specific meal models
export const GEMINI_MEAL_MODEL = process.env.GEMINI_MEAL_MODEL || "gemini-3.6-flash";
export const GEMINI_MEAL_MODEL_FALLBACK = process.env.GEMINI_MEAL_MODEL_FALLBACK || "gemini-2.5-flash";
// qwen/qwen3.8-27b is the only currently-active Groq model that accepts image inputs
export const GROQ_MEAL_MODEL = process.env.GROQ_MEAL_MODEL || "qwen/qwen3.8-27b";

// 3. Retry Wrapper
export async function withAIRetry<T>(
  operation: () => Promise<T>,
  context: string = "AI Operation",
  maxAttempts: number = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`[${context}] Attempt ${attempt}/${maxAttempts}`);
      }
      return await operation();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const normalizedError = errorMessage.toLowerCase();

      // Check if failure is temporary
      const isTemporary =
        normalizedError.includes("503") ||
        normalizedError.includes("429") ||
        normalizedError.includes("unavailable") ||
        normalizedError.includes("high demand") ||
        normalizedError.includes("fetch failed") ||
        normalizedError.includes("etimedout") ||
        normalizedError.includes("econnreset") ||
        normalizedError.includes("timeout");

      if (!isTemporary || attempt === maxAttempts) {
        console.error(`[${context}] Permanent error or max retries reached:`, error);
        throw error instanceof Error ? error : new Error(errorMessage);
      }

      // Exponential backoff
      const delayMs = 1000 * Math.pow(2, attempt - 1);
      console.log(`[${context}] Temporary error detected. Retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("Unreachable");
}

// 4. JSON Extraction Helper
export function extractCleanJson(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}
