import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { toNodeHandler } from "better-auth/node";

import ingredientSubstitutionRoutes from "./routes/ingredientSubstitution.route.js";
import mealPlannerRoutes from "./routes/mealPlanner.route.js";
import mealProfileRoutes from "./src/routes/mealProfile.routes.js";
import foodWasteManagerRoutes from "./src/routes/pantry.routes.js";

// ============================================
// AUTH & DATABASE
// ============================================

import { auth } from "./src/lib/auth.js";
import { prisma } from "./src/lib/prisma.js";

// ============================================
// SERVICES
// ============================================

import { analyzeMeal } from "./src/services/meal-analyze.service.js";

// ============================================
// EXISTING ROUTES
// ============================================

import recipeRoutes from "./src/recipe/recipe.routes.js";
import userRoutes from "./src/routes/user.routes.js";
import communityRoutes from "./src/community/community.routes.js";
import recipeMatcherRoute from "./routes/recipeMatcher.route.js";
import pantryRoutes from "./routes/pantryRoutes.js";
import challengeRoutes from "./src/routes/challenge.routes.js";
import adminUserRoutes from "./routes/admin-user.route.js";
import aiChatRoutes from "./routes/ai-chat.routes.js";
import dashboardRoutes from "./routes/dashboard.route.js";
import adminRoutes from "./routes/admin.route.js";

// ============================================
// ADMIN & AI ROUTES
// ============================================


const app = express();
const PORT = process.env.PORT || 5000;

const upload = multer({
  storage: multer.memoryStorage(),
});

// ============================================
// CORS
// ============================================

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://food-canvas.vercel.app",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Cookie",
    ],
  })
);

// ============================================
// BETTER AUTH
// IMPORTANT: Keep this BEFORE express.json()
// ============================================

app.all("/api/auth/*splat", toNodeHandler(auth));

// ============================================
// BODY PARSERS
// ============================================

app.use(express.json({ limit: "10mb" }));

// ============================================
// COMMUNITY
// ============================================

app.use("/api/community", communityRoutes);

// ============================================
// MEAL ANALYSIS
// ============================================

app.post(
  "/api/meals/analyze",
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Meal image is required",
        });
      }

      // 1. Authenticate user
      const session = await auth.api.getSession({ headers: req.headers as any });
      const userId = session?.user?.id;

      // [MEAL POST] Diagnostic log
      console.log("[MEAL POST] session.user.id:", userId ?? "UNDEFINED - session cookie may be missing!");

      // 2. Get localDate from body
      const localDate = req.body.localDate || new Date().toISOString().split("T")[0];

      // 3. Analyze Meal
      const result = await analyzeMeal({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
      });

      if (!result.success || !result.isFood) {
        return res.status(200).json(result);
      }

      // 4. Save to DB if authenticated
      if (userId && result.calories !== undefined) {
        // Calculate macros
        const protein = result.macros?.find((m: any) => m.label.toLowerCase() === "protein")?.grams || 0;
        const carbs = result.macros?.find((m: any) => m.label.toLowerCase() === "carbs")?.grams || 0;
        const fat = result.macros?.find((m: any) => m.label.toLowerCase() === "fat")?.grams || 0;

        console.log("[MEAL POST] Saving MealLog:", { userId, name: result.foodName, calories: result.calories, date: localDate });

        // Save MealLog
        const savedMeal = await prisma.mealLog.create({
          data: {
            userId,
            name: result.foodName || "Analyzed Meal",
            calories: result.calories,
            protein,
            carbs,
            fat,
            imageUrl: result.imageUrl,
            date: localDate,
          },
        });

        console.log("[MEAL POST] Saved MealLog id:", savedMeal.id);

        // Update DailyEntry
        await prisma.dailyEntry.upsert({
          where: { userId_date: { userId, date: localDate } },
          update: {
            kcal: { increment: result.calories },
            protein: { increment: protein },
          },
          create: {
            userId,
            date: localDate,
            kcal: result.calories,
            protein,
          },
        });

        // Attach persisted ID
        result.mealId = savedMeal.id;
      } else {
        console.log("[MEAL POST] SKIPPED DB insert - userId undefined or calories missing. userId:", userId, "calories:", result.calories);
      }

      return res.status(200).json(result);

    } catch (error: any) {
      console.error("Meal Analysis Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to analyze meal image",
        error: error.message,
      });
    }
  }
);

// ============================================
// HEALTH CHECK
// ============================================

app.get("/", (req, res) => {
  res.send("Server is running");
});

// ============================================
// RECIPE ROUTES
// ============================================

app.use("/api", recipeRoutes);

// ============================================
// USER ROUTES
// ============================================

app.use("/api/users", userRoutes);

// ============================================
// PANTRY-TO-PLATE ROUTES
// ============================================

app.use("/api/pantry-to-plate", pantryRoutes);

// ============================================
// INGREDIENT SUBSTITUTION ROUTES
// ============================================

app.use("/api/ingredient-substitution", ingredientSubstitutionRoutes);

// ============================================
// MEAL PLANNER ROUTES
// ============================================

app.use("/api/meal-planner", mealPlannerRoutes);

// ============================================
// CHALLENGE ROUTES
// ============================================

app.use("/api/challenges", challengeRoutes);

// ============================================
// MEAL PROFILE ROUTES
// ============================================

app.use("/api/meal-profile", mealProfileRoutes);

// ============================================
// FOOD WASTE MANAGER ROUTES
// ============================================

app.use("/api/pantry", foodWasteManagerRoutes);

// ============================================
// RECIPE MATCHER AI
// ============================================

app.use("/api", recipeMatcherRoute);

// ============================================
// ADMIN USER CRUD ROUTES
// ============================================

// Handles:
// GET    /api/admin/users
// PATCH  /api/admin/users/:id/status
// DELETE /api/admin/users/:id

app.use("/api/admin-user", adminUserRoutes);
app.use("/api/admin", adminRoutes);

// ============================================
// GEMINI AI CHATBOT ROUTES
// ─────────────────────────────────────────────────────────────────────────────
// 15. AI Chat / Consultant Route
// ─────────────────────────────────────────────────────────────────────────────
app.use("/api", aiChatRoutes);

// ─────────────────────────────────────────────────────────────────────────────
// 16. Dashboard Analytics Routes
// ─────────────────────────────────────────────────────────────────────────────
app.use("/api/dashboard", dashboardRoutes);

// ============================================
// DATABASE TEST
// ============================================

app.get("/db-test", async (req, res) => {
  try {
    const users = await prisma.user.findMany();

    res.json({
      success: true,
      message: "Database connected successfully",
      users,
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Database connection request failed",
    });
  }
});

// ============================================
// LOCAL SERVER
// ============================================

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
  });
}

export default app;