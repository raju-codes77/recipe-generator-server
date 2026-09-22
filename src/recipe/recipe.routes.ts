import { Router } from "express";
import { RecipeController } from "./recipe.controller.js";
import { RecommendationController } from "./recommendation.controller.js";

const router = Router();

// Recipe Routes -> /api/recipes
router.get("/recommendations", RecommendationController.getRecommendations);
router.get("/recipes", RecipeController.getRecipes);

// single recipe route
router.get("/recipes/:id", RecipeController.getRecipeById);
// Favorites Routes -> /api/favorites/
router.get("/favorites/check", RecipeController.checkFavorite);
router.post("/favorites", RecipeController.addFavorite);
router.delete("/favorites", RecipeController.removeFavorite);

// Collections Routes -> /api/collections/
router.get("/collections", RecipeController.getCollections);
router.post("/collections", RecipeController.createCollection);
router.post("/collections/add-recipe", RecipeController.addRecipeToCollection);

router.delete("/collections", RecipeController.deleteCollection);

export default router;