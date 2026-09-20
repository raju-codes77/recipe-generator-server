
// Import centralized Gemini configuration
import { geminiClient, GEMINI_MEAL_MODEL, GROQ_MEAL_MODEL, withAIRetry, extractCleanJson } from "../config/ai.config.js";
import { groqClient } from "../config/groq.js";

// Import Supabase image upload function
import { uploadMealImage } from "./storage.service.js";
import { z } from "zod";

// Define the image data required for analysis
interface AnalyzeMealInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

const MealAnalysisSchema = z.object({
  isFood: z.boolean(),
  message: z.string().optional(),
  foodName: z.string().optional(),
  tag: z.string().optional(),
  detectedItems: z.array(z.object({ name: z.string(), icon: z.string() })).optional(),
  confidenceScore: z.number().optional(),
  calories: z.number().optional(),
  macros: z.array(z.object({ label: z.string(), grams: z.number(), percent: z.number(), color: z.string() })).optional(),
  micros: z.array(z.object({ label: z.string(), value: z.string(), color: z.string() })).optional(),
  healthScore: z.number().optional(),
  healthScoreLabel: z.string().optional(),
  scoreBreakdown: z.array(z.object({ label: z.string(), value: z.number() })).optional(),
  insights: z.array(z.object({ title: z.string(), description: z.string(), icon: z.string() })).optional(),
  recommendations: z.array(z.object({ title: z.string(), description: z.string(), icon: z.string() })).optional(),
});

// Analyze the uploaded meal image
export const analyzeMeal = async ({
  buffer,
  originalName,
  mimeType,
}: AnalyzeMealInput): Promise<any> => {
  // Convert image buffer to Base64 for AI providers
  const base64Image = buffer.toString("base64");

  // Tell AI how to analyze the image
  const prompt = `
You are a food and nutrition analysis assistant.

Analyze the uploaded image. First determine whether the image contains FOOD.
If it is NOT food, return ONLY this JSON:
{
  "isFood": false,
  "message": "This image does not appear to contain food."
}

If it IS food, identify the visible food items and estimate the nutrition.
Return ONLY valid JSON in this exact structure:
{
  "isFood": true,
  "message": "Food detected successfully.",
  "foodName": "Name of the meal",
  "tag": "e.g., Healthy choice, High protein",
  "detectedItems": [
    { "name": "Ingredient 1", "icon": "meat|avocado|apple|seed|leaf|default" }
  ],
  "confidenceScore": 92,
  "calories": 500,
  "macros": [
    { "label": "Protein", "grams": 40, "percent": 30, "color": "success|warning|pro" },
    { "label": "Carbs", "grams": 50, "percent": 40, "color": "success|warning|pro" },
    { "label": "Fat", "grams": 15, "percent": 30, "color": "success|warning|pro" }
  ],
  "micros": [
    { "label": "Fiber", "value": "8g", "color": "success|warning|accent" },
    { "label": "Sugar", "value": "6g", "color": "success|warning|accent" },
    { "label": "Sodium", "value": "600mg", "color": "success|warning|accent" }
  ],
  "healthScore": 8.5,
  "healthScoreLabel": "Very good",
  "scoreBreakdown": [
    { "label": "Nutrient balance", "value": 8.6 }
  ],
  "insights": [
    { "title": "Insight 1", "description": "...", "icon": "meat|cactus|scale" }
  ],
  "recommendations": [
    { "title": "Tip 1", "description": "...", "icon": "leaf|avocado|droplet" }
  ]
}

Rules:
- Make sure macros percentages roughly sum up to 100.
- Return ONLY JSON. No markdown formatting or extra text.
`;

  let rawText = "";

  try {
    if (!geminiClient) {
      throw new Error("Gemini AI is not configured.");
    }
    
    // Phase 1: Gemini Attempt (Max 2 attempts for temporary errors)
    const response = await withAIRetry(
      async () => {
        return await geminiClient!.models.generateContent({
          model: GEMINI_MEAL_MODEL,
          contents: [
            {
              inlineData: {
                mimeType,
                data: base64Image,
              },
            },
            {
              text: prompt,
            },
          ],
        });
      },
      "Gemini Meal Analysis",
      2
    );

    rawText = response.text?.trim() || "";
    
    if (!rawText) {
      throw new Error("Gemini returned an empty response.");
    }
  } catch (geminiError: any) {
    console.warn(`[Meal AI] Gemini attempt failed:`, geminiError.message || geminiError);
    
    // Phase 2: Groq Fallback
    if (!process.env.GROQ_API_KEY && !process.env.GROQ_API_KEY_PLATE_AI) {
      console.error("[Meal AI] No fallback provider configured (GROQ_API_KEY is missing).");
      throw new Error("Meal analysis is temporarily unavailable. Please try again in a moment.");
    }

    console.log(`[Meal AI] Falling back to Groq...`);
    
    try {
      const groqResponse = await withAIRetry(
        async () => {
          return await groqClient.chat.completions.create({
            model: GROQ_MEAL_MODEL,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: prompt },
                  { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } }
                ]
              }
            ],
            response_format: { type: "json_object" }
          });
        },
        "Groq Meal Analysis",
        2
      );

      rawText = groqResponse.choices[0]?.message?.content?.trim() || "";
      
      if (!rawText) {
        throw new Error("Groq returned an empty response.");
      }
      
      console.log(`[Meal AI] Groq fallback succeeded`);
    } catch (groqError: any) {
      console.error(`[Meal AI] Groq fallback failed:`, groqError.message || groqError);
      throw new Error("Meal analysis is temporarily unavailable. Please try again in a moment.");
    }
  }

  const cleanedText = extractCleanJson(rawText);

  let analysis: z.infer<typeof MealAnalysisSchema>;
  try {
    const rawData = JSON.parse(cleanedText);
    analysis = MealAnalysisSchema.parse(rawData);
  } catch (error) {
    console.error("AI Output Validation Failed:", error);
    throw new Error("Invalid or malformed JSON response from AI.");
  }

  // Stop here if the uploaded image is not food
  if (!analysis.isFood) {
    return {
      success: false,
      isFood: false,
      message:
        analysis.message ||
        "This image does not appear to contain food.",
    };
  }

  // Upload the valid food image to Supabase Storage
  const imageUrl = await uploadMealImage(
    buffer,
    originalName,
    mimeType
  );

  // Return the analysis result and uploaded image URL
  return {
    success: true,
    imageUrl,
    ...analysis,
  };
};
