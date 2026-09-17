import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { generateRecipeChatResponse, RecipeContext } from "../services/recipe-ai.service.js";

export const handleRecipeChat = async (req: Request, res: Response) => {
  try {
    const { recipeId, message, history = [] } = req.body;
    const userId = (req as any).user?.id || req.body.userId; // adjust based on auth middleware

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!recipeId || !message) {
      return res.status(400).json({ success: false, message: "Missing recipeId or message" });
    }

    // 1. Fetch recipe from DB to ensure context accuracy and prevent client-side spoofing
    const recipe = await prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        ingredients: true,
      },
    });

    if (!recipe) {
      return res.status(404).json({ success: false, message: "Recipe not found" });
    }

    const recipeContext: RecipeContext = {
      id: recipe.id,
      title: recipe.title,
      cuisine: recipe.cuisine || undefined,
      category: recipe.category || undefined,
      time: recipe.time,
      calories: recipe.calories,
      instructions: recipe.instructions || "",
      ingredients: recipe.ingredients,
    };

    // 2. Generate response using service
    const responseText = await generateRecipeChatResponse(recipeContext, history, message);

    return res.status(200).json({
      success: true,
      message: responseText
    });
  } catch (error: any) {
    console.error("Recipe AI Chat Error:", error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || "Something went wrong" 
    });
  }
};
