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

// Get all active pantry items for user
router.get("/", async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  try {
    const items = await prisma.pantryItem.findMany({
      where: { userId, status: "ACTIVE" },
      orderBy: { expiryDate: "asc" },
    });
    return res.status(200).json(items);
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to fetch pantry items", error: err.message });
  }
});

// Add new pantry item
router.post("/", async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const { name, quantity, unit, category, purchaseDate, expiryDate } = req.body;
  if (!name || typeof quantity !== "number" || !unit || !expiryDate) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const item = await prisma.pantryItem.create({
      data: {
        userId,
        name,
        quantity,
        unit,
        category,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
        expiryDate: new Date(expiryDate),
      },
    });
    return res.status(201).json(item);
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to add pantry item", error: err.message });
  }
});

// Update pantry item
router.put("/:id", async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const id = req.params.id as string;
  const { name, quantity, unit, category, expiryDate, status } = req.body;

  try {
    // Check ownership
    const existing = await prisma.pantryItem.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ message: "Item not found" });
    }

    const updated = await prisma.pantryItem.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(quantity !== undefined && { quantity }),
        ...(unit && { unit }),
        ...(category && { category }),
        ...(expiryDate && { expiryDate: new Date(expiryDate) }),
        ...(status && { status }),
      },
    });
    return res.status(200).json(updated);
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to update pantry item", error: err.message });
  }
});

// Delete pantry item
router.delete("/:id", async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const id = req.params.id as string;

  try {
    const existing = await prisma.pantryItem.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ message: "Item not found" });
    }

    await prisma.pantryItem.delete({ where: { id } });
    return res.status(200).json({ message: "Deleted successfully" });
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to delete pantry item", error: err.message });
  }
});

// Get food waste insights/stats
router.get("/stats", async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  try {
    const allItems = await prisma.pantryItem.findMany({ where: { userId } });
    
    const now = new Date();
    const activeItems = allItems.filter(i => i.status === "ACTIVE");
    const totalIngredients = activeItems.length;
    
    // Expiring soon: active items expiring within 5 days but not yet expired
    const expiringSoon = activeItems.filter(i => {
      const days = Math.ceil((i.expiryDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
      return days >= 0 && days <= 5;
    }).length;

    // Expired: active items with expiry date in the past
    const expired = activeItems.filter(i => i.expiryDate < now).length;

    // Saved from waste: items marked as USED
    const savedFromWaste = allItems.filter(i => i.status === "USED").length;
    const wasted = allItems.filter(i => i.status === "WASTED").length;

    const totalProcessed = savedFromWaste + wasted;
    const wasteReductionPercentage = totalProcessed > 0 
      ? Math.round((savedFromWaste / totalProcessed) * 100) 
      : 0;

    return res.status(200).json({
      totalIngredients,
      expiringSoon,
      expired,
      savedFromWaste,
      wasted,
      wasteReductionPercentage
    });
  } catch (err: any) {
    return res.status(500).json({ message: "Failed to fetch stats", error: err.message });
  }
});

export default router;
