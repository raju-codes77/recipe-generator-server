// src/routes/pantryRoutes.ts
import { Router } from "express";
import { generate, refine } from "../src/controllers/pantryController";

const router = Router();

router.post("/generate", generate);
router.post("/refine", refine);

export default router;