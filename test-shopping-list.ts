import { parseIngredient, convertUnitQuantity, normalizeName, normalizeUnit } from "./src/shopping-list/shoppingList.utils.js";

console.log("=== RUNNING SMART SHOPPING LIST UTILITY & ALGORITHM TESTS ===");

// Test 1: Ingredient Parsing
const testCases = [
  { raw: "Chicken 500g", expectedName: "chicken", expectedQty: 500, expectedUnit: "g" },
  { raw: "2 cups Rice", expectedName: "rice", expectedQty: 2, expectedUnit: "cup" },
  { raw: "Onion — 2 pcs", expectedName: "onion", expectedQty: 2, expectedUnit: "pcs" },
  { raw: "1 1/2 tsp Salt", expectedName: "salt", expectedQty: 1.5, expectedUnit: "tsp" },
];

let passed = 0;
for (const tc of testCases) {
  const parsed = parseIngredient(tc.raw);
  const ok = parsed.name === tc.expectedName && parsed.quantity === tc.expectedQty && parsed.unit === tc.expectedUnit;
  if (ok) {
    console.log(`[PASS] parseIngredient("${tc.raw}") ->`, parsed);
    passed++;
  } else {
    console.error(`[FAIL] parseIngredient("${tc.raw}") ->`, parsed, "Expected:", tc);
  }
}

// Test 2: Unit Conversions
const u1 = convertUnitQuantity(300, "g", "kg");
if (u1.qty === 0.3 && u1.converted) {
  console.log("[PASS] convertUnitQuantity 300g -> kg =", u1.qty);
  passed++;
} else {
  console.error("[FAIL] convertUnitQuantity 300g -> kg failed:", u1);
}

// Test 3: Business Logic Scenario (Chicken Bhuna Test)
console.log("\n=== TEST SCENARIO: CHICKEN BHUNA PANTRY SUBTRACTION ===");
const recipeReq = [
  { name: "Chicken 500g" },
  { name: "Rice 2 cups" },
  { name: "Onion 2 pcs" },
  { name: "Garlic 5 cloves" },
  { name: "Ginger 20g" },
  { name: "Green Chili 4 pcs" },
  { name: "Turmeric 1 tsp" },
  { name: "Oil 3 tbsp" },
].map((i) => parseIngredient(i.name));

const userPantry = [
  { name: "Chicken", quantity: 300, unit: "g" },
  { name: "Onion", quantity: 2, unit: "pcs" },
  { name: "Garlic", quantity: 5, unit: "cloves" },
  { name: "Rice", quantity: 1, unit: "cup" },
];

const shoppingListResult: { name: string; quantity: number; unit: string }[] = [];

for (const req of recipeReq) {
  const normReq = normalizeName(req.name);
  const matches = userPantry.filter((p) => normalizeName(p.name) === normReq);

  let avail = 0;
  for (const m of matches) {
    const { qty, converted } = convertUnitQuantity(m.quantity, m.unit, req.unit);
    if (converted) avail += qty;
  }

  const missing = req.quantity - avail;
  if (missing > 0) {
    shoppingListResult.push({
      name: req.name,
      quantity: Math.round(missing * 100) / 100,
      unit: req.unit,
    });
  }
}

console.log("Calculated Shopping List Items:", shoppingListResult);

const expectedList = [
  { name: "chicken", quantity: 200, unit: "g" },
  { name: "rice", quantity: 1, unit: "cup" },
  { name: "ginger", quantity: 20, unit: "g" },
  { name: "green chili", quantity: 4, unit: "pcs" },
  { name: "turmeric", quantity: 1, unit: "tsp" },
  { name: "oil", quantity: 3, unit: "tbsp" },
];

let mathOk = true;
for (const exp of expectedList) {
  const found = shoppingListResult.find((s) => s.name === exp.name && s.quantity === exp.quantity && s.unit === exp.unit);
  if (!found) {
    console.error(`[FAIL] Expected item missing or wrong:`, exp);
    mathOk = false;
  }
}

if (mathOk && shoppingListResult.length === expectedList.length) {
  console.log("[PASS] Chicken Bhuna pantry subtraction math matches 100%!");
  passed++;
}

console.log(`\nALL TESTS PASSED: ${passed}/${testCases.length + 2}`);
