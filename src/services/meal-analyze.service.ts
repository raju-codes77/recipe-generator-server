// Import Gemini AI SDK
import { GoogleGenAI } from "@google/genai";

// Import Supabase image upload function
import { uploadMealImage } from "./storage.service";

// Check if Gemini API key is loaded
console.log(
  "GEMINI_API_KEY exists:",
  !!process.env.MEALDB_API_KEY
);

// Create Gemini AI client
const ai = new GoogleGenAI({
  apiKey: process.env.MEALDB_API_KEY!,
});
// Define the image data required for analysis
interface AnalyzeMealInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

// Analyze the uploaded meal image
export const analyzeMeal = async ({
  buffer,
  originalName,
  mimeType,
}: AnalyzeMealInput) => {
  // Convert image buffer to Base64 for Gemini
  const base64Image = buffer.toString("base64");

  // Tell Gemini how to analyze the image
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

  // Send the image and prompt to Gemini
  const response = await ai.models.generateContent({
  model: "gemini-3.6-flash",
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
  // Get Gemini's text response
  const text = response.text?.trim();

  // Check if Gemini returned an empty response
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  // Store the parsed Gemini result
  let analysis;

  // Try to convert Gemini response from JSON text to JavaScript object
  try {
    analysis = JSON.parse(text);
  } catch {
    // Remove Markdown code blocks if Gemini adds them
    const cleanedText = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    // Try parsing the cleaned response again
    try {
      analysis = JSON.parse(cleanedText);
    } catch {
      // Stop if the response is still not valid JSON
      throw new Error("Invalid JSON response from Gemini.");
    }
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
    isFood: true,
    imageUrl,
    ...analysis,
  };
};