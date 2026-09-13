import { Router, Request, Response } from "express";
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { prisma } from "../src/lib/prisma.js";
import { auth } from "../src/lib/auth.js";
import { groqClient, getGroqModel } from "../src/config/groq.js";

const router = Router();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

async function getUserId(req: Request): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

function buildProfileContext(profile: any) {
  if (!profile) return "";
  return `
User Meal Profile:
- Food Preference: ${profile.foodPreference}
- Favorite Cuisines: ${profile.favoriteCuisines?.join(", ")}
- Liked Foods: ${profile.likedFoods?.join(", ")}
- Disliked Foods: ${profile.dislikedFoods?.join(", ")}
- Allergies (CRITICAL): ${profile.allergies?.join(", ")}
- Dietary Restrictions: ${profile.dietaryRestrictions?.join(", ")}
- Health Goal: ${profile.healthGoal}
- Meals per day: ${profile.dailyMeals}
- Meal Preferences: ${profile.mealPreferences?.join(", ")}
- Cooking Time: ${profile.cookingTime}
${profile.dailyCalorieTarget ? `- Target Calories: ~${profile.dailyCalorieTarget} kcal/day` : ""}
  `;
}

// ─── Gemini Structured Response Schema ──────────────────────────────────────
const mealSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    description: { type: Type.STRING },
    calories: { type: Type.INTEGER },
    protein: { type: Type.INTEGER },
    ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
    prepTime: { type: Type.STRING },
    estimatedCost: { type: Type.NUMBER }, // Optional for budget mode
  },
  required: ["name", "description", "calories", "protein", "ingredients", "prepTime"]
};

const dayPlanSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    day: { type: Type.INTEGER },
    date: { type: Type.STRING },
    meals: {
      type: Type.OBJECT,
      properties: {
        breakfast: mealSchema,
        morningSnack: mealSchema,
        lunch: mealSchema,
        eveningSnack: mealSchema,
        dinner: mealSchema
      }
    },
    dailyTotals: {
      type: Type.OBJECT,
      properties: {
        calories: { type: Type.INTEGER },
        protein: { type: Type.INTEGER },
        carbs: { type: Type.INTEGER },
        fat: { type: Type.INTEGER },
        estimatedCost: { type: Type.NUMBER }
      },
      required: ["calories", "protein", "carbs", "fat"]
    }
  },
  required: ["day", "date", "meals", "dailyTotals"]
};

const baseResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    days: {
      type: Type.ARRAY,
      items: dayPlanSchema
    },
    summary: {
      type: Type.OBJECT,
      properties: {
        averageDailyCalories: { type: Type.INTEGER },
        averageProtein: { type: Type.INTEGER }
      },
      required: ["averageDailyCalories", "averageProtein"]
    }
  },
  required: ["days", "summary"]
};

const budgetResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    location: {
      type: Type.OBJECT,
      properties: { country: { type: Type.STRING }, city: { type: Type.STRING } },
      required: ["country", "city"]
    },
    budget: {
      type: Type.OBJECT,
      properties: { amount: { type: Type.NUMBER }, currency: { type: Type.STRING }, type: { type: Type.STRING } },
      required: ["amount", "currency", "type"]
    },
    totalEstimatedCost: { type: Type.NUMBER },
    days: { type: Type.ARRAY, items: dayPlanSchema },
    summary: {
      type: Type.OBJECT,
      properties: {
        averageDailyCalories: { type: Type.INTEGER },
        averageProtein: { type: Type.INTEGER },
        averageDailyCost: { type: Type.NUMBER }
      },
      required: ["averageDailyCalories", "averageProtein", "averageDailyCost"]
    },
    shoppingList: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          quantity: { type: Type.STRING },
          estimatedCost: { type: Type.NUMBER }
        },
        required: ["name", "quantity", "estimatedCost"]
      }
    },
    nearbyStores: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          distance: { type: Type.STRING },
          location: { type: Type.STRING },
          priceInfo: { type: Type.STRING }
        },
        required: ["name", "distance", "location", "priceInfo"]
      }
    }
  },
  required: ["location", "budget", "totalEstimatedCost", "days", "summary", "shoppingList", "nearbyStores"]
};


// ─── POST /api/meal-planner/generate (Standard Mode) ──────────────────────────
router.post("/generate", async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const profile = await prisma.mealProfile.findUnique({ where: { userId } });
  const profileContext = buildProfileContext(profile);

  const { days = 7 } = req.body;
  if (![3, 7, 14].includes(days)) {
    return res.status(400).json({ message: "Days must be 3, 7, or 14" });
  }

  try {
    const prompt = `You are an expert AI Nutritionist and Chef. 
Generate a personalized ${days}-day meal plan.

${profileContext ? profileContext : "No specific user profile provided."}

CRITICAL RULES:
1. NEVER include any ingredient that appears in the user's allergy list. This is a hard restriction.
2. Adhere to dietary restrictions and food preferences.
3. If specific meals (e.g. Snacks) are NOT requested in Meal Preferences, omit them from the meals object. Include only requested meal types.
4. Provide realistic, appetizing meals with prep times and macros.
5. EXACTLY return an array of ${days} days in the "days" field. Do not return more or fewer days. This is a strict requirement.

Respond strictly according to the required JSON schema.`;

    let text: string | undefined;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: baseResponseSchema,
          temperature: 0.6,
        }
      });
      text = response.text?.trim();
    } catch (geminiErr: any) {
      const errStr = String(geminiErr).toLowerCase();
      const isTemporary =
        errStr.includes("503") ||
        errStr.includes("unavailable") ||
        errStr.includes("high demand") ||
        errStr.includes("fetch failed") ||
        errStr.includes("timeout") ||
        errStr.includes("too many requests") ||
        errStr.includes("429");

      if (isTemporary) {
        console.log("Gemini is busy, falling back to Groq for standard meal planner");
        const groqPrompt = prompt + `\n\nRespond ONLY with a raw JSON object matching this exact schema: ${JSON.stringify(baseResponseSchema)}`;
        const completion = await groqClient.chat.completions.create({
          model: getGroqModel(),
          messages: [
            { role: "system", content: "You always respond with valid raw JSON only." },
            { role: "user", content: groqPrompt },
          ],
          temperature: 0.6,
          response_format: { type: "json_object" },
        });
        text = completion.choices[0]?.message?.content?.trim();
      } else {
        throw geminiErr;
      }
    }

    if (!text) throw new Error("Empty AI response");

    const parsed = JSON.parse(text);
    return res.status(200).json(parsed);
  } catch (err: any) {
    console.error("[MEAL-PLANNER GENERATE]", err.message);
    return res.status(500).json({ message: "Failed to generate meal plan", error: err.message });
  }
});

// ─── POST /api/meal-planner/generate-budget (Budget Mode) ─────────────────────
router.post("/generate-budget", async (req: Request, res: Response) => {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const profile = await prisma.mealProfile.findUnique({ where: { userId } });
  const profileContext = buildProfileContext(profile);

  const {
    country,
    city,
    currency,
    budget,
    days = 7
  } = req.body;

  if (![3, 7, 14].includes(days)) {
    return res.status(400).json({ message: "Days must be 3, 7, or 14" });
  }
  if (!country || !currency || !budget) {
    return res.status(400).json({ message: "Country, currency, and budget are required" });
  }

  try {
    const prompt = `You are a highly capable AI Chef and Local Shopping Expert for ${city}, ${country}.
Generate a ${days}-day budget meal plan that fits within a budget of ${currency}${budget}.

${profileContext ? profileContext : "No specific user profile provided."}

CRITICAL RULES:
1. NEVER include any ingredient that appears in the user's allergy list. This is a hard restriction.
2. RECOMMEND AUTHENTIC LOCAL FOODS based on the country (${country}). Do not generate a generic Western diet if the country is not Western (e.g., for Bangladesh, recommend rice, dal, bhorta).
3. ESTIMATE PRICES ACCURATELY in ${currency}. Ensure the total estimated cost of all meals + ingredients stays close to but under the ${currency}${budget} budget. Include 'estimatedCost' for each meal and daily total.
4. RECOMMEND 3 NEARBY GROCERY STORES/MARKETS in or near ${city}, ${country}. Provide estimated distances and price context.
5. If Snacks are NOT in the Meal Preferences, do not include them.
6. EXACTLY return an array of ${days} days in the "days" field. Do not return more or fewer days. This is a strict requirement.

Respond strictly according to the required JSON schema.`;

    let text: string | undefined;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: budgetResponseSchema,
          temperature: 0.6,
        }
      });
      text = response.text?.trim();
    } catch (geminiErr: any) {
      const errStr = String(geminiErr).toLowerCase();
      const isTemporary =
        errStr.includes("503") ||
        errStr.includes("unavailable") ||
        errStr.includes("high demand") ||
        errStr.includes("fetch failed") ||
        errStr.includes("timeout") ||
        errStr.includes("too many requests") ||
        errStr.includes("429");

      if (isTemporary) {
        console.log("Gemini is busy, falling back to Groq for budget meal planner");
        const groqPrompt = prompt + `\n\nRespond ONLY with a raw JSON object matching this exact schema: ${JSON.stringify(budgetResponseSchema)}`;
        const completion = await groqClient.chat.completions.create({
          model: getGroqModel(),
          messages: [
            { role: "system", content: "You always respond with valid raw JSON only." },
            { role: "user", content: groqPrompt },
          ],
          temperature: 0.6,
          response_format: { type: "json_object" },
        });
        text = completion.choices[0]?.message?.content?.trim();
      } else {
        throw geminiErr;
      }
    }

    if (!text) throw new Error("Empty AI response");

    const parsed = JSON.parse(text);
    return res.status(200).json(parsed);
  } catch (err: any) {
    console.error("[MEAL-PLANNER BUDGET]", err.message);
    return res.status(500).json({ message: "Failed to generate budget meal plan", error: err.message });
  }
});

// ─── POST /api/meal-planner/shopping-list (Legacy Mode Support) ──────────────
router.post("/shopping-list", async (req: Request, res: Response) => {
  const { mealPlan } = req.body;
  if (!mealPlan || !mealPlan.days) {
    return res.status(400).json({ message: "mealPlan with days array is required" });
  }

  try {
    const mealsText = mealPlan.days.flatMap((d: any) => {
      const ms = [];
      if (d.meals.breakfast) ms.push(`${d.meals.breakfast.name} (ingredients: ${d.meals.breakfast.ingredients?.join(", ") || "varies"})`);
      if (d.meals.lunch) ms.push(`${d.meals.lunch.name} (ingredients: ${d.meals.lunch.ingredients?.join(", ") || "varies"})`);
      if (d.meals.dinner) ms.push(`${d.meals.dinner.name} (ingredients: ${d.meals.dinner.ingredients?.join(", ") || "varies"})`);
      return ms;
    }).join("\n");

    const prompt = `Based on this meal plan:
${mealsText}

Generate a complete shopping list. Combine duplicate ingredients.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  quantity: { type: Type.STRING },
                  category: { type: Type.STRING }
                },
                required: ["name", "quantity", "category"]
              }
            }
          },
          required: ["items"]
        },
        temperature: 0.4,
      }
    });

    const text = response.text?.trim();
    if (!text) throw new Error("Empty AI response");

    const parsed = JSON.parse(text);
    return res.status(200).json(parsed);
  } catch (err: any) {
    console.error("[SHOPPING-LIST]", err.message);
    return res.status(500).json({ message: "Failed to generate shopping list", error: err.message });
  }
});

export default router;
