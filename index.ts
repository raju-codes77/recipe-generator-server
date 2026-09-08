import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { toNodeHandler } from "better-auth/node";

import { auth } from "./src/lib/auth.js";
import { prisma } from "./src/lib/prisma.js";
import { analyzeMeal } from "./src/services/meal-analyze.service.js";

import recipeRoutes from "./src/recipe/recipe.routes.js";
import userRoutes from "./src/routes/user.routes.js";
import communityRoutes from "./src/community/community.routes.js";
import recipeMatcherRoute from "./routes/recipeMatcher.route.js";
import pantryRoutes from "./routes/pantryRoutes.js";

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

      const result = await analyzeMeal({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
      });

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
// RECIPE MATCHER AI
// ============================================

app.use("/api", recipeMatcherRoute);

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