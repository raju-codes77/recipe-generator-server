import { Router, Request, Response } from "express";
import { groqClient, getGroqModel } from "../src/config/groq.js";

const router = Router();

// ─── POST /api/ingredient-substitution ────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  const { ingredient, recipeContext } = req.body;
  if (!ingredient) {
    return res.status(400).json({ message: "ingredient is required" });
  }

  try {
    const prompt = `You are a professional chef. Suggest 2-3 smart ingredient substitutes.

Ingredient to substitute: "${ingredient}"
Recipe context: "${recipeContext || "general cooking"}"

Respond ONLY with a raw JSON object:
{
  "substitutes": [
    {
      "name": string,
      "amount": string (e.g. "Equal parts (1:1 ratio)" or "3/4 cup per 1 cup"),
      "reason": string (1 sentence: why it works and any flavor/texture notes)
    }
  ]
}`;

    const completion = await groqClient.chat.completions.create({
      model: getGroqModel(),
      messages: [
        { role: "system", content: "You always respond with valid raw JSON only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.5,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty response from AI");

    const parsed = JSON.parse(raw);
    return res.status(200).json(parsed);
  } catch (err: any) {
    console.error("[INGREDIENT-SUB]", err.message);
    return res.status(500).json({ message: "Failed to find substitutes", error: err.message });
  }
});

export default router;
