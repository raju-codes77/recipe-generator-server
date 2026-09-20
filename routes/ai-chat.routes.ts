import { Router } from "express";
import { prisma } from "../src/lib/prisma.js";
import { geminiClient, GEMINI_MODEL, withAIRetry } from "../src/config/ai.config.js";
import { groqClient, getGroqModel } from "../src/config/groq.js";

const router = Router();

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

    let reply = "I couldn't process that query.";

    try {
      if (!geminiClient && !groqClient) {
        throw new Error("AI is not configured.");
      }

      if (geminiClient) {
        try {
          const response = await withAIRetry(
            async () => {
              return await geminiClient!.models.generateContent({
                model: GEMINI_MODEL,
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
            },
            "Gemini AI Chat",
            3
          );
          if (response.text) {
            reply = response.text;
          }
        } catch (geminiError: any) {
          console.warn("[AI Chat] Gemini failed, attempting fallback to Groq:", geminiError.message);
          // Fall through to Groq
        }
      }

      // If reply hasn't been set by Gemini and Groq is available
      if (reply === "I couldn't process that query." && groqClient) {
        try {
          const completion = await groqClient.chat.completions.create({
            messages: [
              { role: "system", content: siteMapContext },
              { role: "user", content: userMessage.trim() }
            ],
            model: getGroqModel(),
            temperature: 0.7,
          });
          const groqReply = completion.choices[0]?.message?.content;
          if (groqReply) {
            reply = groqReply;
          }
        } catch (groqError: any) {
          console.error("[AI Chat] Groq fallback failed:", groqError.message);
          throw new Error("Both AI services failed.");
        }
      }
      
      if (reply === "I couldn't process that query.") {
        throw new Error("Failed to generate a valid reply.");
      }

    } catch (error: any) {
      console.error("[AI Chat] Final failure or non-retryable error:", { status: error?.status, message: error?.message });
      return res.status(503).json({
        success: false,
        message: "The AI service is temporarily busy. Please try again in a moment.",
      });
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