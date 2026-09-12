import { prisma } from "../lib/prisma.js";
import {
  AddManualItemInput,
  ShoppingListResponseDTO,
  UpdateItemInput,
  ShoppingListItemDTO,
} from "./shoppingList.types.js";
import {
  assignCategory,
  convertUnitQuantity,
  normalizeName,
  normalizeUnit,
  parseIngredient,
} from "./shoppingList.utils.js";

export const ShoppingListService = {
  // =========================
  // Get or Create List
  // =========================
  async getOrCreateShoppingList(userId: string) {
    let list = await prisma.shoppingList.findFirst({
      where: { userId },
      include: {
        items: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!list) {
      list = await prisma.shoppingList.create({
        data: {
          userId,
          name: "My Shopping List",
        },
        include: {
          items: {
            orderBy: { createdAt: "desc" },
          },
        },
      });
    }

    return list;
  },

  // =========================
  // Get Shopping List Formatted
  // =========================
  async getShoppingList(userId: string): Promise<ShoppingListResponseDTO> {
    const list = await this.getOrCreateShoppingList(userId);
    const items = list.items;

    const totalItems = items.length;
    const completed = items.filter((i) => i.checked).length;
    const remaining = totalItems - completed;

    // Fetch active pantry items count or items derived from pantry
    const pantryCount = await prisma.pantryItem.count({
      where: { userId, status: "ACTIVE" },
    });

    const categorySet = new Set<string>();
    items.forEach((item) => {
      if (item.category) categorySet.add(item.category);
    });

    return {
      id: list.id,
      name: list.name,
      items: items as ShoppingListItemDTO[],
      categories: Array.from(categorySet),
      summary: {
        totalItems,
        completed,
        remaining,
        fromPantry: pantryCount,
      },
    };
  },

  // =========================
  // Add Manual Item
  // =========================
  async addManualItem(userId: string, input: AddManualItemInput): Promise<ShoppingListResponseDTO> {
    const list = await this.getOrCreateShoppingList(userId);

    const name = input.name?.trim();
    if (!name) throw new Error("Item name is required");

    const qty = typeof input.quantity === "number" ? input.quantity : parseFloat(String(input.quantity || 1)) || 1;
    const unit = normalizeUnit(input.unit || "pcs");
    const category = input.category?.trim() || assignCategory(name);
    const normName = normalizeName(name);

    // Check if duplicate item exists
    const existing = list.items.find(
      (i) => !i.checked && normalizeName(i.name) === normName && normalizeUnit(i.unit) === unit
    );

    if (existing) {
      await prisma.shoppingListItem.update({
        where: { id: existing.id },
        data: {
          quantity: existing.quantity + qty,
        },
      });
    } else {
      await prisma.shoppingListItem.create({
        data: {
          shoppingListId: list.id,
          name,
          quantity: qty,
          unit,
          category,
          checked: false,
          sourceType: "manual",
          source: "Manual",
        },
      });
    }

    return await this.getShoppingList(userId);
  },

  // =========================
  // Generate From Recipe (Smart Pantry-Aware)
  // =========================
  async generateFromRecipe(userId: string, recipeId: string): Promise<ShoppingListResponseDTO> {
    const list = await this.getOrCreateShoppingList(userId);

    let recipeTitle = "";
    let rawIngredients: { name: string; measure?: string | null }[] = [];

    // 1. Try standard Recipe model
    const standardRecipe = await prisma.recipe.findFirst({
      where: {
        OR: [{ id: recipeId }, { mealId: recipeId }],
      },
      include: { ingredients: true },
    });

    if (standardRecipe) {
      recipeTitle = standardRecipe.title;
      rawIngredients = standardRecipe.ingredients.map((ing) => ({
        name: ing.name,
        measure: ing.measure,
      }));
    } else {
      // 2. Try PantryRecipe model
      const pantryRecipe = await prisma.pantryRecipe.findUnique({
        where: { id: recipeId },
      });

      if (pantryRecipe) {
        recipeTitle = pantryRecipe.title;
        const ingJson = pantryRecipe.ingredients;
        if (Array.isArray(ingJson)) {
          rawIngredients = ingJson.map((item: any) => {
            if (typeof item === "string") return { name: item };
            return { name: item.name || item.ingredient || "", measure: item.measure || item.quantity || null };
          });
        }
      }
    }

    if (!standardRecipe && rawIngredients.length === 0) {
      throw new Error("Recipe not found");
    }

    // 3. Parse required ingredients
    const parsedRequired = rawIngredients.map((ing) => parseIngredient(ing.name, ing.measure));

    // 4. Load user's active pantry items
    const userPantry = await prisma.pantryItem.findMany({
      where: { userId, status: "ACTIVE" },
    });

    // 5. Compare required vs pantry
    const itemsToAdd: {
      name: string;
      quantity: number;
      unit: string;
      category: string;
    }[] = [];

    for (const reqIng of parsedRequired) {
      const normReqName = normalizeName(reqIng.name);

      // Find matching pantry items
      const matchingPantry = userPantry.filter((p) => normalizeName(p.name) === normReqName);

      let availablePantryQty = 0;
      for (const pItem of matchingPantry) {
        const { qty, converted } = convertUnitQuantity(pItem.quantity, pItem.unit, reqIng.unit);
        if (converted) {
          availablePantryQty += qty;
        }
      }

      const missingQty = reqIng.quantity - availablePantryQty;

      if (missingQty > 0) {
        itemsToAdd.push({
          name: reqIng.name,
          quantity: Math.round(missingQty * 100) / 100,
          unit: reqIng.unit,
          category: reqIng.category,
        });
      }
    }

    // 6. Merge & insert missing items into PostgreSQL transactionally
    await prisma.$transaction(async (tx) => {
      for (const item of itemsToAdd) {
        const normItemName = normalizeName(item.name);
        const normItemUnit = normalizeUnit(item.unit);

        const existing = await tx.shoppingListItem.findFirst({
          where: {
            shoppingListId: list.id,
            checked: false,
            name: { mode: "insensitive", equals: item.name },
          },
        });

        if (existing) {
          const { qty, converted } = convertUnitQuantity(existing.quantity, existing.unit, item.unit);
          const newQty = converted ? qty + item.quantity : existing.quantity + item.quantity;
          const updatedSource = existing.source && !existing.source.includes(recipeTitle)
            ? `${existing.source}, ${recipeTitle}`
            : existing.source || recipeTitle;

          await tx.shoppingListItem.update({
            where: { id: existing.id },
            data: {
              quantity: Math.round(newQty * 100) / 100,
              source: updatedSource,
            },
          });
        } else {
          await tx.shoppingListItem.create({
            data: {
              shoppingListId: list.id,
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              category: item.category,
              checked: false,
              sourceType: "recipe",
              sourceRecipeId: recipeId,
              source: recipeTitle,
            },
          });
        }
      }
    });

    return await this.getShoppingList(userId);
  },

  // =========================
  // Update Item
  // =========================
  async updateItem(userId: string, itemId: string, input: UpdateItemInput): Promise<ShoppingListResponseDTO> {
    const item = await prisma.shoppingListItem.findUnique({
      where: { id: itemId },
      include: { shoppingList: true },
    });

    if (!item || item.shoppingList.userId !== userId) {
      throw new Error("Shopping item not found or unauthorized");
    }

    const dataToUpdate: any = {};
    if (input.name !== undefined) dataToUpdate.name = input.name.trim();
    if (input.quantity !== undefined) {
      dataToUpdate.quantity = typeof input.quantity === "number" ? input.quantity : parseFloat(String(input.quantity)) || 1;
    }
    if (input.unit !== undefined) dataToUpdate.unit = normalizeUnit(input.unit);
    if (input.category !== undefined) dataToUpdate.category = input.category.trim();
    if (input.checked !== undefined) dataToUpdate.checked = Boolean(input.checked);

    await prisma.shoppingListItem.update({
      where: { id: itemId },
      data: dataToUpdate,
    });

    return await this.getShoppingList(userId);
  },

  // =========================
  // Delete Item
  // =========================
  async deleteItem(userId: string, itemId: string): Promise<ShoppingListResponseDTO> {
    const item = await prisma.shoppingListItem.findUnique({
      where: { id: itemId },
      include: { shoppingList: true },
    });

    if (!item || item.shoppingList.userId !== userId) {
      throw new Error("Shopping item not found or unauthorized");
    }

    await prisma.shoppingListItem.delete({ where: { id: itemId } });

    return await this.getShoppingList(userId);
  },

  // =========================
  // Toggle Item Status
  // =========================
  async toggleItem(userId: string, itemId: string): Promise<ShoppingListResponseDTO> {
    const item = await prisma.shoppingListItem.findUnique({
      where: { id: itemId },
      include: { shoppingList: true },
    });

    if (!item || item.shoppingList.userId !== userId) {
      throw new Error("Shopping item not found or unauthorized");
    }

    await prisma.shoppingListItem.update({
      where: { id: itemId },
      data: { checked: !item.checked },
    });

    return await this.getShoppingList(userId);
  },

  // =========================
  // Clear Completed Items
  // =========================
  async clearCompleted(userId: string): Promise<ShoppingListResponseDTO> {
    const list = await this.getOrCreateShoppingList(userId);

    await prisma.shoppingListItem.deleteMany({
      where: {
        shoppingListId: list.id,
        checked: true,
      },
    });

    return await this.getShoppingList(userId);
  },

  // =========================
  // Optimize & Merge Duplicates
  // =========================
  async optimizeList(userId: string): Promise<ShoppingListResponseDTO> {
    const list = await this.getOrCreateShoppingList(userId);
    const items = await prisma.shoppingListItem.findMany({
      where: { shoppingListId: list.id },
    });

    const mergedMap = new Map<string, typeof items[0]>();
    const idsToDelete: string[] = [];

    for (const item of items) {
      const normName = normalizeName(item.name);
      const normUnit = normalizeUnit(item.unit);
      const key = `${normName}_${normUnit}_${item.checked}`;

      if (mergedMap.has(key)) {
        const existing = mergedMap.get(key)!;
        existing.quantity += item.quantity;
        if (item.source && existing.source && !existing.source.includes(item.source)) {
          existing.source = `${existing.source}, ${item.source}`;
        }
        idsToDelete.push(item.id);
      } else {
        mergedMap.set(key, { ...item });
      }
    }

    await prisma.$transaction(async (tx) => {
      if (idsToDelete.length > 0) {
        await tx.shoppingListItem.deleteMany({
          where: { id: { in: idsToDelete } },
        });
      }

      for (const mergedItem of mergedMap.values()) {
        await tx.shoppingListItem.update({
          where: { id: mergedItem.id },
          data: {
            quantity: Math.round(mergedItem.quantity * 100) / 100,
            category: assignCategory(mergedItem.name),
            source: mergedItem.source,
          },
        });
      }
    });

    return await this.getShoppingList(userId);
  },
};
