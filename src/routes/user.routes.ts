import express, { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { auth } from "../lib/auth";

const router = express.Router();

// Helper: get authenticated userId
async function getUserId(req: Request): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
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

export default router;
