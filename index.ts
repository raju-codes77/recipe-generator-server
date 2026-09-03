import "dotenv/config";
import express from "express";
import cors from "cors";
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import recipeMatcherRoute from "./routes/recipeMatcher.route";
import dotenv from "dotenv";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./src/lib/auth";
import { prisma } from "./src/lib/prisma";
import multer from "multer";
import { analyzeMeal } from "./src/services/meal-analyze.service";
import { GoogleGenAI } from "@google/genai";

// Import Recipe Routes
import recipeRoutes from "./src/recipe/recipe.routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const upload = multer({ storage: multer.memoryStorage() });

// Gemini Client Initialization using GEMINI_API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Middleware
app.use(express.json());
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

app.get("/", (req, res) => {
  res.send("Server is running");
});

// MOUNT RECIPE & RELATED ROUTES 
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

// Recipe matcher AI routes → mounted under /api
app.use("/api", recipeMatcherRoute);

// ================= AI CHATBOT ROUTE (GEMINI) =================

// ================= AI CHATBOT ROUTE (GEMINI) =================
app.post('/api/chat', async (req, res) => {
  try {
    const { message, prompt } = req.body;
    const userMessage = message || prompt;

    if (!userMessage) {
      return res.status(400).json({ success: false, message: "Message is required." });
    }

    await prisma.chatMessage.create({
      data: {
        role: "user",
        content: userMessage.trim(),
      },
    });

    // ১. তোর ওয়েবসাইটের পেজ এবং ফিচারের একটা গাইডলাইন বা ম্যাপ তৈরি করো
    const siteMapContext = `
    You are FoodCanvas's AI Assistant. Your job is to help users navigate the website and find features.
    Here is a map of the website pages and what they contain:
    - AI Recipe Generator (/dashboard/users/ai-recipe): Create recipes using ingredients available at home.
    - Nutrition Insights (/dashboard/users/nutrition): Track daily calorie intake and nutritional metrics.
    - Foodie Community (/dashboard/users/community): Share meals, get inspiration, and connect with other food lovers.
    - User Dashboard (/dashboard/users): General overview for regular users.
    - Admin Dashboard (/dashboard/admin): Management panel restricted to administrators.

    Always guide users nicely, tell them what is on each page, and provide direct paths/links when they ask where to find something. Be helpful, warm, and concise.
    `;

    // ২. জেমিনিকে সিস্টেম ইনস্ট্রাকশনসহ প্রম্পট পাঠানো
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        { role: 'user', parts: [{ text: siteMapContext }] }, // গাইডলাইন আগে ধরিয়ে দেওয়া হলো
        { role: 'user', parts: [{ text: userMessage.trim() }] } // ইউজারের আসল মেসেজ
      ],
    });

    const reply = response.text || "I couldn't process that query.";

    await prisma.chatMessage.create({
      data: {
        role: "assistant",
        content: reply,
      },
    });

    return res.json({ success: true, reply });
  } catch (error: any) {
    console.error("AI Chat Error:", error);
    return res.status(500).json({ success: false, reply: "AI core transmission failure. Try again." });
  }
});

// ================= 1. GET ALL USERS (Admin Only) =================
app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, users });
  } catch (error) {
    console.error("Fetch Users Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch users." });
  }
});

// ================= 2. UPDATE USER STATUS (Suspend / Activate) =================
app.patch('/api/admin/users/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // "ACTIVE" বা "SUSPENDED"

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { status },
    });

    return res.json({ success: true, message: `User status updated to ${status}`, updatedUser });
  } catch (error) {
    console.error("Update Status Error:", error);
    return res.status(500).json({ success: false, message: "Failed to update user status." });
  }
});

// ================= 3. DELETE USER =================
app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.user.delete({
      where: { id },
    });

    return res.json({ success: true, message: "User deleted successfully." });
  } catch (error) {
    console.error("Delete User Error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete user." });
  }
});


app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});