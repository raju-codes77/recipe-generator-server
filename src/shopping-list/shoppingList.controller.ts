import { Request, Response } from "express";
import { auth } from "../lib/auth.js";
import { ShoppingListService } from "./shoppingList.service.js";

async function getAuthUserId(req: Request): Promise<string | null> {
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
      else if (typeof value === "string") headers.set(name, value);
    }

    const session = await auth.api.getSession({ headers });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export const ShoppingListController = {
  // =========================
  // GET /api/shopping-list
  // =========================
  async getShoppingList(req: Request, res: Response) {
    try {
      const userId = await getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const result = await ShoppingListService.getShoppingList(userId);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[ShoppingList] Get Error:", error);
      return res.status(500).json({ message: error.message || "Failed to fetch shopping list" });
    }
  },

  // =========================
  // POST /api/shopping-list
  // =========================
  async addManualItem(req: Request, res: Response) {
    try {
      const userId = await getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { name } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ message: "Item name is required" });
      }

      const result = await ShoppingListService.addManualItem(userId, req.body);
      return res.status(201).json(result);
    } catch (error: any) {
      console.error("[ShoppingList] Add Error:", error);
      return res.status(500).json({ message: error.message || "Failed to add manual item" });
    }
  },

  // =========================
  // POST /api/shopping-list/from-recipe
  // =========================
  async generateFromRecipe(req: Request, res: Response) {
    try {
      const userId = await getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { recipeId } = req.body;
      if (!recipeId || typeof recipeId !== "string" || !recipeId.trim()) {
        return res.status(400).json({ message: "Recipe ID is required" });
      }

      const result = await ShoppingListService.generateFromRecipe(userId, recipeId.trim());
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[ShoppingList] Generate From Recipe Error:", error);
      if (error.message === "Recipe not found") {
        return res.status(404).json({ message: "Recipe not found" });
      }
      return res.status(500).json({ message: error.message || "Failed to generate shopping list from recipe" });
    }
  },

  // =========================
  // PATCH /api/shopping-list/:id
  // =========================
  async updateItem(req: Request, res: Response) {
    try {
      const userId = await getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const itemId = String(req.params.id);
      if (!itemId) return res.status(400).json({ message: "Item ID is required" });

      const result = await ShoppingListService.updateItem(userId, itemId, req.body);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[ShoppingList] Update Error:", error);
      if (error.message.includes("not found")) {
        return res.status(404).json({ message: error.message });
      }
      return res.status(500).json({ message: error.message || "Failed to update item" });
    }
  },

  // =========================
  // DELETE /api/shopping-list/:id
  // =========================
  async deleteItem(req: Request, res: Response) {
    try {
      const userId = await getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const itemId = String(req.params.id);
      if (!itemId) return res.status(400).json({ message: "Item ID is required" });

      const result = await ShoppingListService.deleteItem(userId, itemId);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[ShoppingList] Delete Error:", error);
      if (error.message.includes("not found")) {
        return res.status(404).json({ message: error.message });
      }
      return res.status(500).json({ message: error.message || "Failed to delete item" });
    }
  },

  // =========================
  // PATCH /api/shopping-list/:id/toggle
  // =========================
  async toggleItem(req: Request, res: Response) {
    try {
      const userId = await getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const itemId = String(req.params.id);
      if (!itemId) return res.status(400).json({ message: "Item ID is required" });

      const result = await ShoppingListService.toggleItem(userId, itemId);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[ShoppingList] Toggle Error:", error);
      if (error.message.includes("not found")) {
        return res.status(404).json({ message: error.message });
      }
      return res.status(500).json({ message: error.message || "Failed to toggle item state" });
    }
  },

  // =========================
  // DELETE /api/shopping-list/completed
  // =========================
  async clearCompleted(req: Request, res: Response) {
    try {
      const userId = await getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const result = await ShoppingListService.clearCompleted(userId);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[ShoppingList] Clear Completed Error:", error);
      return res.status(500).json({ message: error.message || "Failed to clear completed items" });
    }
  },

  // =========================
  // POST /api/shopping-list/optimize
  // =========================
  async optimizeList(req: Request, res: Response) {
    try {
      const userId = await getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const result = await ShoppingListService.optimizeList(userId);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[ShoppingList] Optimize Error:", error);
      return res.status(500).json({ message: error.message || "Failed to optimize shopping list" });
    }
  },
};
