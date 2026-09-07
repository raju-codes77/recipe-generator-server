import { prisma } from "../lib/prisma";

export const RecipeService = {
  // =========================
  // Find Recipes
  // =========================

  async findRecipes(whereClause: any, orderByObj: any) {
    return await prisma.recipe.findMany({
      where: whereClause,
      orderBy: orderByObj,
      include: {
        ingredients: true,
        user: true,
      },
    });
  },

  // =========================
  // Find Single Recipe
  // =========================

  async findRecipeById(id: string) {
    return await prisma.recipe.findUnique({
      where: { id },
      include: {
        ingredients: true,
        user: true,
      },
    });
  },

  // =========================
  // User Favorites
  // =========================

  async getUserFavorites(userId: string) {
    return await prisma.favorite.findMany({
      where: { userId },
      select: {
        recipeId: true,
      },
    });
  },

  // =========================
  // User Collections
  // =========================

  async getUserCollections(userId: string) {
    return await prisma.collection.findMany({
      where: { userId },
      include: {
        recipes: {
          select: {
            recipeId: true,
          },
        },
      },
    });
  },

  // =========================
  // Check Favorite
  // =========================

  async checkFavorite(userId: string, recipeId: string) {
    return await prisma.favorite.findUnique({
      where: {
        userId_recipeId: {
          userId,
          recipeId,
        },
      },
    });
  },

  // =========================
  // Add Favorite
  // =========================

  async addFavorite(userId: string, recipeId: string) {
    return await prisma.favorite.create({
      data: {
        userId,
        recipeId,
      },
    });
  },

  // =========================
  // Remove Favorite
  // =========================

  async removeFavorite(userId: string, recipeId: string) {
    return await prisma.favorite.delete({
      where: {
        userId_recipeId: {
          userId,
          recipeId,
        },
      },
    });
  },

  // =========================
  // Get Collections
  // =========================

  async getCollections(userId: string) {
    return await prisma.collection.findMany({
      where: { userId },
      include: {
        recipes: {
          include: {
            recipe: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  },

  // =========================
  // Create Collection
  // =========================

  async createCollection(userId: string, name: string) {
    return await prisma.collection.create({
      data: {
        userId,
        name,
      },
    });
  },

  // =========================
  // Add Recipe To Collection
  // =========================

  async addRecipeToCollection(
    collectionId: string,
    recipeId: string
  ) {
    return await prisma.collectionRecipe.create({
      data: {
        collectionId,
        recipeId,
      },
    });
  },

  // =========================
  // Delete Collection
  // =========================

  async deleteCollection(
    collectionId: string,
    userId: string
  ) {
    return await prisma.collection.delete({
      where: {
        id: collectionId,
        userId,
      },
    });
  },
};