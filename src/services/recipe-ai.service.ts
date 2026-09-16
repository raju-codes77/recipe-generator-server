import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import { getGroqModel } from "../config/groq.js";

// Initialize clients (can be lazily initialized or undefined if keys are missing)
const geminiApiKey = process.env.RECIPE_GEMINI_API_KEY;
const groqApiKey = process.env.RECIPE_GROQ_API_KEY;

const geminiClient = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;
const groqClient = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null;

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface RecipeContext {
  id: string;
  title: string;
  description?: string;
  cuisine?: string;
  category?: string;
  time?: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  servings?: number;
  ingredients: any[];
  instructions?: string | string[];
}

function buildSystemPrompt(recipe: RecipeContext): string {
  let instructionsText = "";
  if (Array.isArray(recipe.instructions)) {
    instructionsText = recipe.instructions.map((step, i) => `${i + 1}. ${step}`).join("\n");
  } else if (recipe.instructions) {
    try {
      const parsed = JSON.parse(recipe.instructions);
      if (Array.isArray(parsed)) {
        instructionsText = parsed.map((step, i) => `${i + 1}. ${step}`).join("\n");
      } else {
        instructionsText = recipe.instructions;
      }
    } catch {
      instructionsText = recipe.instructions;
    }
  }

  let ingredientsText = "";
  if (Array.isArray(recipe.ingredients)) {
    ingredientsText = recipe.ingredients
      .map(ing => `- ${ing.measure ? ing.measure + " " : ""}${ing.name}`)
      .join("\n");
  }

  return `You are a helpful FoodCanvas Recipe Assistant. You are currently helping the user with the specific recipe provided below.

RECIPE CONTEXT:
Title: ${recipe.title}
${recipe.description ? `Description: ${recipe.description}\n` : ""}
${recipe.cuisine ? `Cuisine: ${recipe.cuisine}\n` : ""}
${recipe.category ? `Category: ${recipe.category}\n` : ""}
${recipe.time ? `Time: ${recipe.time} mins\n` : ""}
${recipe.servings ? `Servings: ${recipe.servings}\n` : ""}
${recipe.calories || recipe.protein || recipe.carbs || recipe.fat ? `Nutrition (per serving): ${recipe.calories ? recipe.calories + 'kcal' : ''} ${recipe.protein ? recipe.protein + 'g protein' : ''} ${recipe.carbs ? recipe.carbs + 'g carbs' : ''} ${recipe.fat ? recipe.fat + 'g fat' : ''}\n` : ""}

Ingredients:
${ingredientsText}

Instructions:
${instructionsText}

ROLE AND RULES:
1. Prioritize this specific recipe context. If the user asks something unrelated to food or cooking, answer briefly but guide them back.
2. Be conversational, friendly, and directly answer the user's actual question.
3. **IMPORTANT: Keep your responses SHORT and concise.** Avoid long introductions or filler words.
4. **DO NOT repeat the recipe's ingredients or instructions** unless specifically asked to do so (e.g. if they ask to adjust servings, only list the adjusted ingredients, don't repeat the instructions).
5. Use clean formatting (bullet points, numbered lists, bold text) to make your answers easy to scan in a small chat window.
6. If they ask to modify diet (e.g. vegan, dairy-free), explain clearly how to do it based on THIS recipe.
7. Do NOT invent information not present here or hallucinate. If you don't know, say so.
8. Clearly distinguish estimates from verified nutritional facts.
`;
}

export async function generateRecipeChatResponse(
  recipeContext: RecipeContext,
  history: ChatMessage[],
  newMessage: string
): Promise<string> {
  const systemPrompt = buildSystemPrompt(recipeContext);

  if (!geminiClient && !groqClient) {
    throw new Error("AI is temporarily unavailable (No API keys configured).");
  }

  // Attempt Gemini First
  if (geminiClient) {
    try {
      // Map history to Gemini format. @google/genai format: 
      // role: "user" | "model"
      const contents = history.map(msg => ({
        role: msg.role === "assistant" ? "model" : msg.role,
        parts: [{ text: msg.content }]
      }));
      
      const response = await geminiClient.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [
          ...contents,
          { role: "user", parts: [{ text: newMessage }] }
        ],
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.7,
        }
      });
      
      if (response.text) return response.text;
    } catch (error) {
      console.error("Gemini failed, falling back to Groq:", error);
      // Fallthrough to Groq
    }
  }

  // Fallback to Groq
  if (groqClient) {
    try {
      const groqMessages = [
        { role: "system", content: systemPrompt },
        ...history.map(msg => ({ role: msg.role as any, content: msg.content })),
        { role: "user", content: newMessage }
      ];

      const completion = await groqClient.chat.completions.create({
        messages: groqMessages,
        model: getGroqModel(),
        temperature: 0.7,
      });

      const reply = completion.choices[0]?.message?.content;
      if (reply) return reply;
    } catch (error) {
      console.error("Groq fallback failed:", error);
    }
  }

  throw new Error("AI is temporarily unavailable. Please try again later.");
}
