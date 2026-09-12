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

    // FoodCanvas website context
    const siteMapContext = `
You are FoodCanvas's AI Assistant.

Your job is to help users navigate the website and find features.

Here is a map of the website pages and what they contain:

- AI Recipe Generator (/dashboard/users/ai-recipe):
  Create recipes using ingredients available at home.

- Nutrition Insights (/dashboard/users/nutrition):
  Track daily calorie intake and nutritional metrics.

- Foodie Community (/dashboard/users/community):
  Share meals, get inspiration, and connect with other food lovers.

- User Dashboard (/dashboard/users):
  General overview for regular users.

- Admin Dashboard (/dashboard/admin):
  Management panel restricted to administrators.

Always guide users nicely, tell them what is on each page,
and provide direct paths/links when they ask where to find something.

Be helpful, warm, and concise.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [
        {
          role: "user",
          parts: [{ text: siteMapContext }],
        },
        {
          role: "user",
          parts: [{ text: userMessage.trim() }],
        },
      ],
    });

    const reply =
      response.text || "I couldn't process that query.";

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
    console.error("AI Chat Error:", error);

    return res.status(500).json({
      success: false,
      reply: "AI core transmission failure. Try again.",
    });
  }
});

export default router;