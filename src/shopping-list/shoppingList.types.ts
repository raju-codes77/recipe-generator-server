export interface ShoppingListItemDTO {
  id: string;
  shoppingListId: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  checked: boolean;
  sourceType: string;
  sourceRecipeId?: string | null;
  source?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShoppingListSummary {
  totalItems: number;
  completed: number;
  remaining: number;
  fromPantry: number;
}

export interface ShoppingListResponseDTO {
  id: string;
  name: string;
  items: ShoppingListItemDTO[];
  categories: string[];
  summary: ShoppingListSummary;
}

export interface AddManualItemInput {
  name: string;
  quantity?: number | string;
  unit?: string;
  category?: string;
}

export interface UpdateItemInput {
  name?: string;
  quantity?: number | string;
  unit?: string;
  category?: string;
  checked?: boolean;
}

export interface GenerateFromRecipeInput {
  recipeId: string;
}

export interface ParsedIngredient {
  original: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
}
