import { Request, Response } from "express";
import { RecipeService } from "./recipe.service";

export const RecipeController = {
  // =========================
  // Get Recipes
  // =========================
  async getRecipes(req: Request, res: Response) {
    try {
      const {
        search,
        category,
        cuisine,
        maxTime,
        maxCalories,
        minRating,
        sortBy,
        tab,
        userId,
      } = req.query;

      const conditions: any[] = [];

      // =========================
      // Tab Filters
      // =========================

      if (tab === "my-recipes") {
        if (!userId) {
          return res.status(400).json({
            success: false,
            message: "UserId is required for My Recipes",
          });
        }

        conditions.push({
          userId: String(userId),
        });
      }

      else if (tab === "favorites") {
        if (!userId) {
          return res.status(400).json({
            success: false,
            message: "UserId is required for Favorites",
          });
        }

        const userFavorites =
          await RecipeService.getUserFavorites(String(userId));

        const favoriteRecipeIds = userFavorites.map(
          (fav) => fav.recipeId
        );

        conditions.push({
          id: {
            in: favoriteRecipeIds,
          },
        });
      }

      else if (tab === "collections") {
        if (!userId) {
          return res.status(400).json({
            success: false,
            message: "UserId is required for Collections",
          });
        }

        const userCollections =
          await RecipeService.getUserCollections(String(userId));

        const collectionRecipeIds = userCollections.flatMap(
          (collection) =>
            collection.recipes.map((recipe) => recipe.recipeId)
        );

        conditions.push({
          id: {
            in: collectionRecipeIds,
          },
        });
      }

      // =========================
      // Search
      // =========================

      if (search) {
        conditions.push({
          OR: [
            {
              title: {
                contains: String(search),
                mode: "insensitive",
              },
            },
            {
              ingredients: {
                some: {
                  name: {
                    contains: String(search),
                    mode: "insensitive",
                  },
                },
              },
            },
          ],
        });
      }

      // =========================
      // Category Filter
      // =========================

      if (category && category !== "All") {
        conditions.push({
          category: {
            equals: String(category),
            mode: "insensitive",
          },
        });
      }

      // =========================
      // Cuisine Filter
      // =========================

      if (cuisine && cuisine !== "All") {
        conditions.push({
          cuisine: {
            equals: String(cuisine),
            mode: "insensitive",
          },
        });
      }

      // =========================
      // Time Filter
      // =========================

      if (maxTime) {
        conditions.push({
          time: {
            lte: Number(maxTime),
          },
        });
      }

      // =========================
      // Calories Filter
      // =========================

      if (maxCalories) {
        conditions.push({
          calories: {
            lte: Number(maxCalories),
          },
        });
      }

      // =========================
      // Rating Filter
      // =========================

      if (minRating) {
        conditions.push({
          rating: {
            gte: Number(minRating),
          },
        });
      }

      // =========================
      // Where Clause
      // =========================

      const whereClause =
        conditions.length > 0
          ? {
              AND: conditions,
            }
          : {};

      // =========================
      // Sorting
      // =========================

      let sortOrder: "asc" | "desc" = "desc";
      let sortByField = "createdAt";

      if (sortBy === "Top Rated") {
        sortByField = "rating";
        sortOrder = "desc";
      }

      else if (sortBy === "Quickest") {
        sortByField = "time";
        sortOrder = "asc";
      }

      const orderByObj: any = {
        [sortByField]: sortOrder,
      };

      // =========================
      // Fetch Recipes
      // =========================

      const recipes = await RecipeService.findRecipes(
        whereClause,
        orderByObj
      );

      return res.status(200).json({
        success: true,
        count: recipes.length,
        recipes,
      });

    } catch (error: any) {
      console.error("API Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch recipes",
        error: error.message,
      });
    }
  },

  // =========================
  // Get Single Recipe
  // =========================

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

      return res.status(200).json({
        success: true,
        recipe,
      });

    } catch (error: any) {
      console.error("Error fetching recipe by id:", error);

      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  },

  // =========================
  // Check Favorite
  // =========================

  async checkFavorite(req: Request, res: Response) {
    try {
      const { userId, recipeId } = req.query;

      if (!userId || !recipeId) {
        return res.status(400).json({
          success: false,
          message: "userId and recipeId are required",
        });
      }

      const favorite = await RecipeService.checkFavorite(
        String(userId),
        String(recipeId)
      );

      return res.status(200).json({
        success: true,
        isFavorite: !!favorite,
      });

    } catch (error: any) {
      console.error("Check Favorite Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to check favorite",
      });
    }
  },

  // =========================
  // Add Favorite
  // =========================

  async addFavorite(req: Request, res: Response) {
    try {
      const { userId, recipeId } = req.body;

      if (!userId || !recipeId) {
        return res.status(400).json({
          success: false,
          message: "userId and recipeId are required",
        });
      }

      const favorite = await RecipeService.addFavorite(
        String(userId),
        String(recipeId)
      );

      return res.status(201).json({
        success: true,
        message: "Recipe added to favorites",
        favorite,
      });

    } catch (error: any) {
      if (error.code === "P2002") {
        return res.status(409).json({
          success: false,
          message: "Recipe already in favorites",
        });
      }

      console.error("Add Favorite Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to add favorite",
        error: error.message,
      });
    }
  },

  // =========================
  // Remove Favorite
  // =========================

  async removeFavorite(req: Request, res: Response) {
    try {
      const { userId, recipeId } = req.body;

      if (!userId || !recipeId) {
        return res.status(400).json({
          success: false,
          message: "userId and recipeId are required",
        });
      }

      await RecipeService.removeFavorite(
        String(userId),
        String(recipeId)
      );

      return res.status(200).json({
        success: true,
        message: "Recipe removed from favorites",
      });

    } catch (error: any) {
      console.error("Remove Favorite Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to remove favorite",
      });
    }
  },

  // =========================
  // Get Collections
  // =========================

  async getCollections(req: Request, res: Response) {
    try {
      const { userId } = req.query;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "UserId is required",
        });
      }

      const collections = await RecipeService.getCollections(
        String(userId)
      );

      return res.status(200).json({
        success: true,
        collections,
      });

    } catch (error: any) {
      console.error("Get Collections Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to fetch collections",
        error: error.message,
      });
    }
  },

  // =========================
  // Create Collection
  // =========================

  async createCollection(req: Request, res: Response) {
    try {
      const { userId, name } = req.body;

      if (!userId || !name) {
        return res.status(400).json({
          success: false,
          message: "UserId and name are required",
        });
      }

      const newCollection =
        await RecipeService.createCollection(
          String(userId),
          String(name)
        );

      return res.status(201).json({
        success: true,
        message: "Collection created successfully",
        collection: newCollection,
      });

    } catch (error: any) {
      console.error("Create Collection Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to create collection",
        error: error.message,
      });
    }
  },

  // =========================
  // Add Recipe To Collection
  // =========================

  async addRecipeToCollection(req: Request, res: Response) {
    try {
      const { collectionId, recipeId } = req.body;

      if (!collectionId || !recipeId) {
        return res.status(400).json({
          success: false,
          message: "CollectionId and recipeId are required",
        });
      }

      const addedItem =
        await RecipeService.addRecipeToCollection(
          String(collectionId),
          String(recipeId)
        );

      return res.status(201).json({
        success: true,
        message: "Recipe added to collection",
        addedItem,
      });

    } catch (error: any) {
      if (error.code === "P2002") {
        return res.status(409).json({
          success: false,
          message: "Recipe already exists in this collection",
        });
      }

      console.error("Add to Collection Error:", error);

      return res.status(500).json({
        success: false,
        message: "Failed to add recipe to collection",
        error: error.message,
      });
    }
  },

  // =========================
  // Delete Collection
  // =========================

  async deleteCollection(req: Request, res: Response) {
    try {
      const { collectionId, userId } = req.body;

      if (!collectionId || !userId) {
        return res.status(400).json({
          success: false,
          message: "CollectionId and userId are required",
        });
      }

      await RecipeService.deleteCollection(
        String(collectionId),
        String(userId)
      );

      return res.status(200).json({
        success: true,
        message: "Collection deleted successfully",
      });

    } catch (error: any) {
      console.error("Delete Collection Error:", error);

      return res.status(500).json({
        success: false,
        message:
          error.message || "Failed to delete collection",
      });
    }
  },
};