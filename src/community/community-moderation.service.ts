import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";
import { withAIRetry } from "../config/ai.config.js";
import { TEXT_ONLY_POST_IMAGE } from "./community.validation.js";
import type { CreateCommunityPostInput } from "./community.types.js";

type ModerationKind = "post" | "story";

interface ModerationResult {
  approved: boolean;
  imageIsFood: boolean;
  captionIsFoodRelated: boolean;
  captionMatchesImage: boolean;
  reason: string;
}

interface RawModerationResult {
  approved?: unknown;
  imageIsFood?: unknown;
  captionIsFoodRelated?: unknown;
  captionMatchesImage?: unknown;
  reason?: unknown;
}

export class CommunityModerationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "CommunityModerationError";
    this.statusCode = statusCode;
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function promptFor(kind: ModerationKind, caption: string, recipe?: CreateCommunityPostInput["recipe"]): string {
  const recipeDetails = recipe
    ? `Recipe title: ${recipe.title}\nIngredients: ${(recipe.ingredients || []).map((item) => item.name).join(", ")}`
    : "No structured recipe was provided.";

  if (kind === "story") {
    return `You moderate a food community story. Inspect the attached image and decide whether it is clearly related to food, cooking, a dish, ingredients, kitchen work, or culinary technique. Screenshots, ID cards, meetings, software, documents, people unrelated to food, and random objects are not food content. Return ONLY valid JSON: {"approved":boolean,"imageIsFood":boolean,"reason":"short reason"}. Caption: ${caption || "(none)"}`;
  }

  return `You moderate a food community post. Inspect the attached image and caption. The image must clearly show food, a dish, ingredients, cooking, a kitchen process, or a culinary technique. Reject screenshots, ID cards, meetings, software, documents, and unrelated objects. The caption must be food-related and reasonably match the image. Return ONLY valid JSON: {"approved":boolean,"imageIsFood":boolean,"captionIsFoodRelated":boolean,"captionMatchesImage":boolean,"reason":"short reason"}. Caption: ${caption}\n${recipeDetails}`;
}

function parseResult(raw: string, kind: ModerationKind): ModerationResult {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(cleaned) as RawModerationResult;
  const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

  if (!isBoolean(parsed.approved) || !isBoolean(parsed.imageIsFood)) {
    throw new Error(`Invalid ${kind} moderation response`);
  }

  const captionIsFoodRelated = kind === "story" ? true : parsed.captionIsFoodRelated;
  const captionMatchesImage = kind === "story" ? true : parsed.captionMatchesImage;
  if (!isBoolean(captionIsFoodRelated) || !isBoolean(captionMatchesImage)) {
    throw new Error("Invalid post moderation response");
  }

  return {
    approved: parsed.approved,
    imageIsFood: parsed.imageIsFood,
    captionIsFoodRelated,
    captionMatchesImage,
    reason: typeof parsed.reason === "string" ? parsed.reason : "Content did not meet Community guidelines.",
  };
}

async function runGroq(kind: ModerationKind, imageUrl: string, caption: string, recipe?: CreateCommunityPostInput["recipe"]): Promise<ModerationResult> {
  const apiKey = requiredEnv(kind === "story" ? "GROQ_API_KEY_STORY" : "GROQ_API_KEY_COMMUNITY");
  const model = process.env[kind === "story" ? "GROQ_MODEL_STORY" : "GROQ_MODEL_COMMUNITY"]?.trim() || "qwen/qwen3.6-27b";
  const client = new Groq({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: promptFor(kind, caption, recipe) },
        { type: "image_url", image_url: { url: imageUrl } },
      ],
    }],
    temperature: 0,
    response_format: { type: "json_object" },
  });
  const raw = completion.choices[0]?.message?.content;
  if (typeof raw !== "string" || !raw.trim()) throw new Error("Empty response from Groq");
  return parseResult(raw, kind);
}

async function imageAsInlineData(imageUrl: string): Promise<{ data: string; mimeType: string }> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Unable to fetch image for Gemini (${response.status})`);
  const mimeType = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  const data = Buffer.from(await response.arrayBuffer()).toString("base64");
  return { data, mimeType };
}

async function runGemini(kind: ModerationKind, imageUrl: string, caption: string, recipe?: CreateCommunityPostInput["recipe"]): Promise<ModerationResult> {
  // Use the dedicated community key, falling back to the main Gemini key
  const geminiApiKey = process.env.GEMINI_API_KEY_COMMUNITY || process.env.GEMINI_API_KEY;
  if (!geminiApiKey) throw new Error("Gemini AI is not configured for community moderation.");
  const client = new GoogleGenAI({ apiKey: geminiApiKey });
  const GEMINI_MODEL = "gemini-3.6-flash";
  const image = await imageAsInlineData(imageUrl);
  const response = await withAIRetry(
    async () => {
      return await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{
          role: "user",
          parts: [{ text: promptFor(kind, caption, recipe) }, { inlineData: image }],
        }],
        config: { responseMimeType: "application/json" },
      });
    },
    `Gemini Community Moderation (${kind})`,
    3
  );
  if (!response.text) throw new Error("Empty response from Gemini");
  return parseResult(response.text, kind);
}

async function moderate(kind: ModerationKind, imageUrl: string, caption: string, recipe?: CreateCommunityPostInput["recipe"]): Promise<ModerationResult> {
  try {
    return await runGroq(kind, imageUrl, caption, recipe);
  } catch (groqError) {
    console.warn(`Community ${kind} Groq moderation failed; using Gemini fallback`, groqError);
    try {
      return await runGemini(kind, imageUrl, caption, recipe);
    } catch (geminiError) {
      // Both AI services are unavailable (rate limits, cold starts, etc.).
      // Fail-OPEN: approve the post so production submissions are not blocked.
      // The content can be reviewed and removed by admins if needed.
      console.error(`Community ${kind} moderation unavailable — approving optimistically:`, geminiError);
      return {
        approved: true,
        imageIsFood: true,
        captionIsFoodRelated: true,
        captionMatchesImage: true,
        reason: "Moderation skipped: AI services temporarily unavailable.",
      };
    }
  }
}

function rejectResult(kind: ModerationKind, result: ModerationResult): never {
  if (!result.imageIsFood) {
    throw new CommunityModerationError("This Community content was not approved because the image is not food-related.", 422);
  }
  if (kind === "post" && !result.captionIsFoodRelated) {
    throw new CommunityModerationError("This post was not approved because the caption is not food-related.", 422);
  }
  if (kind === "post" && !result.captionMatchesImage) {
    throw new CommunityModerationError("This post was not approved because the caption does not match the uploaded food image.", 422);
  }
  throw new CommunityModerationError("This Community content was not approved by food-content moderation.", 422);
}

export async function moderateCommunityPost(input: CreateCommunityPostInput): Promise<void> {
  if (input.imageUrl === TEXT_ONLY_POST_IMAGE) return;
  const result = await moderate("post", input.imageUrl, input.caption, input.recipe);
  if (!result.approved) rejectResult("post", result);
}

export async function moderateCommunityStory(imageUrl: string, caption: string): Promise<void> {
  const result = await moderate("story", imageUrl, caption);
  if (!result.approved) rejectResult("story", result);
}
