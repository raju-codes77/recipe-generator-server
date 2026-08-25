import "dotenv/config";
import express from "express";
import cors from "cors";
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import recipeMatcherRoute from "./routes/recipeMatcher.route";

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors());

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});

app.get("/", (req, res) => {
  res.send("Server is running");
});

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

// Recipe matcher AI routes → mounted under /api
app.use("/api", recipeMatcherRoute);

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});