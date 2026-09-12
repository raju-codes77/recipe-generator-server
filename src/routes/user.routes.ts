import express, { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { auth } from "../lib/auth.js";

const router = express.Router();

// Helper: get authenticated userId
async function getUserId(req: Request): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    if (session?.user?.id) return session.user.id;
  } catch (error) {
    // Ignore error and fall through to fallback
  }

  // Fallback to userId from query or body
  const fallbackUserId = req.query?.userId || req.body?.userId;
  if (fallbackUserId && typeof fallbackUserId === "string" && fallbackUserId !== "undefined") {
    return fallbackUserId;
  }

  return null;
}

// GET /api/users/goal
router.get("/goal", async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  try {
    const goal = await prisma.userGoal.findUnique({ where: { userId } });
    if (!goal) return res.status(200).json({ dailyKcal: 2000, dailyProtein: 150 });
    return res.status(200).json({ dailyKcal: goal.dailyKcal, dailyProtein: goal.dailyProtein });
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to fetch goal", error: err.message });
  }
});

// PUT /api/users/goal
router.put("/goal", async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const { dailyKcal, dailyProtein } = req.body;
  if (!dailyKcal || typeof dailyKcal !== "number") return res.status(400).json({ message: "dailyKcal required" });
  try {
    const goal = await prisma.userGoal.upsert({
      where: { userId },
      update: { dailyKcal, dailyProtein: dailyProtein ?? 150 },
      create: { userId, dailyKcal, dailyProtein: dailyProtein ?? 150 },
    });
    return res.status(200).json({ dailyKcal: goal.dailyKcal, dailyProtein: goal.dailyProtein });
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to update goal", error: err.message });
  }
});

// GET /api/users/daily-history
router.get("/daily-history", async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  try {
    const entries = await prisma.dailyEntry.findMany({ where: { userId }, orderBy: { date: "asc" } });
    const history: Record<string, { date: string; kcal: number; protein: number }> = {};
    entries.forEach((e) => { history[e.date] = { date: e.date, kcal: e.kcal, protein: e.protein }; });
    return res.status(200).json(history);
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to fetch history", error: err.message });
  }
});

// POST /api/users/daily-history
router.post("/daily-history", async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const { date, kcal, protein } = req.body;
  if (!date || typeof kcal !== "number") return res.status(400).json({ message: "date and kcal required" });
  try {
    const entry = await prisma.dailyEntry.upsert({
      where: { userId_date: { userId, date } },
      update: { kcal, protein: protein ?? 0 },
      create: { userId, date, kcal, protein: protein ?? 0 },
    });
    return res.status(200).json({ date: entry.date, kcal: entry.kcal, protein: entry.protein });
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to save entry", error: err.message });
  }
});

// GET /api/users/meals
router.get("/meals", async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  console.log("[MEAL GET] userId:", userId ?? "UNDEFINED - unauthorized");
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  
  const { date } = req.query;
  
  try {
    const whereClause: any = { userId };
    if (date && typeof date === "string") {
      whereClause.date = date;
    }
    
    const meals = await prisma.mealLog.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
    });
    
    console.log(`[MEAL GET] Found ${meals.length} meals for userId=${userId}, date=${date ?? "all"}`);
    
    return res.status(200).json(meals);
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to fetch meals", error: err.message });
  }
});


// GET /api/users/taste-profile
router.get("/taste-profile", async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  try {
    const profile = await prisma.tasteProfile.findUnique({ where: { userId } });
    return res.status(200).json(profile ?? {
      sweetness: 5, sourness: 5, saltiness: 5, umami: 5, spiciness: 5,
      likedIngredients: [], dislikedIngredients: [], preferredCuisines: [],
    });
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to fetch taste profile", error: err.message });
  }
});

// PUT /api/users/taste-profile
router.put("/taste-profile", async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const { sweetness, sourness, saltiness, umami, spiciness, likedIngredients, dislikedIngredients, preferredCuisines } = req.body;
  try {
    const data = {
      sweetness: Number(sweetness ?? 5), sourness: Number(sourness ?? 5),
      saltiness: Number(saltiness ?? 5), umami: Number(umami ?? 5), spiciness: Number(spiciness ?? 5),
      likedIngredients: Array.isArray(likedIngredients) ? likedIngredients : [],
      dislikedIngredients: Array.isArray(dislikedIngredients) ? dislikedIngredients : [],
      preferredCuisines: Array.isArray(preferredCuisines) ? preferredCuisines : [],
    };
    const profile = await prisma.tasteProfile.upsert({ where: { userId }, update: data, create: { userId, ...data } });
    return res.status(200).json(profile);
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to update taste profile", error: err.message });
  }
});
export default router;
