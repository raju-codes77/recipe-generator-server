import { Router } from "express";
import { ShoppingListController } from "./shoppingList.controller.js";

const router = Router();

// List retrieval & creation
router.get("/", ShoppingListController.getShoppingList);
router.post("/", ShoppingListController.addManualItem);

// Recipe integration
router.post("/from-recipe", ShoppingListController.generateFromRecipe);
router.post("/missing-from-recipe", ShoppingListController.generateFromRecipe);

// List operations & batch actions
router.post("/optimize", ShoppingListController.optimizeList);
router.delete("/completed", ShoppingListController.clearCompleted);

// Item specific operations
router.patch("/:id/toggle", ShoppingListController.toggleItem);
router.patch("/:id", ShoppingListController.updateItem);
router.delete("/:id", ShoppingListController.deleteItem);

export default router;
