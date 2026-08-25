import { Router, Request, Response } from "express";
import Groq from "groq-sdk";

const router = Router();

// Groq Client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const GROQ_MODEL = "openai/gpt-oss-120b";

// Curated, verified food images — AI models hallucinate fake Unsplash URLs,
// so we never trust image URLs coming back from the model. We assign from
// this pool instead.
const FOOD_IMAGE_POOL: string[] = [
  "https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1633964913295-ceb43826e7c9?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80",
  "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=600&q=80",
];

function assignImage(index: number): string {
  return FOOD_IMAGE_POOL[index % FOOD_IMAGE_POOL.length];
}

// POST /api/match-recipes
router.post("/match-recipes", async (req: Request, res: Response) => {
  try {
    const { sweetness, sourness, saltiness, umami, spiciness, likes, dislikes, cuisines } = req.body;

    if (
      sweetness === undefined ||
      sourness === undefined ||
      saltiness === undefined ||
      umami === undefined ||
      spiciness === undefined ||
      !Array.isArray(likes) ||
      !Array.isArray(dislikes) ||
      typeof cuisines !== "object"
    ) {
      return res.status(400).json({
        success: false,
        error: "Invalid request body. Check sliders, likes/dislikes arrays, and cuisines object.",
      });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "GROQ_API_KEY is not set in the environment.",
      });
    }

    const activeCuisines = Object.entries(cuisines)
      .filter(([_, active]) => active)
      .map(([cuisine]) => cuisine)
      .join(", ");

    const systemPrompt = `You are a professional chef and AI culinary assistant. You always respond with ONLY a valid JSON object, no explanation, no markdown fences.`;

    const userPrompt = `Generate exactly 4 personalized recipes based on the user's taste profile:
- Palate (0-10 scale): Sweetness: ${sweetness}, Sourness: ${sourness}, Saltiness: ${saltiness}, Umami: ${umami}, Spiciness: ${spiciness}
- Ingredient Likes: ${likes.join(", ")}
- Ingredient Dislikes: ${dislikes.join(", ")}
- Preferred Cuisines: ${activeCuisines || "Any"}

Respond with a JSON object of this exact shape:
{
  "recipes": [
    {
      "id": number,
      "title": string,
      "matchScore": number (between 85 and 99),
      "description": string (short breakdown like "Low on Cilantro, Medium Spicy..."),
      "basedOn": string (e.g. "Likes: Garlic, Avocado | Dislikes: Cilantro")
    }
  ]
}
Do NOT include an "image" field — images are added separately.
The "recipes" array must contain exactly 4 objects.`;

    // Timeout wrapper — Groq call 20 seconds er beshi somoy nile reject korbe
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Groq API request timed out after 20s")), 20000)
    );

    const completion: any = await Promise.race([
      groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      }),
      timeoutPromise,
    ]);

    const rawText = completion?.choices?.[0]?.message?.content?.trim() || "";

    if (!rawText) {
      return res.status(502).json({ success: false, error: "Groq returned an empty response." });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error("JSON parse failed. Raw response:", rawText);
      return res.status(502).json({ success: false, error: "Failed to parse Groq's JSON response." });
    }

    const recipes = Array.isArray(parsed) ? parsed : parsed.recipes;

    if (!Array.isArray(recipes) || recipes.length === 0) {
      console.error("No recipes array found in response:", parsed);
      return res.status(502).json({ success: false, error: "Groq response did not contain a recipe array." });
    }

    // Overwrite/assign image with a verified URL — never trust an
    // AI-generated one, since models frequently hallucinate fake
    // Unsplash photo IDs that 404.
    const recipesWithImages = recipes.map((recipe: any, idx: number) => ({
      ...recipe,
      image: assignImage(idx),
    }));

    res.json({ success: true, recipes: recipesWithImages });
  } catch (error: any) {
    console.error("Error generating recipes with Groq:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Unknown server error",
    });
  }
});

export default router;