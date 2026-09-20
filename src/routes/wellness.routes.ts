import express from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { generateWellnessTip } from "../services/wellness-ai.service.js";
import { trackAiUsage } from "../services/ai-usage.service.js";

const router = express.Router();

// Middleware to ensure user is authenticated
const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session || !session.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    (req as any).user = session.user;
    next();
  } catch (error) {
    console.error("Wellness Auth Middleware Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

// GET /api/wellness-reminders/preferences
router.get("/preferences", requireAuth, async (req: any, res: any) => {
  try {
    const userId = req.user.id;
    let preference = await prisma.wellnessPreference.findUnique({
      where: { userId },
    });

    if (!preference) {
      preference = await prisma.wellnessPreference.create({
        data: {
          userId,
          enabled: true,
          frequency: "1h",
          categories: ["general-wellness"],
        },
      });
    }

    return res.json(preference);
  } catch (error) {
    console.error("Error fetching wellness preferences:", error);
    return res.status(500).json({ error: "Failed to fetch preferences" });
  }
});

// PUT /api/wellness-reminders/preferences
router.put("/preferences", requireAuth, async (req: any, res: any) => {
  try {
    const userId = req.user.id;
    const { enabled, frequency, categories } = req.body;

    const preference = await prisma.wellnessPreference.upsert({
      where: { userId },
      update: {
        enabled,
        frequency,
        categories,
      },
      create: {
        userId,
        enabled: enabled !== undefined ? enabled : true,
        frequency: frequency || "1h",
        categories: categories || ["general-wellness"],
      },
    });

    return res.json(preference);
  } catch (error) {
    console.error("Error updating wellness preferences:", error);
    return res.status(500).json({ error: "Failed to update preferences" });
  }
});

// GET /api/wellness-reminders/generate
router.get("/generate", requireAuth, async (req: any, res: any) => {
  try {
    const userId = req.user.id;
    const preference = await prisma.wellnessPreference.findUnique({
      where: { userId },
    });

    if (!preference || !preference.enabled) {
      return res.status(400).json({ error: "Wellness reminders are disabled." });
    }

    // Rate limiting check
    const now = new Date();
    const lastShown = new Date(preference.lastShownAt);
    let msRequired = 60 * 60 * 1000; // default 1h
    if (preference.frequency === "30s") msRequired = 30 * 1000;
    if (preference.frequency === "30m") msRequired = 30 * 60 * 1000;
    if (preference.frequency === "2h") msRequired = 2 * 60 * 60 * 1000;

    const buffer = preference.frequency === "30s" ? 5 * 1000 : 2 * 60 * 1000;
    if (now.getTime() - lastShown.getTime() < msRequired - buffer) {
       return res.status(200).json({ tip: null, message: "Reminder not due yet." });
    }

    // Generate tip
    const tip = await generateWellnessTip(preference.categories);

    // Track AI Usage
    await trackAiUsage("WELLNESS", userId);

    // Update lastShownAt
    await prisma.wellnessPreference.update({
      where: { userId },
      data: { lastShownAt: new Date() },
    });

    return res.json({ tip });
  } catch (error) {
    console.error("Error generating wellness tip:", error);
    return res.status(500).json({ error: "Failed to generate tip" });
  }
});

export default router;
