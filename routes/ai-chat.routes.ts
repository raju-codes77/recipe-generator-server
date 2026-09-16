import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
import { prisma } from "../src/lib/prisma.js";

const router = Router();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// ================= AI CHATBOT =================

router.post("/chat", async (req, res) => {
  try {
    const { message, prompt } = req.body;
    const userMessage = message || prompt;

    if (!userMessage) {
      return res.status(400).json({
        success: false,
        message: "Message is required.",
      });
    }

    await prisma.chatMessage.create({
      data: {
        role: "user",
        content: userMessage.trim(),
      },
    });

    const siteMapContext = `
You are FoodCanvas's AI Assistant, a smart, friendly, and helpful cooking and website guide companion.
Your behavior should adapt based on what the user asks:
1. WEBSITE NAVIGATION: If the user asks how to find features, where to go, or asks about website pages, guide them nicely using the website map below and provide the direct paths.
2. RECIPES & COOKING: If the user asks for recipes, cooking instructions, food tips, or general culinary questions, directly provide a helpful, delicious recipe and step-by-step instructions right inside the chat.

Here is a map of the website pages for reference:
- AI Recipe Generator (/dashboard/users/ai-recipe): Create recipes using ingredients available at home.
- Nutrition Insights (/dashboard/users/nutrition): Track daily calorie intake and nutritional metrics.
- Foodie Community (/dashboard/users/community): Share meals, get inspiration, and connect with other food lovers.
- User Dashboard (/dashboard/users): General overview for regular users.
- Admin Dashboard (/dashboard/admin): Management panel restricted to administrators.

Be helpful, warm, and concise in all your responses.
`;

    const primaryModel = process.env.GEMINI_CHAT_MODEL || "gemini-1.5-flash";
    const fallbackModel = process.env.GEMINI_FALLBACK_MODEL || "gemini-1.5-pro";
    const maxRetries = 3;
    const delays = [1000, 2000, 4000];

    let reply = "I couldn't process that query.";
    let success = false;
    let attempt = 0;
    
    while (attempt <= maxRetries && !success) {
      try {
        const modelToUse = attempt === maxRetries ? fallbackModel : primaryModel;
        
        const response = await ai.models.generateContent({
          model: modelToUse,
          config: {
            systemInstruction: siteMapContext,
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userMessage.trim() }],
            },
          ],
        });
        
        reply = response.text || reply;
        success = true;
      } catch (error: any) {
        const isUnavailable = error?.status === 503 || error?.message?.includes("UNAVAILABLE") || error?.message?.includes("high demand");
        
        if (isUnavailable && attempt < maxRetries) {
          console.warn(`[AI Chat] Attempt ${attempt + 1} failed with 503. Retrying in ${delays[attempt]}ms...`);
          await new Promise(res => setTimeout(res, delays[attempt]));
          attempt++;
        } else {
          console.error("[AI Chat] Final failure or non-retryable error:", { status: error?.status, message: error?.message });
          return res.status(503).json({
            success: false,
            message: "The AI service is temporarily busy. Please try again in a moment.",
          });
        }
      }
    }

    await prisma.chatMessage.create({
      data: {
        role: "assistant",
        content: reply,
      },
    });

    return res.json({
      success: true,
      reply,
    });
  } catch (error: any) {
    console.error("AI Chat Unexpected Error:", { message: error?.message });

    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred. Please try again.",
    });
  }
});

export default router;