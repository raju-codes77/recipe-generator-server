import { Router, Request, Response } from "express";
import Groq from "groq-sdk";

const router = Router();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const GROQ_MODEL = "openai/gpt-oss-120b";
const RECIPE_COUNT = 1;

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

// Curated fallback pool, tagged with keywords, used when Unsplash search
// isn't available (no key / rate limited / network error) — this way we
// still pick *something* reasonably close instead of a pure random image.
const FOOD_IMAGE_POOL: { url: string; tags: string[] }[] = [
  { url: "https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=600&q=80", tags: ["pasta", "noodle", "garlic", "pesto", "shrimp"] },
  { url: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80", tags: ["salad", "chickpea", "mediterranean", "vegetable", "lemon"] },
  { url: "https://images.unsplash.com/photo-1633964913295-ceb43826e7c9?auto=format&fit=crop&w=600&q=80", tags: ["risotto", "mushroom", "creamy", "rice", "truffle"] },
  { url: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=80", tags: ["salmon", "fish", "seafood", "grilled"] },
  { url: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&w=600&q=80", tags: ["stir-fry", "thai", "basil", "avocado", "vegetable"] },
  { url: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=600&q=80", tags: ["soup", "tomato", "garlic"] },
  { url: "https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?auto=format&fit=crop&w=600&q=80", tags: ["bowl", "chickpea", "avocado", "vegan", "buddha bowl"] },
  { url: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=600&q=80", tags: ["shrimp", "butter", "garlic", "seafood"] },
  { url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80", tags: ["salad", "orzo", "lemon", "mediterranean"] },
  { url: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=600&q=80", tags: ["toast", "avocado", "bread"] },
  { url: "https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?auto=format&fit=crop&w=600&q=80", tags: ["pasta", "mushroom", "creamy", "basil"] },
  { url: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=600&q=80", tags: ["food", "dish", "plate"] },
];

function pickFromPoolByKeywords(text: string): string {
  const haystack = text.toLowerCase();
  let bestScore = 0;
  let bestUrl: string | null = null;

  for (const entry of FOOD_IMAGE_POOL) {
    const score = entry.tags.reduce((acc, tag) => acc + (haystack.includes(tag) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestUrl = entry.url;
    }
  }

  // No keyword overlap at all — random pool image instead of a broken one.
  return bestUrl ?? FOOD_IMAGE_POOL[Math.floor(Math.random() * FOOD_IMAGE_POOL.length)].url;
}

// Resolve a real, verified photo that matches this specific recipe.
// Primary: live Unsplash search on the recipe title.
// Fallback: keyword-tagged local pool (never trust an AI-generated URL —
// models hallucinate fake Unsplash IDs that 404).
async function findMatchingImage(recipe: { title: string; description?: string; basedOn?: string }): Promise<string> {
  const fallbackText = `${recipe.title} ${recipe.description ?? ""} ${recipe.basedOn ?? ""}`;

  if (!UNSPLASH_ACCESS_KEY) {
    return pickFromPoolByKeywords(fallbackText);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(recipe.title)}&per_page=1&orientation=landscape`,
      {
        headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error("Unsplash search failed:", response.status);
      return pickFromPoolByKeywords(fallbackText);
    }

    const data: any = await response.json();
    const photo = data?.results?.[0];
    const url = photo?.urls?.regular || photo?.urls?.small;

    return url || pickFromPoolByKeywords(fallbackText);
  } catch (error) {
    console.error("Unsplash search error:", error);
    return pickFromPoolByKeywords(fallbackText);
  }
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

    const userPrompt = `Generate exactly ${RECIPE_COUNT} new, creative, personalized recipe based on the user's taste profile:
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
      "matchScore": number (between 80 and 99),
      "description": string (short breakdown like "Low on Cilantro, Medium Spicy..."),
      "basedOn": string (e.g. "Likes: Garlic, Avocado | Dislikes: Cilantro")
    }
  ]
}
Do NOT include an "image" field — images are added separately.
The "recipes" array must contain exactly ${RECIPE_COUNT} object.`;

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
        temperature: 0.9,
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

    // Resolve a matching image per recipe based on its own title/content.
    const recipesWithImages = await Promise.all(
      recipes.map(async (recipe: any) => ({
        ...recipe,
        image: await findMatchingImage(recipe),
      }))
    );

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