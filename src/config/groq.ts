import Groq from "groq-sdk";

const apiKey = process.env.GROQ_API_KEY_PLATE_AI || process.env.GROQ_API_KEY || "";

if (!apiKey) {
  console.warn("Warning: Neither GROQ_API_KEY_PLATE_AI nor GROQ_API_KEY is defined in environment variables.");
}

export const groqClient = new Groq({
  apiKey: apiKey,
});

export const getGroqModel = () => process.env.GROQ_MODEL_PLATE_AI || process.env.GROQ_MODEL || "openai/gpt-oss-120b";
export const GROQ_MODEL = getGroqModel();
