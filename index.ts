import "dotenv/config";
import express from "express";
import cors from "cors";
import recipeMatcherRoute from "./routes/recipeMatcher.route";
import dotenv from "dotenv";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./src/lib/auth";
import { prisma } from "./src/lib/prisma";
import multer from "multer";
import { analyzeMeal } from "./src/services/meal-analyze.service";

// Import Recipe Routes
import recipeRoutes from "./src/recipe/recipe.routes";
import userRoutes from "./src/routes/user.routes";
import communityRoutes from "./src/community/community.routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const upload = multer({ storage: multer.memoryStorage() });

// Middleware
app.use("/api/community", express.json({ limit: "10mb" }));
app.use(express.json());
// cors
app.use(
  cors({
    origin: ["http://localhost:3000", "https://food-canvas.vercel.app"],
    credentials: true,
  })
);

// Better Auth MUST come before express.json()
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
      // Check if image was uploaded
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Meal image is required",
        });
      }

      // Send image to Gemini for food analysis
      const result = await analyzeMeal({
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
      });

      // Return analysis result to client
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

app.get("/", (req, res) => {
  res.send("Server is running");
});

//  MOUNT RECIPE & RELATED ROUTES 
app.use("/api", recipeRoutes);

// DB Test
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

// Recipe matcher AI routes â†’ mounted under /api
app.use("/api/users", userRoutes);
app.use("/api", recipeMatcherRoute);

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
  });
}

module.exports = app;
