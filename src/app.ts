import express from "express";
import cors from "cors";
// ... onno import gula (better-auth etc.)
import pantryToPlateRoutes from "./ai-features/pantry-to-plate/pantryToPlate.routes"; // 👈 notun line

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
}));
app.use(express.json());

// ... existing routes/middleware (auth etc.) ...

app.use(pantryToPlateRoutes); // 👈 notun line, existing route gular niche

// ... app.listen(...) etc.