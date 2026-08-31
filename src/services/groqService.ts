import { groqClient, GROQ_MODEL } from "../config/groq";
import { getRecipeImageUrl } from "../utils/image";

export interface GenerateInput {
  ingredients: string[];
  cuisine: string;
  mealType: string;
  cookingTime: string;
  diet: string;
  servings: string;
  selectedOptions: string[];
}

export interface FormattedRecipe {
  title: string;
  description: string;
  image: string;
  time: string;      // "28m"
  level: string;      // "Easy"
  kcal: string;        // "520"
  protein: string;    // "36g"
  whyChosen: string;
  ingredients: string[];
  instructions: string[];
}

interface RawAIRecipe {
  title: string;
  description: string;
  timeMinutes: number;
  difficulty: "Easy" | "Medium" | "Hard";
  calories: number;
  proteinGrams: number;
  ingredients: string[];
  instructions: string[];
  whyChosen: string;
  imageQuery: string;
}

function formatRecipe(raw: RawAIRecipe): FormattedRecipe {
  return {
    title: raw.title,
    description: raw.description,
    image: getRecipeImageUrl(raw.imageQuery),
    time: `${raw.timeMinutes}m`,
    level: raw.difficulty,
    kcal: `${raw.calories}`,
    protein: `${raw.proteinGrams}g`,
    whyChosen: raw.whyChosen,
    ingredients: raw.ingredients,
    instructions: raw.instructions,
  };
}

function generatePrompt(input: GenerateInput) {
  return `You are a professional chef AI. Generate ONE recipe as raw JSON only (no markdown), matching exactly this schema:

{
  "title": string,
  "description": string (1-2 sentences),
  "timeMinutes": number,
  "difficulty": "Easy" | "Medium" | "Hard",
  "calories": number (per serving),
  "proteinGrams": number (per serving),
  "ingredients": string[] (with quantities),
  "instructions": string[] (plain steps, no numbering),
  "whyChosen": string (1-2 sentences),
  "imageQuery": string (2-4 words for food photo search)
}

Pantry ingredients: ${input.ingredients.join(", ")}
Cuisine: ${input.cuisine}
Meal type: ${input.mealType}
Max cooking time: ${input.cookingTime}
Diet: ${input.diet}
Servings: ${input.servings}
Special AI options: ${input.selectedOptions.join(", ") || "none"}

Rules:
- Use mainly the given pantry ingredients; common staples (salt, oil, spice) allowed.
- Strictly respect diet, cuisine, cooking time and special options.
- Respond with ONLY the raw JSON object.`;
}

export async function generateRecipe(input: GenerateInput): Promise<FormattedRecipe> {
  const completion = await groqClient.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: "You always respond with valid raw JSON only." },
      { role: "user", content: generatePrompt(input) },
    ],
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty response from Groq");

  const parsed: RawAIRecipe = JSON.parse(raw);
  return formatRecipe(parsed);
}

export async function refineRecipe(
  existing: FormattedRecipe,
  refinement: string
): Promise<FormattedRecipe> {
  const prompt = `Here is an existing recipe as JSON:
${JSON.stringify({
  title: existing.title,
  description: existing.description,
  timeMinutes: parseInt(existing.time),
  difficulty: existing.level,
  calories: parseInt(existing.kcal),
  proteinGrams: parseInt(existing.protein),
  ingredients: existing.ingredients,
  instructions: existing.instructions,
  whyChosen: existing.whyChosen,
})}

Modify this recipe based on this refinement request: "${refinement}"
(examples: "Make Healthier" = lower calories/oil, "More Protein" = add protein-rich ingredient, "Less Spicy" = remove/reduce spice, "Vegetarian" = replace meat, "Budget Friendly" = cheaper substitutes, "For More People" = scale up quantities & servings)

Respond with ONLY the updated raw JSON, same schema:
{
  "title": string,
  "description": string,
  "timeMinutes": number,
  "difficulty": "Easy" | "Medium" | "Hard",
  "calories": number,
  "proteinGrams": number,
  "ingredients": string[],
  "instructions": string[],
  "whyChosen": string,
  "imageQuery": string
}`;

  const completion = await groqClient.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: "You always respond with valid raw JSON only." },
      { role: "user", content: prompt },
    ],
    temperature: 0.6,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Empty response from Groq");

  const parsed: RawAIRecipe = JSON.parse(raw);
  return formatRecipe(parsed);
}