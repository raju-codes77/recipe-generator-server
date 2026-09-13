// import Groq from "groq-sdk";
// import { prisma } from "../../lib/prisma"; // 👈 shared instance import — path tomar actual folder depth onujayi thik koro
// import { GenerateRecipeRequestBody, Recipe } from "./pantryToPlate.types";

// const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

// export async function generateAndSaveRecipe(payload: GenerateRecipeRequestBody): Promise<Recipe> {
//   const { ingredients, cuisine, mealType, cookingTime, diet, servings, selectedOptions } = payload;

//   const prompt = `Generate a recipe as strict JSON only (no markdown, no extra text) with this exact shape:
// {
//   "title": string, "description": string, "image": string (a relevant unsplash URL),
//   "time": string, "level": string, "kcal": string, "protein": string,
//   "whyChosen": string, "ingredients": string[], "instructions": string[]
// }
// Ingredients available: ${ingredients.join(", ")}
// Cuisine: ${cuisine}, Meal: ${mealType}, Time limit: ${cookingTime}, Diet: ${diet}, Servings: ${servings}, Extra: ${selectedOptions.join(", ")}`;

//   const completion = await groq.chat.completions.create({
//     messages: [{ role: "user", content: prompt }],
//     model: "llama-3.3-70b-versatile",
//     response_format: { type: "json_object" },
//   });

//   const text = completion.choices[0]?.message?.content;
//   if (!text) throw new Error("Empty response from Groq");

//  // AI response theke recipe generate korar por:
// const recipe: Recipe = JSON.parse(text);

// // image field ta reliable Unsplash search URL diye override koro
// recipe.image = `https://source.unsplash.com/800x600/?${encodeURIComponent(recipe.title)},food`;

// await prisma.pantryRecipe.create({ data: recipe });

//   return recipe;
// }