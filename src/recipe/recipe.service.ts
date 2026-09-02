import { prisma } from "../lib/prisma";
export const RecipeService = {
  async getRecipeCount() {
    return await prisma.recipe.count();
  },

  // external API recipes seeding
  async seedExternalRecipes(meals: any[]) {
    for (const meal of meals) {
      await prisma.recipe.create({
        data: {
          title: meal.strMeal,
          image: meal.strMealThumb,
          cuisine: meal.strArea || "General",
          category: meal.strCategory || "Main Course",
          time: 30,
          calories: 400,
          rating: 4.5,
          
        },
      }).catch(() => {}); 
    }
  },

  // filtering and sorting recipes
  async findRecipes(whereClause: any, orderByObj: any, limit?: number) {
    return await prisma.recipe.findMany({
      where: whereClause,
      orderBy: orderByObj,
      ...(limit ? { take: limit } : {}),
      include: {
        ingredients: true,
        user: true,
      },
    });
  },

  //  Newly Added: Find a Single Recipe by ID
  async findRecipeById(id: string) {
    return await prisma.recipe.findUnique({
      where: { id },
      include: {
        ingredients: true,
        user: true,
      },
    });
  },

  // user favorites with recipe ids
  async getUserFavorites(userId: string) {
    return await prisma.favorite.findMany({
      where: { userId },
      select: { recipeId: true },
    });
  },

  // user collections with recipes
  async getUserCollections(userId: string) {
    return await prisma.collection.findMany({
      where: { userId },
      include: {
        recipes: {
          select: { recipeId: true },
        },
      },
    });
  },

  // favorite check
  async checkFavorite(userId: string, recipeId: string) {
    return await prisma.favorite.findUnique({
      where: {
        userId_recipeId: { userId, recipeId },
      },
    });
  },

  // favorite add
  async addFavorite(userId: string, recipeId: string) {
    return await prisma.favorite.create({
      data: { userId, recipeId },
    });
  },

  // favorite remove
  async removeFavorite(userId: string, recipeId: string) {
    return await prisma.favorite.delete({
      where: {
        userId_recipeId: { userId, recipeId },
      },
    });
  },

  // collection filtering
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
      orderBy: { createdAt: "desc" },
    });
  },

  // create collection
  async createCollection(userId: string, name: string) {
    return await prisma.collection.create({
      data: { userId, name },
    });
  },

// add recipe to collection
  async addRecipeToCollection(collectionId: string, recipeId: string) {
    return await prisma.collectionRecipe.create({
      data: { collectionId, recipeId },
    });
  },

//  delete collection
  async deleteCollection(collectionId: string, userId: string) {
    return await prisma.collection.delete({
      where: { id: collectionId, userId },
    });
  },
};