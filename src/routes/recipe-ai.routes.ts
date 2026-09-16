import { Router } from "express";
import { handleRecipeChat } from "../controllers/recipe-ai.controller.js";

const router = Router();

router.post("/chat", handleRecipeChat);

export default router;
