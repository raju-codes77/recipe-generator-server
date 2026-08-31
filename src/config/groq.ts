import Groq from "groq-sdk";

if (!process.env.GROQ_API_KEY_PLATE_AI) {
  throw new Error("GROQ_API_KEY_PLATE_AI is missing in .env");
}

export const groqClient = new Groq({
  apiKey: process.env.GROQ_API_KEY_PLATE_AI,
});

export const GROQ_MODEL = process.env.GROQ_MODEL_PLATE_AI || "groq/compound";