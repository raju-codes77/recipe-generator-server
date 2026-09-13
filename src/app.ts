import express, { Application } from "express";
import cors from "cors";
import dotenv from "dotenv";

// existing routes (আপনার প্রজেক্টে যা যা আগে থেকে আছে, সেগুলো এখানে বসান)
// import authRoutes from "./routes/authRoutes";
// import communityRoutes from "./routes/communityRoutes";
// import recipeRoutes from "./routes/recipeRoutes";

// নতুন pantry-to-plate route
import pantryRoutes from "../routes/pantryRoutes";

dotenv.config();

const app: Application = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Existing routes (আপনার আগের যা ছিল সেগুলো এখানে uncomment/বসান)
// app.use("/api/auth", authRoutes);
// app.use("/api/community", communityRoutes);
// app.use("/api/recipes", recipeRoutes);

// নতুন route
app.use("/api/pantry-to-plate", pantryRoutes);

// Health check
app.get("/", (_req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

export default app;