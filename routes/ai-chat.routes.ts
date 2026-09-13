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

    // gemini-3.5-flash মডেল এবং systemInstruction ব্যবহার করে রিকোয়েস্ট পাঠানো হচ্ছে
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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

    const reply = response.text || "I couldn't process that query.";

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