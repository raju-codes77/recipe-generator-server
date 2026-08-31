import "dotenv/config";
import express from "express";
import cors from "cors";
<<<<<<< ours
import recipeMatcherRoute from "./routes/recipeMatcher.route";
import dotenv from "dotenv";
=======
>>>>>>> theirs
import { toNodeHandler } from "better-auth/node";
import dotenv from "dotenv";
import multer from "multer";

import recipeMatcherRoute from "./routes/recipeMatcher.route";
import { auth } from "./src/lib/auth";
import { prisma } from "./src/lib/prisma";
import { analyzeMeal } from "./src/services/meal-analyze.service";

// Import Recipe Routes
import recipeRoutes from "./src/recipe/recipe.routes";
import userRoutes from "./src/routes/user.routes";
import communityRoutes from "./src/community/community.routes";

// Import Pantry-to-Plate Routes
import pantryRoutes from "./routes/pantryRoutes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const upload = multer({
  storage: multer.memoryStorage(),
});

// Middleware
app.use("/api/community", express.json({ limit: "10mb" }));
app.use(express.json());

app.use(
  cors({
    origin: ["http://localhost:3000", "https://food-canvas.vercel.app"],
    credentials: true,
  })
);

// Better Auth
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use("/api/community", communityRoutes);

// Other routes
app.use(express.json());

// ================= MEAL ANALYSIS ROUTE =================

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

// Health check
app.get("/", (req, res) => {
  res.send("Server is running");
});

// ================= ROUTES =================

// Recipe routes
app.use("/api", recipeRoutes);

// Pantry-to-Plate routes
app.use("/api/pantry-to-plate", pantryRoutes);

// Recipe matcher AI routes
app.use("/api", recipeMatcherRoute);

// ================= DB TEST =================

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

<<<<<<< HEAD
// Recipe matcher AI routes â†’ mounted under /api
app.use("/api/users", userRoutes);
app.use("/api", recipeMatcherRoute);
=======
// ================= SERVER =================
>>>>>>> cd60544 (add plant ai or nutrition analizer server site)

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
  });
}

module.exports = app;
