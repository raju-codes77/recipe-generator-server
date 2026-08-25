import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./src/lib/auth";
import { prisma } from "./src/lib/prisma";

// Import Recipe Routes
import recipeRoutes from "./src/recipe/recipe.routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// cors
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

// Better Auth MUST come before express.json()
app.all("/api/auth/*splat", toNodeHandler(auth));

// Other routes
app.use(express.json());

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

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});