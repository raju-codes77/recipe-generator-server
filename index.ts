import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";

import ingredientSubstitutionRoutes from "./routes/ingredientSubstitution.route.js";
import mealPlannerRoutes from "./routes/mealPlanner.route.js";
import mealProfileRoutes from "./src/routes/mealProfile.routes.js";


// ============================================
// AUTH & DATABASE
// ============================================

import { auth } from "./src/lib/auth.js";
import { prisma } from "./src/lib/prisma.js";

// ============================================
// SERVICES
// ============================================

import { analyzeMeal } from "./src/services/meal-analyze.service.js";
import { trackAiUsage } from "./src/services/ai-usage.service.js";
import { NotificationService } from "./src/services/notification.service.js";

// ============================================
// EXISTING ROUTES
// ============================================

import recipeRoutes from "./src/recipe/recipe.routes.js";
import userRoutes from "./src/routes/user.routes.js";
import communityRoutes from "./src/community/community.routes.js";
import recipeMatcherRoute from "./routes/recipeMatcher.route.js";
import pantryRoutes from "./routes/pantryRoutes.js";
import challengeRoutes from "./src/routes/challenge.routes.js";
import shoppingListRoutes from "./src/shopping-list/shoppingList.routes.js";
import adminUserRoutes from "./routes/admin-user.route.js";
import aiChatRoutes from "./routes/ai-chat.routes.js";
import recipeAiRoutes from "./src/routes/recipe-ai.routes.js";
import dashboardRoutes from "./routes/dashboard.route.js";
import adminRoutes from "./routes/admin.route.js";

// ============================================
// ADMIN & AI ROUTES
// ============================================
import wellnessRouter from "./src/routes/wellness.routes.js";
import { aiUsageRouter } from "./src/routes/ai-usage.routes.js";
import aiNutritionistRoutes from "./routes/ai-nutritionist.routes.js";
import notificationRoutes from "./src/routes/notification.routes.js";
import cronRoutes from "./src/routes/cron.routes.js";

// old human nutritionist imports removed
const app = express();
const PORT = process.env.PORT || 5000;

const configuredClientOrigins = [
  process.env.FRONTEND_URL,
  process.env.CLIENT_URL,
  process.env.NEXT_PUBLIC_APP_URL,
]
  .flatMap((value) => value?.split(",") ?? [])
  .map((value) => value.trim().replace(/\/$/, ""))
  .filter(Boolean);

const allowedClientOrigins = Array.from(new Set([
  "http://localhost:3000",
  "http://localhost:5000",
  "https://food-canvas.vercel.app",
  "https://food-canvas-server.vercel.app", // server-side getServerSession() calls come from here
  ...configuredClientOrigins,
]));

const upload = multer({
  storage: multer.memoryStorage(),
});

// ============================================
app.use(
  cors({
    origin: allowedClientOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Cookie",
      "Origin",
      "X-Requested-With",
      "Accept",
    ],
    exposedHeaders: ["Set-Cookie"],
  })
);

// ============================================
// BETTER AUTH
// IMPORTANT: Keep this BEFORE express.json()
// ============================================

app.use((req, res, next) => {
  if (req.path.startsWith("/api/auth")) {
    return toNodeHandler(auth)(req, res);
  }
  next();
});

// ============================================
// BODY PARSERS
// ============================================

app.use(express.json({ limit: "10mb" }));

// ============================================
// AUTH MIDDLEWARE
// ============================================
const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }).catch(() => null);
    if (!session?.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized. Please log in." });
    }
    // Attach user id for downstream use
    (req as any).user = session.user;

    // Record activity for meaningful actions (skip generic page loads/GETs and internal/admin routes)
    const ignoredPaths = ["/api/auth", "/api/cron", "/api/admin", "/api/dashboard", "/api/notifications"];
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      const isMeaningful = !ignoredPaths.some(p => req.originalUrl.startsWith(p));
      if (isMeaningful) {
        // Use the imported trackActivity function? No, we imported trackActivity but we can just use the underlying service
        import("./src/lib/activity.js").then(({ recordUserActivity }) => {
          recordUserActivity(session.user.id).catch(err => console.error("Activity track error:", err));
        }).catch(console.error);
      }
    }

    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Unauthorized." });
  }
};

// ============================================
// COMMUNITY
// ============================================

app.use("/api/community", communityRoutes);
app.use("/api/wellness-reminders", wellnessRouter);
app.use("/api/ai-usage", aiUsageRouter);
app.use("/api/ai-nutritionist", aiNutritionistRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/cron", cronRoutes);


// ============================================
// MEAL ANALYSIS
// ============================================


//================================
// nutrionist routes removed in favor of ai-nutritionist
//==================================


app.post(
  "/api/meals/analyze",
  upload.single("image"),
  async (req, res) => {
    try {
      console.log("[MEAL AI DIAGNOSTIC] POST /api/meals/analyze started");
      
      // 1. Validate Image
      console.log("[MEAL AI DIAGNOSTIC] Received file:", !!req.file);
      if (!req.file) {
        console.warn("[MEAL AI DIAGNOSTIC] No file uploaded");
        return res.status(422).json({
          success: false,
          message: "Meal image is required",
        });
      }
      console.log(`[MEAL AI DIAGNOSTIC] File MIME type: ${req.file.mimetype}, size: ${req.file.size} bytes`);

      // 2. Authenticate user
      let userId: string | undefined;
      console.log("[MEAL AI DIAGNOSTIC] Authenticating...");
      try {
        const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
        if (session?.user?.id) userId = session.user.id;
      } catch (error) {
        console.warn("[MEAL AI DIAGNOSTIC] Auth session retrieval failed:", error);
      }

      console.log("[MEAL AI DIAGNOSTIC] Authenticated:", !!userId);
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized - Please log in to analyze meals",
        });
      }

      // 3. Get localDate
      const localDate = req.body.localDate || new Date().toISOString().split("T")[0];

      // 4. Analyze Meal
      console.log("[MEAL AI DIAGNOSTIC] Calling analyzeMeal service...");
      const result = await analyzeMeal({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
      });
      console.log("[MEAL AI DIAGNOSTIC] analyzeMeal completed successfully");

      if (!result.success || !result.isFood) {
        console.log("[MEAL AI DIAGNOSTIC] Not food or unsuccessful extraction");
        return res.status(200).json(result);
      }

      // 5. Track AI Usage
      await trackAiUsage("PHOTOS", userId);

      // 6. Save to DB
      if (result.calories !== undefined) {
        console.log("[MEAL AI DIAGNOSTIC] Prisma save started");
        
        const protein = result.macros?.find((m: any) => m.label.toLowerCase() === "protein")?.grams || 0;
        const carbs = result.macros?.find((m: any) => m.label.toLowerCase() === "carbs")?.grams || 0;
        const fat = result.macros?.find((m: any) => m.label.toLowerCase() === "fat")?.grams || 0;

        try {
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
          
          result.mealId = savedMeal.id;
          console.log("[MEAL AI DIAGNOSTIC] Prisma save succeeded, ID:", savedMeal.id);
          
          await NotificationService.createNotification({
            userId,
            type: "MEAL_ANALYSIS_SUCCESS",
            title: "Meal Analyzed",
            message: "Your meal photo has been successfully analyzed.",
            actionUrl: "/ai-tools/nutrition-analyzer",
          });
        } catch (dbError: any) {
          console.error("[MEAL AI DIAGNOSTIC] Prisma save failed:", dbError.message || dbError);
          // Return 500 for DB failure, but don't mask it as an AI failure
          return res.status(500).json({
            success: false,
            message: "Meal was analyzed but failed to save to database",
            error: "DATABASE_ERROR"
          });
        }
      }

      console.log("[MEAL AI DIAGNOSTIC] Request fully processed, returning 200");
      return res.status(200).json(result);

    } catch (error: any) {
      console.error("[MEAL AI DIAGNOSTIC] Unhandled Exception:", error);
      
      const errMsg = error.message || String(error);
      let statusCode = error.status || 500;
      
      if (errMsg.includes("temporarily unavailable") || errMsg.includes("503")) {
        statusCode = 503;
      } else if (errMsg.includes("rate limit") || errMsg.includes("429")) {
        statusCode = 429;
      } else if (errMsg.includes("configured") || errMsg.includes("empty response")) {
        statusCode = 502; // Bad Gateway / config error
      }

      return res.status(statusCode).json({
        success: false,
        message: statusCode === 503 ? "Meal analysis is temporarily unavailable. Please try again in a moment." : "Failed to analyze meal image",
        error: errMsg,
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

app.use("/api/pantry-to-plate", requireAuth, pantryRoutes);

// ============================================
// INGREDIENT SUBSTITUTION ROUTES
// ============================================

app.use("/api/ingredient-substitution", requireAuth, ingredientSubstitutionRoutes);

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
// SMART SHOPPING LIST ROUTES
// ============================================

app.use("/api/shopping-list", shoppingListRoutes);

// ============================================
// RECIPE MATCHER AI & PANTRY
// ============================================

app.use("/api", requireAuth, recipeMatcherRoute);
app.use("/api/pantry-to-plate", pantryRoutes);

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
app.use("/api", requireAuth, aiChatRoutes);
app.use("/api/recipe-ai", requireAuth, recipeAiRoutes);

// ─────────────────────────────────────────────────────────────────────────────
// 16. Dashboard Analytics Routes
// ─────────────────────────────────────────────────────────────────────────────
app.use("/api/dashboard", dashboardRoutes);

// ============================================
// LOCAL SERVER
// ============================================




if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
  });
}

// ============================================
// GLOBAL ERROR HANDLER
// ============================================

app.use((req, res, next) => {
  res.status(404).json({ error: "Not Found" });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global Error:", err);
  res.status(500).json({ error: "Internal Server Error", message: err.message });
});

export default app;
