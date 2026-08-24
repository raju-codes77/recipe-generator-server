import { GoogleGenerativeAI } from "@google/generative-ai";
// import { PrismaClient } from "@prisma/client";
import { GenerateRecipeRequestBody, Recipe } from "./pantryToPlate.types";
import { PrismaClient } from "@prisma/client/extension";

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function generateAndSaveRecipe(payload: GenerateRecipeRequestBody): Promise<Recipe> {
  const { ingredients, cuisine, mealType, cookingTime, diet, servings, selectedOptions } = payload;

  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `Generate a recipe as strict JSON only (no markdown, no code fences) with this exact shape:
{
  "title": string, "description": string, "image": string (a relevant unsplash URL),
  "time": string, "level": string, "kcal": string, "protein": string,
  "whyChosen": string, "ingredients": string[], "instructions": string[]
}
Ingredients available: ${ingredients.join(", ")}
Cuisine: ${cuisine}, Meal: ${mealType}, Time limit: ${cookingTime}, Diet: ${diet}, Servings: ${servings}, Extra: ${selectedOptions.join(", ")}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().replace(/```json|```/g, "").trim();
  const recipe: Recipe = JSON.parse(text);

  await prisma.pantryRecipe.create({ data: recipe });

  return recipe;
}