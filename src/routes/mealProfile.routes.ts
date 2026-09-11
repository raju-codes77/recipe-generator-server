import express, { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { auth } from "../lib/auth.js";

const router = express.Router();

async function getUserId(req: Request): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

// Get user's meal profile
router.get("/", async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  try {
    const profile = await prisma.mealProfile.findUnique({
      where: { userId },
    });
    return res.status(200).json(profile);
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to fetch meal profile", error: err.message });
  }
});

// Create or update meal profile
router.post("/", async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const {
    foodPreference,
    favoriteCuisines,
    likedFoods,
    dislikedFoods,
    allergies,
    dietaryRestrictions,
    healthGoal,
    dailyMeals,
    cookingTime,
    mealPreferences,
    dailyCalorieTarget
  } = req.body;

  try {
    const profile = await prisma.mealProfile.upsert({
      where: { userId },
      update: {
        foodPreference,
        favoriteCuisines,
        likedFoods,
        dislikedFoods,
        allergies,
        dietaryRestrictions,
        healthGoal,
        dailyMeals,
        cookingTime,
        mealPreferences,
        dailyCalorieTarget
      },
      create: {
        userId,
        foodPreference,
        favoriteCuisines,
        likedFoods,
        dislikedFoods,
        allergies,
        dietaryRestrictions,
        healthGoal,
        dailyMeals,
        cookingTime,
        mealPreferences,
        dailyCalorieTarget
      }
    });
    return res.status(200).json(profile);
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to save meal profile", error: err.message });
  }
});

export default router;
