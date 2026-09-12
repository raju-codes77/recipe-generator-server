import { ParsedIngredient } from "./shoppingList.types.js";

const CATEGORY_MAP: Record<string, string[]> = {
  Produce: [
    "tomato", "tomatoes", "onion", "onions", "garlic", "ginger", "chili", "chilly", "chillies",
    "chile", "potato", "potatoes", "spinach", "carrot", "carrots", "lettuce", "lemon", "lemons",
    "lime", "limes", "cucumber", "cucumbers", "apple", "banana", "coriander", "mint", "basil",
    "parsley", "thyme", "rosemary", "bell pepper", "capsicum", "mushroom", "mushrooms", "avocado",
    "cabbage", "cauliflower", "broccoli", "scallion", "spring onion", "shallot", "shallots", "cilantro"
  ],
  Protein: [
    "chicken", "beef", "pork", "lamb", "mutton", "fish", "shrimp", "shrimps", "prawn", "prawns",
    "egg", "eggs", "tofu", "turkey", "salmon", "tuna", "steak", "bacon", "sausage", "ham", "crab"
  ],
  Dairy: [
    "milk", "butter", "cheese", "yogurt", "yoghurt", "cream", "heavy cream", "sour cream",
    "paneer", "ghee", "cheddar", "mozzarella", "parmesan", "condensed milk"
  ],
  Bakery: [
    "bread", "buns", "bun", "flour", "all-purpose flour", "whole wheat flour", "toast",
    "pita", "tortilla", "bagel", "croissant", "yeast"
  ],
  Frozen: [
    "ice cream", "frozen peas", "frozen corn", "frozen berries", "ice"
  ],
  Beverages: [
    "water", "juice", "orange juice", "tea", "coffee", "soda", "wine", "beer", "coconut water"
  ],
  Pantry: [
    "rice", "basmati rice", "oil", "olive oil", "vegetable oil", "mustard oil", "sunflower oil",
    "salt", "sugar", "brown sugar", "pepper", "black pepper", "turmeric", "turmeric powder",
    "cumin", "cumin powder", "cumin seeds", "coriander powder", "chili powder", "paprika",
    "garam masala", "cinnamon", "cardamom", "clove", "cloves", "bay leaf", "soy sauce",
    "vinegar", "ketchup", "mayonnaise", "mustard", "pasta", "spaghetti", "noodles", "oats",
    "honey", "vanilla", "baking powder", "baking soda", "cornstarch", "broth", "stock"
  ]
};

export function normalizeName(name: string): string {
  if (!name) return "";
  let clean = name
    .toLowerCase()
    .trim()
    .replace(/^[-—–:]+/, "")
    .replace(/[-—–:]+$/, "")
    .replace(/\s+/g, " ");

  // Remove common prefix words like "fresh", "organic", "chopped", "sliced", "diced"
  clean = clean.replace(/\b(fresh|organic|chopped|diced|sliced|minced|grated|peeled|cooked)\b/g, "").trim();

  // Basic plural normalization if safe
  if (clean.endsWith("ies") && clean.length > 4) {
    clean = clean.slice(0, -3) + "y"; // e.g. chillies -> chilly
  } else if (clean.endsWith("es") && clean.length > 4 && !clean.endsWith("cheese")) {
    clean = clean.slice(0, -2); // e.g. tomatoes -> tomato
  } else if (clean.endsWith("s") && !clean.endsWith("ss") && !clean.endsWith("us") && clean.length > 3) {
    clean = clean.slice(0, -1); // e.g. onions -> onion
  }

  return clean;
}

export function normalizeUnit(unitStr: string): string {
  if (!unitStr) return "pcs";
  const clean = unitStr.toLowerCase().trim().replace(/[^a-z]/g, "");

  if (["g", "gram", "grams", "gm"].includes(clean)) return "g";
  if (["kg", "kilogram", "kilograms", "kilo"].includes(clean)) return "kg";
  if (["ml", "milliliter", "milliliters"].includes(clean)) return "ml";
  if (["l", "liter", "liters", "ltr"].includes(clean)) return "l";
  if (["tsp", "teaspoon", "teaspoons"].includes(clean)) return "tsp";
  if (["tbsp", "tablespoon", "tablespoons", "tb"].includes(clean)) return "tbsp";
  if (["cup", "cups"].includes(clean)) return "cup";
  if (["clove", "cloves"].includes(clean)) return "cloves";
  if (["piece", "pieces", "pc", "pcs", "item", "items"].includes(clean)) return "pcs";
  if (["bottle", "bottles"].includes(clean)) return "bottle";
  if (["bunch", "bunches"].includes(clean)) return "bunch";
  if (["dozen", "dozens"].includes(clean)) return "dozen";
  if (["oz", "ounce", "ounces"].includes(clean)) return "oz";
  if (["lb", "lbs", "pound", "pounds"].includes(clean)) return "lb";

  return clean || "pcs";
}

export function assignCategory(ingredientName: string): string {
  const norm = normalizeName(ingredientName);
  for (const [cat, keywords] of Object.entries(CATEGORY_MAP)) {
    for (const kw of keywords) {
      if (norm === kw || new RegExp(`\\b${kw}\\b`, "i").test(norm)) {
        return cat;
      }
    }
  }
  return "Other";
}

export function convertUnitQuantity(
  qty: number,
  fromUnit: string,
  toUnit: string
): { qty: number; converted: boolean } {
  const u1 = normalizeUnit(fromUnit);
  const u2 = normalizeUnit(toUnit);

  if (u1 === u2) {
    return { qty, converted: true };
  }

  // Weight
  if (u1 === "g" && u2 === "kg") return { qty: qty / 1000, converted: true };
  if (u1 === "kg" && u2 === "g") return { qty: qty * 1000, converted: true };

  // Volume
  if (u1 === "ml" && u2 === "l") return { qty: qty / 1000, converted: true };
  if (u1 === "l" && u2 === "ml") return { qty: qty * 1000, converted: true };

  // Spoons
  if (u1 === "tsp" && u2 === "tbsp") return { qty: qty / 3, converted: true };
  if (u1 === "tbsp" && u2 === "tsp") return { qty: qty * 3, converted: true };

  return { qty, converted: false };
}

function parseNumber(numStr: string): number {
  if (!numStr) return 1;
  const str = numStr.trim();

  // Handle mixed fractions like "1 1/2"
  if (str.includes(" ") && str.includes("/")) {
    const parts = str.split(" ");
    const whole = parseFloat(parts[0]);
    const fracParts = parts[1].split("/");
    const frac = parseFloat(fracParts[0]) / parseFloat(fracParts[1]);
    return whole + (isNaN(frac) ? 0 : frac);
  }

  // Handle standard fraction "1/2"
  if (str.includes("/")) {
    const parts = str.split("/");
    const num = parseFloat(parts[0]);
    const den = parseFloat(parts[1]);
    return den ? num / den : num;
  }

  const val = parseFloat(str);
  return isNaN(val) ? 1 : val;
}

export function parseIngredient(rawName: string, rawMeasure?: string | null): ParsedIngredient {
  const fullText = rawMeasure ? `${rawName} ${rawMeasure}`.trim() : rawName.trim();

  let quantity = 1;
  let unit = "pcs";
  let name = rawName.trim();

  // Regex patterns to capture quantity and unit
  // Example 1: "500g Chicken", "2.5 cups Rice", "1/2 tsp Salt"
  const leadingRegex = /^([\d\/\.\s]+)\s*([a-zA-Z]+)?\s*[-—–:]?\s*(.*)$/;
  // Example 2: "Chicken 500g", "Chicken — 500g", "Rice 2 cups"
  const trailingRegex = /^(.*?)\s*[-—–:]?\s*([\d\/\.\s]+)\s*([a-zA-Z]+)?$/;

  if (rawMeasure) {
    const match = rawMeasure.match(/^([\d\/\.\s]+)\s*([a-zA-Z]+)?/);
    if (match) {
      quantity = parseNumber(match[1]);
      if (match[2]) unit = normalizeUnit(match[2]);
      name = rawName.trim();
    }
  } else {
    const leadingMatch = fullText.match(leadingRegex);
    const trailingMatch = fullText.match(trailingRegex);

    if (leadingMatch && leadingMatch[1] && leadingMatch[3]) {
      quantity = parseNumber(leadingMatch[1]);
      unit = leadingMatch[2] ? normalizeUnit(leadingMatch[2]) : "pcs";
      name = leadingMatch[3].trim();
    } else if (trailingMatch && trailingMatch[2] && trailingMatch[1]) {
      quantity = parseNumber(trailingMatch[2]);
      unit = trailingMatch[3] ? normalizeUnit(trailingMatch[3]) : "pcs";
      name = trailingMatch[1].trim();
    }
  }

  name = normalizeName(name) || rawName.trim();

  return {
    original: fullText,
    name,
    quantity: Math.round(quantity * 100) / 100,
    unit,
    category: assignCategory(name),
  };
}
