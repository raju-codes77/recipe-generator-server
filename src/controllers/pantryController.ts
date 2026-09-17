import { Request, Response } from "express";
import { z } from "zod";
import { generateRecipe, refineRecipe } from "../services/groqService.js";
import { prisma } from "../lib/prisma.js";
import { auth } from "../lib/auth.js";
import { fromNodeHeaders } from "better-auth/node";
import { trackAiUsage } from "../services/ai-usage.service.js";

const generateSchema = z.object({
  ingredients: z.array(z.string()).min(1),
  cuisine: z.string(),
  mealType: z.string(),
  cookingTime: z.string(),
  diet: z.string(),
  servings: z.string(),
  selectedOptions: z.array(z.string()).default([]),
});

export async function generate(req: Request, res: Response) {
  try {
    const input = generateSchema.parse(req.body);
    const recipe = await generateRecipe(input);

    const saved = await prisma.pantryRecipe.create({
      data: {
        title: recipe.title,
        description: recipe.description,
        image: recipe.image,
        time: recipe.time,
        level: recipe.level,
        kcal: recipe.kcal,
        protein: recipe.protein,
        whyChosen: recipe.whyChosen,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
        cuisine: input.cuisine,
        mealType: input.mealType,
        cookingTime: input.cookingTime,
        diet: input.diet,
        servings: input.servings,
        selectedOptions: input.selectedOptions,
      },
    });

    try {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      await trackAiUsage("RECIPES", session?.user?.id);
    } catch (e) {}

    return res.status(200).json({
      id: saved.id,
      recipeId: saved.id,
      title: saved.title,
      description: saved.description,
      image: saved.image,
      time: saved.time,
      level: saved.level,
      kcal: saved.kcal,
      protein: saved.protein,
      whyChosen: saved.whyChosen,
      ingredients: saved.ingredients,
      instructions: saved.instructions,
    });
  } catch (error: any) {
    console.error("generate error:", error);
    return res.status(400).json({ message: error?.message || "Failed to generate recipe" });
  }
}

const refineSchema = z.object({
  id: z.string(),
  refinement: z.string(),
});

export async function refine(req: Request, res: Response) {
  try {
    const { id, refinement } = refineSchema.parse(req.body);

    const existing = await prisma.pantryRecipe.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Recipe not found" });

    const updated = await refineRecipe(
      {
        title: existing.title,
        description: existing.description,
        image: existing.image,
        time: existing.time,
        level: existing.level,
        kcal: existing.kcal,
        protein: existing.protein,
        whyChosen: existing.whyChosen,
        ingredients: existing.ingredients as string[],
        instructions: existing.instructions as string[],
      },
      refinement
    );

    const saved = await prisma.pantryRecipe.update({
      where: { id },
      data: {
        title: updated.title,
        description: updated.description,
        image: updated.image,
        time: updated.time,
        level: updated.level,
        kcal: updated.kcal,
        protein: updated.protein,
        whyChosen: updated.whyChosen,
        ingredients: updated.ingredients,
        instructions: updated.instructions,
      },
    });

    try {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      await trackAiUsage("RECIPES", session?.user?.id);
    } catch (e) {}

    return res.status(200).json({
      id: saved.id,
      recipeId: saved.id,
      title: saved.title,
      description: saved.description,
      image: saved.image,
      time: saved.time,
      level: saved.level,
      kcal: saved.kcal,
      protein: saved.protein,
      whyChosen: saved.whyChosen,
      ingredients: saved.ingredients,
      instructions: saved.instructions,
    });
  } catch (error: any) {
    console.error("refine error:", error);
    return res.status(400).json({ message: error?.message || "Failed to refine recipe" });
  }
}