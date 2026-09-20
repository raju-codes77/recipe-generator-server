import { Request, Response } from "express";
import { z } from "zod";
import { generateRecipe, refineRecipe } from "../services/groqService.js";
import { prisma } from "../lib/prisma.js";
import { auth } from "../lib/auth.js";
import { fromNodeHeaders } from "better-auth/node";
import { trackAiUsage } from "../services/ai-usage.service.js";
import { requireCommunityUser } from "../community/community.auth.js";

const generateSchema = z.object({
  ingredients: z.array(z.string()).min(1),
  cuisine: z.string(),
  mealType: z.string(),
  cookingTime: z.string(),
  diet: z.string(),
  servings: z.string(),
  selectedOptions: z.array(z.string()).default([]),
});

const GENERATED_RECIPE_IMAGE = "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1200&q=80";

export async function generate(req: Request, res: Response) {
  try {
    const input = generateSchema.parse(req.body);
    const recipe = await generateRecipe(input);

    let userId: string | undefined;
    try {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      userId = session?.user?.id;
    } catch (e) {}

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
        userId: userId,
      },
    });

    if (userId) {
      await trackAiUsage("RECIPES", userId);
    }

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

function parseNumber(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function saveGeneratedRecipe(req: Request, res: Response) {
  try {
    const user = await requireCommunityUser(req);
    const recipeId = z.object({ id: z.string().min(1) }).parse(req.body).id;
    const generated = await prisma.pantryRecipe.findUnique({ where: { id: recipeId } });

    if (!generated) {
      return res.status(404).json({ message: "Generated recipe not found" });
    }

    const recipe = await prisma.$transaction(async (tx) => {
      const existing = await tx.recipe.findUnique({ where: { mealId: generated.id } });
      const persisted = existing ?? await tx.recipe.create({
        data: {
          mealId: generated.id,
          title: generated.title,
          category: generated.mealType,
          cuisine: generated.cuisine,
          time: parseNumber(generated.time, 30),
          calories: parseNumber(generated.kcal, 400),
          image: generated.image,
          instructions: (generated.instructions as string[]).join("\n"),
          userId: user.id,
          ingredients: {
            create: (generated.ingredients as string[]).map((ingredient) => ({ name: ingredient })),
          },
        },
        include: { ingredients: true },
      });

      if (persisted.userId !== user.id) {
        throw Object.assign(new Error("You cannot save this recipe"), { statusCode: 403 });
      }

      await tx.favorite.upsert({
        where: { userId_recipeId: { userId: user.id, recipeId: persisted.id } },
        update: {},
        create: { userId: user.id, recipeId: persisted.id },
      });

      const communityPost = await tx.communityPost.findFirst({
        where: { authorId: user.id, recipeId: persisted.id },
        select: { id: true },
      });
      const post = communityPost ?? await tx.communityPost.create({
        data: {
          authorId: user.id,
          caption: generated.description || generated.title,
          imageUrl: generated.image || GENERATED_RECIPE_IMAGE,
          recipeId: persisted.id,
          tags: ["AI Generated", "Ingredient Rescue"],
        },
        select: { id: true },
      });

      await tx.communitySavedPost.upsert({
        where: { postId_userId: { postId: post.id, userId: user.id } },
        update: {},
        create: { postId: post.id, userId: user.id },
      });

      return { persisted, communityPostId: post.id };
    });

    return res.status(200).json({
      success: true,
      message: "Recipe saved to your profile",
      recipe: recipe.persisted,
      communityPostId: recipe.communityPostId,
    });
  } catch (error: any) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }

    console.error("Save generated recipe error:", error);
    return res.status(400).json({
      success: false,
      message: error?.message || "Failed to save recipe",
    });
  }
}
