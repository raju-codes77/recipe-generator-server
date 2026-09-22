// src/routes/pantryRoutes.ts
import { Router } from "express";
import { generate, refine, saveGeneratedRecipe } from "../src/controllers/pantryController.js";

const router = Router();

router.post("/generate", generate);
router.post("/refine", refine);
router.post("/save", saveGeneratedRecipe);

export default router;
