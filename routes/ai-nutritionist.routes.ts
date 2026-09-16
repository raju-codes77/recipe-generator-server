import { Router, Request, Response } from "express";
import Groq from "groq-sdk";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../src/lib/auth.js";
import { trackAiUsage } from "../src/services/ai-usage.service.js";

const router = Router();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

router.post("/chat", async (req: Request, res: Response): Promise<void> => {
  try {
    const { message } = req.body;

    if (!message) {
      res.status(400).json({
        success: false,
        message: "Message is required.",
      });
      return;
    }

    // Auth is optional for chat, but let's check it for tracking
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }).catch(() => null);
    const userId = session?.user?.id;

    if (userId) {
      await trackAiUsage(userId, "NUTRITIONIST");
    }

    const systemInstruction = `
You are the FoodCanvas AI Nutrition Specialist.
You are a highly qualified clinical nutritionist and diet expert.
Your job is to provide friendly, personalized dietary advice, meal planning suggestions, and wellness tips.
You must absolutely refuse to answer non-health, non-diet, or non-food related queries politely.
Always respond in a professional yet warm, encouraging tone. Keep your answers relatively concise and easy to read.
`;

    const response = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL_PLATE_AI || "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: message.trim() },
      ]
    });

    const reply = response.choices[0]?.message?.content || "I apologize, but I am unable to process your request at this moment.";

    res.json({
      success: true,
      reply,
    });
  } catch (error: any) {
    console.error("AI Nutritionist Chat Error:", error);
    res.status(500).json({
      success: false,
      reply: "AI Nutritionist transmission failure. Please try again later.",
    });
  }
});

export default router;
