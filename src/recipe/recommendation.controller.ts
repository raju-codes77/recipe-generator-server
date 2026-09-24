import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { getOptionalCommunityUser } from "../community/community.auth.js";

export const RecommendationController = {
  async getRecommendations(req: Request, res: Response) {
    try {
      const user = await getOptionalCommunityUser(req);
      
      const { limit = "10", contextRecipeId } = req.query;
      const take = parseInt(String(limit), 10) || 10;
      
      let personalized = false;
      let recommendedReason = "Explore popular recipes";
      let topCuisine = "";
      let topCategory = "";
      
      const favoritedRecipeIds = new Set<string>();

      if (user?.id) {
        // Fetch independent preference sources concurrently and only load fields used by ranking.
        const [favorites, collections, tasteProfile] = await Promise.all([
          prisma.favorite.findMany({
            where: { userId: user.id },
            select: {
              recipeId: true,
              recipe: { select: { cuisine: true, category: true } },
            },
          }),
          prisma.collection.findMany({
            where: { userId: user.id },
            select: {
              recipes: {
                select: {
                  recipeId: true,
                  recipe: { select: { cuisine: true, category: true } },
                },
              },
            },
          }),
          prisma.tasteProfile.findUnique({
            where: { userId: user.id },
            select: { preferredCuisines: true },
          }),
        ]);

        favorites.forEach(f => favoritedRecipeIds.add(f.recipeId));

        collections.forEach(c => {
          c.recipes.forEach(cr => favoritedRecipeIds.add(cr.recipeId));
        });

        // 2. Build frequency maps
        const cuisineFreq: Record<string, number> = {};
        const categoryFreq: Record<string, number> = {};

        // Helper to count
        const addCount = (map: Record<string, number>, key?: string | null) => {
          if (!key) return;
          const k = key.trim().toLowerCase();
          if (k) map[k] = (map[k] || 0) + 1;
        };

        favorites.forEach(f => {
          addCount(cuisineFreq, f.recipe.cuisine);
          addCount(categoryFreq, f.recipe.category);
        });

        collections.forEach(c => {
          c.recipes.forEach(cr => {
            addCount(cuisineFreq, cr.recipe.cuisine);
            addCount(categoryFreq, cr.recipe.category);
          });
        });
        
        // Add explicit taste profile preferences (weight them highly)
        tasteProfile?.preferredCuisines.forEach(c => {
          const k = c.trim().toLowerCase();
          if (k) cuisineFreq[k] = (cuisineFreq[k] || 0) + 5;
        });

        // 3. Find top preferences
        const getTop = (map: Record<string, number>) => {
          return Object.entries(map).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
        };

        topCuisine = getTop(cuisineFreq);
        topCategory = getTop(categoryFreq);

        if (topCuisine || topCategory) {
          personalized = true;
          if (topCuisine && topCategory) {
            recommendedReason = `Because you like ${topCuisine} and ${topCategory} recipes`;
          } else if (topCuisine) {
            recommendedReason = `Because you enjoy ${topCuisine} cuisine`;
          } else if (topCategory) {
            recommendedReason = `Because you like ${topCategory} recipes`;
          }
        }
      }

      // If contextRecipeId is provided (e.g. from Recipe Details page), exclude it
      if (contextRecipeId && typeof contextRecipeId === "string") {
        favoritedRecipeIds.add(contextRecipeId);
      }

      let contextRecipe = null;
      if (contextRecipeId && typeof contextRecipeId === "string") {
         contextRecipe = await prisma.recipe.findUnique({ where: { id: contextRecipeId } });
      }

      // 4. Fetch candidate recipes
      // For simplicity in this engine, we fetch a broad set of highly-rated recipes 
      // to score them, and sort.
      const candidateRecipes = await prisma.recipe.findMany({
        where: {
          id: { notIn: Array.from(favoritedRecipeIds) },
        },
        select: {
          id: true,
          title: true,
          image: true,
          rating: true,
          time: true,
          calories: true,
          cuisine: true,
          category: true,
        },
        take: 100, // fetch up to 100 candidates to score
        orderBy: { rating: 'desc' }
      });

      // 5. Score candidates
      const scoredRecipes = candidateRecipes.map(recipe => {
        let score = (recipe.rating || 4) / 5 * 0.3; // Base score (0 to 0.3)
        
        if (personalized) {
          const recCuisine = recipe.cuisine?.trim().toLowerCase() || "";
          const recCategory = recipe.category?.trim().toLowerCase() || "";

          if (topCuisine && recCuisine === topCuisine) score += 0.4;
          if (topCategory && recCategory === topCategory) score += 0.3;
        }

        // Contextual boost (if viewed from a recipe details page)
        if (contextRecipe) {
           const ctxCuisine = contextRecipe.cuisine?.trim().toLowerCase() || "";
           const ctxCategory = contextRecipe.category?.trim().toLowerCase() || "";
           const recCuisine = recipe.cuisine?.trim().toLowerCase() || "";
           const recCategory = recipe.category?.trim().toLowerCase() || "";

           if (ctxCuisine && recCuisine === ctxCuisine) score += 0.2;
           if (ctxCategory && recCategory === ctxCategory) score += 0.2;
        }

        return { ...recipe, _recommendationScore: score };
      });

      // 6. Sort by score
      scoredRecipes.sort((a, b) => b._recommendationScore - a._recommendationScore);

      const finalRecommendations = scoredRecipes.slice(0, take);

      return res.status(200).json({
        success: true,
        data: {
          recommendations: finalRecommendations.map(({ _recommendationScore, ...r }) => r),
          personalized,
          reason: recommendedReason,
        },
      });

    } catch (error: any) {
      console.error("Recommendation Engine Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to generate recommendations",
        error: error.message,
      });
    }
  }
};
