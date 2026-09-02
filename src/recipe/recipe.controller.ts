import { Request, Response } from "express";
import { RecipeService } from "./recipe.service";

export const RecipeController = {
  // Recipes Get Handler
  async getRecipes(req: Request, res: Response) {
    try {
      // 1. 'limit' add 
      const { search, category, cuisine, maxTime, maxCalories, minRating, sortBy, tab, userId, excludeId, limit } = req.query;

      const count = await RecipeService.getRecipeCount();
      if (count === 0) {
        const externalRes = await fetch("https://www.themealdb.com/api/json/v1/1/search.php?s=chicken");
        const externalData: any = await externalRes.json();

        if (externalData.meals) {
          await RecipeService.seedExternalRecipes(externalData.meals);
        }
      }

      const conditions: any[] = [];

      if (tab === "my-recipes") {
        if (!userId) {
          return res.status(400).json({ success: false, message: "UserId is required for My Recipes" });
        }
        conditions.push({ userId: String(userId) });
      }
      else if (tab === "favorites") {
        if (!userId) {
          return res.status(400).json({ success: false, message: "UserId is required for Favorites" });
        }
        const userFavorites = await RecipeService.getUserFavorites(String(userId));
        const favoriteRecipeIds = userFavorites.map((fav) => fav.recipeId);
        conditions.push({ id: { in: favoriteRecipeIds } });
      }
      else if (tab === "collections") {
        if (!userId) {
          return res.status(400).json({ success: false, message: "UserId is required for Collections" });
        }
        const userCollections = await RecipeService.getUserCollections(String(userId));
        const collectionRecipeIds = userCollections.flatMap((col) =>
          col.recipes.map((r) => r.recipeId)
        );
        conditions.push({ id: { in: collectionRecipeIds } });
      }

      if (search) {
        conditions.push({
          OR: [
            { title: { contains: String(search), mode: "insensitive" } },
            {
              ingredients: {
                some: {
                  name: { contains: String(search), mode: "insensitive" },
                },
              },
            },
          ],
        });
      }

      if (category && category !== "All") {
        conditions.push({ 
          category: { 
            equals: String(category).trim(), 
            mode: "insensitive" 
          } 
        });
      }

      if (cuisine && cuisine !== "All") {
        conditions.push({ cuisine: { equals: String(cuisine), mode: "insensitive" } });
      }

      if (maxTime) conditions.push({ time: { lte: Number(maxTime) } });
      if (maxCalories) conditions.push({ calories: { lte: Number(maxCalories) } });
      if (minRating) conditions.push({ rating: { gte: Number(minRating) } });

      if (excludeId) {
        conditions.push({ id: { not: String(excludeId) } });
      }

      const whereClause = conditions.length > 0 ? { AND: conditions } : {};

      let sortOrder: "asc" | "desc" = "desc";
      let sortByField = "createdAt";

      if (sortBy === "Top Rated") {
        sortByField = "rating";
        sortOrder = "desc";
      } else if (sortBy === "Quickest") {
        sortByField = "time";
        sortOrder = "asc";
      }

      const orderByObj: any = {};
      orderByObj[sortByField] = sortOrder;

      // 2.  findRecipes-e limit 
      const recipes = await RecipeService.findRecipes(
        whereClause, 
        orderByObj, 
        limit ? Number(limit) : undefined
      );

      res.json({
        success: true,
        count: recipes.length,
        recipes,
      });

    } catch (error: any) {
      console.error("API Error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch recipes",
        error: error.message,
      });
    }
  },
  // Single Recipe Get Handler 
  async getRecipeById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const recipe = await RecipeService.findRecipeById(String(id));

      if (!recipe) {
        return res.status(404).json({
          success: false,
          message: "Recipe not found",
        });
      }

      res.status(200).json({
        success: true,
        recipe,
      });
    } catch (error: any) {
      console.error("Error fetching recipe by id:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  // Favorites Controllers
  async checkFavorite(req: Request, res: Response) {
    try {
      const { userId, recipeId } = req.query;
      if (!userId || !recipeId) {
        return res.status(400).json({ success: false, message: "userId and recipeId are required" });
      }

      const favorite = await RecipeService.checkFavorite(String(userId), String(recipeId));
      res.json({ success: true, isFavorite: !!favorite });
    } catch (error: any) {
      console.error("Check Favorite Error:", error);
      res.status(500).json({ success: false, message: "Failed to check favorite" });
    }
  },

  async addFavorite(req: Request, res: Response) {
    try {
      const { userId, recipeId } = req.body;
      if (!userId || !recipeId) {
        return res.status(400).json({ success: false, message: "userId and recipeId are required" });
      }

      const favorite = await RecipeService.addFavorite(String(userId), String(recipeId));
      res.status(201).json({ success: true, message: "Recipe added to favorites", favorite });
    } catch (error: any) {
      if (error.code === "P2002") {
        return res.status(409).json({ success: false, message: "Recipe already in favorites" });
      }
      console.error("Add Favorite Error:", error);
      res.status(500).json({ success: false, message: "Failed to add favorite", error: error.message });
    }
  },

  async removeFavorite(req: Request, res: Response) {
    try {
      const { userId, recipeId } = req.body;
      if (!userId || !recipeId) {
        return res.status(400).json({ success: false, message: "userId and recipeId are required" });
      }

      await RecipeService.removeFavorite(String(userId), String(recipeId));
      res.json({ success: true, message: "Recipe removed from favorites" });
    } catch (error: any) {
      console.error("Remove Favorite Error:", error);
      res.status(500).json({ success: false, message: "Failed to remove favorite", error: error.message });
    }
  },

  // Collections Controllers
  async getCollections(req: Request, res: Response) {
    try {
      const { userId } = req.query;
      if (!userId) {
        return res.status(400).json({ success: false, message: "UserId is required" });
      }

      const collections = await RecipeService.getCollections(String(userId));
      res.json({ success: true, collections });
    } catch (error: any) {
      console.error("Get Collections Error:", error);
      res.status(500).json({ success: false, message: "Failed to fetch collections", error: error.message });
    }
  },

  async createCollection(req: Request, res: Response) {
    try {
      const { userId, name } = req.body;
      if (!userId || !name) {
        return res.status(400).json({ success: false, message: "UserId and name are required" });
      }

      const newCollection = await RecipeService.createCollection(String(userId), String(name));
      res.status(201).json({ success: true, message: "Collection created successfully", collection: newCollection });
    } catch (error: any) {
      console.error("Create Collection Error:", error);
      res.status(500).json({ success: false, message: "Failed to create collection", error: error.message });
    }
  },

  async addRecipeToCollection(req: Request, res: Response) {
    try {
      const { collectionId, recipeId } = req.body;
      if (!collectionId || !recipeId) {
        return res.status(400).json({ success: false, message: "CollectionId and recipeId are required" });
      }

      const addedItem = await RecipeService.addRecipeToCollection(String(collectionId), String(recipeId));
      res.status(201).json({ success: true, message: "Recipe added to collection", addedItem });
    } catch (error: any) {
      if (error.code === "P2002") {
        return res.status(409).json({ success: false, message: "Recipe already exists in this collection" });
      }
      console.error("Add to Collection Error:", error);
      res.status(500).json({ success: false, message: "Failed to add recipe to collection", error: error.message });
    }
  },

  async deleteCollection(req: Request, res: Response) {
    try {
      const { collectionId, userId } = req.body;
      if (!collectionId || !userId) {
        return res.status(400).json({ success: false, message: "CollectionId and userId are required" });
      }

      await RecipeService.deleteCollection(String(collectionId), String(userId));
      res.json({ success: true, message: "Collection deleted successfully" });
    } catch (error: any) {
      console.error("Delete Collection Error:", error);
      res.status(500).json({ success: false, message: error.message || "Failed to delete collection" });
    }
  },
};