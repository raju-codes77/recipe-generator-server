import { Router, Request, Response } from "express";
import { prisma } from "../src/lib/prisma.js";
import { auth } from "../src/lib/auth.js";

const router = Router();

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
  return bestUrl ?? FOOD_IMAGE_POOL[Math.floor(Math.random() * FOOD_IMAGE_POOL.length)].url;
}

// GET /api/taste-profile
router.get("/taste-profile", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any }).catch(() => null);
    const userId = session?.user?.id || req.query?.userId || req.body?.userId;
    if (!userId || typeof userId !== "string" || userId === "undefined") {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const profile = await prisma.tasteProfile.findUnique({
      where: { userId },
    });

    res.json({ success: true, profile });
  } catch (error: any) {
    console.error("Error fetching taste profile:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// POST /api/match-recipes
router.post("/match-recipes", async (req: Request, res: Response) => {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any }).catch(() => null);
    const userId = session?.user?.id || req.query?.userId || req.body?.userId;
    if (!userId || typeof userId !== "string" || userId === "undefined") {
      return res.status(401).json({ success: false, error: "Unauthorized. Please log in to match recipes." });
    }
    const { sweetness, sourness, saltiness, umami, spiciness, likedIngredients, dislikedIngredients, preferredCuisines } = req.body;

    if (
      sweetness === undefined || sourness === undefined ||
      saltiness === undefined || umami === undefined || spiciness === undefined ||
      !Array.isArray(likedIngredients) || !Array.isArray(dislikedIngredients) || !Array.isArray(preferredCuisines)
    ) {
      return res.status(400).json({ success: false, error: "Invalid request body." });
    }

    // Upsert User's Taste Profile
    await prisma.tasteProfile.upsert({
      where: { userId },
      update: { sweetness, sourness, saltiness, umami, spiciness, likedIngredients, dislikedIngredients, preferredCuisines },
      create: { userId, sweetness, sourness, saltiness, umami, spiciness, likedIngredients, dislikedIngredients, preferredCuisines },
    });

    // Load data for behavioral & nutritional matching
    const [userGoal, dailyEntries, userFavorites] = await Promise.all([
      prisma.userGoal.findUnique({ where: { userId } }),
      prisma.dailyEntry.findMany({ where: { userId }, orderBy: { date: "desc" }, take: 1 }),
      prisma.favorite.findMany({ where: { userId }, select: { recipe: { select: { cuisine: true, category: true } } } }),
    ]);

    let caloriesRemaining = userGoal ? userGoal.dailyKcal : 2000;
    if (dailyEntries.length > 0 && userGoal) {
      caloriesRemaining = Math.max(0, userGoal.dailyKcal - dailyEntries[0].kcal);
    }
    
    // Find popular cuisines/categories from favorites
    const favCuisines = new Set(userFavorites.map(f => f.recipe.cuisine).filter(Boolean));
    const favCategories = new Set(userFavorites.map(f => f.recipe.category).filter(Boolean));

    // Fetch all recipes to calculate matches
    const allRecipes = await prisma.recipe.findMany({
      include: { ingredients: true },
    });

    const scoredRecipes = [];

    for (const recipe of allRecipes) {
      let matchReasons: string[] = [];
      let flavorPoints = 0;
      let ingredientPoints = 0;
      let cuisinePoints = 0;
      let behaviorPoints = 0;
      let nutritionPoints = 0;

      // 1. Ingredient Compatibility (Max 30pts)
      const recipeIngredients = recipe.ingredients.map(i => i.name.toLowerCase());
      const lowerLikes = likedIngredients.map((i: string) => i.toLowerCase());
      const lowerDislikes = dislikedIngredients.map((i: string) => i.toLowerCase());

      let hasDisliked = false;
      let likedCount = 0;

      for (const ingredient of recipeIngredients) {
        if (lowerDislikes.some((dislike: string) => ingredient.includes(dislike))) {
          hasDisliked = true;
          break;
        }
        if (lowerLikes.some((like: string) => ingredient.includes(like))) {
          likedCount++;
        }
      }

      if (hasDisliked) {
        // Exclude completely if it contains a disliked ingredient
        continue;
      }

      if (lowerLikes.length > 0) {
        ingredientPoints = Math.min(30, (likedCount / Math.max(1, lowerLikes.length)) * 30);
        if (likedCount > 0) {
          matchReasons.push(`Contains liked ingredients`);
        }
      } else {
        ingredientPoints = 30; // Neutral if no preferences
      }

      // 2. Flavor Compatibility (Max 35pts)
      // If recipe has no flavor values, default to 5
      const recSweet = recipe.sweetness ?? 5;
      const recSour = recipe.sourness ?? 5;
      const recSalt = recipe.saltiness ?? 5;
      const recUmami = recipe.umami ?? 5;
      const recSpicy = recipe.spiciness ?? 5;

      const sweetDiff = Math.abs(sweetness - recSweet);
      const sourDiff = Math.abs(sourness - recSour);
      const saltDiff = Math.abs(saltiness - recSalt);
      const umamiDiff = Math.abs(umami - recUmami);
      const spicyDiff = Math.abs(spiciness - recSpicy);

      // Total possible difference across 5 sliders is 50.
      const totalDiff = sweetDiff + sourDiff + saltDiff + umamiDiff + spicyDiff;
      // Closer to 0 difference = higher points
      flavorPoints = Math.max(0, 35 - (totalDiff / 50) * 35);

      if (spicyDiff <= 2 && spiciness > 7) matchReasons.push(`Matches your spicy preference`);
      if (sweetDiff <= 2 && sweetness > 7) matchReasons.push(`Matches your sweet preference`);

      // 3. Cuisine Compatibility (Max 15pts)
      if (preferredCuisines.length > 0 && recipe.cuisine) {
        if (preferredCuisines.some((c: string) => recipe.cuisine?.toLowerCase().includes(c.toLowerCase()))) {
          cuisinePoints = 15;
          matchReasons.push(`Matches your preferred ${recipe.cuisine} cuisine`);
        } else {
          matchReasons.push(`Does not match preferred cuisine`);
        }
      } else {
        cuisinePoints = 15; // Neutral
      }

      // 4. Behavioral Compatibility (Max 10pts)
      if ((recipe.cuisine && favCuisines.has(recipe.cuisine)) || (recipe.category && favCategories.has(recipe.category))) {
        behaviorPoints = 10;
        matchReasons.push(`Similar to your favorites`);
      } else {
        behaviorPoints = 5;
      }

      // 5. Nutrition / Goal Compatibility (Max 10pts)
      if (userGoal && recipe.calories) {
        if (recipe.calories <= caloriesRemaining + 100) {
          nutritionPoints = 10;
          matchReasons.push(`Fits your remaining daily calories`);
        } else {
          nutritionPoints = 0;
          matchReasons.push(`Exceeds daily calories`);
        }
      } else {
        nutritionPoints = 10; // Neutral
      }

      const totalScore = Math.round(flavorPoints + ingredientPoints + cuisinePoints + behaviorPoints + nutritionPoints);

      // Ensure fallback image if missing
      let imageUrl = recipe.image;
      if (!imageUrl) {
        imageUrl = pickFromPoolByKeywords(`${recipe.title} ${recipe.cuisine || ""} ${recipe.category || ""}`);
      }

      scoredRecipes.push({
        id: recipe.id,
        title: recipe.title,
        image: imageUrl,
        matchScore: totalScore,
        cuisine: recipe.cuisine,
        time: recipe.time,
        calories: recipe.calories,
        rating: recipe.rating,
        matchReasons,
      });
    }

    scoredRecipes.sort((a, b) => b.matchScore - a.matchScore);

    const topRecipes = scoredRecipes.slice(0, 12);

    res.json({ success: true, recipes: topRecipes });
  } catch (error: any) {
    console.error("Error matching recipes:", error);
    res.status(500).json({ success: false, error: "Failed to match recipes" });
  }
});

export default router;