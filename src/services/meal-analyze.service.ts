
// Import Gemini AI SDK
import { GoogleGenAI } from "@google/genai";

// Import Supabase image upload function
import { uploadMealImage } from "./storage.service.js";

// Check if Gemini API key is loaded
console.log(
  "MEALDB_API_KEY exists:",
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

Analyze the uploaded image.

First determine whether the image contains FOOD.

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
  "confidenceScore": 0,
  "detectedFoods": [
    {
      "name": "",
      "portion": "",
      "emoji": ""
    }
  ],
  "nutritionFacts": {
    "kcal": 0,
    "protein": 0,
    "carbs": 0,
    "fat": 0,
    "fiber": 0,
    "sugar": 0,
    "sodium": 0,
    "cholesterol": 0
  },
  "mealName": "",
  "category": "",
  "insightHeading": "",
  "insightMessage": "",
  "tips": [
    {
      "emoji": "",
      "tip": ""
    }
  ]
}

Rules:
- confidenceScore must be between 0 and 100.
- Nutrition values should be reasonable estimates.
- kcal, protein, carbs, fat, fiber, sugar, sodium and cholesterol must be numbers.
- Do not invent foods that are not reasonably visible.
- If the image is unclear or does not contain food, set isFood to false.
- Return JSON only. No markdown. No explanation outside JSON.
`;

  // Maximum number of Gemini API attempts
  const maxAttempts = 3;

  // Store successful Gemini response
  let response:
    | Awaited<ReturnType<typeof ai.models.generateContent>>
    | undefined;

  // Retry Gemini request for temporary failures
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(
        `Gemini meal analysis attempt ${attempt}/${maxAttempts}`
      );

      response = await ai.models.generateContent({
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

      // Request succeeded
      break;
    } catch (error) {
      // TypeScript-safe error handling
      const errorMessage =
        error instanceof Error
          ? error.message
          : String(error);

      console.error(
        `Gemini API attempt ${attempt} failed:`,
        error
      );

      // Normalize message for checking
      const normalizedError = errorMessage.toLowerCase();

      // Check whether the failure is temporary
      const isTemporary =
        normalizedError.includes("503") ||
        normalizedError.includes("unavailable") ||
        normalizedError.includes("high demand") ||
        normalizedError.includes("fetch failed") ||
        normalizedError.includes("etimedout") ||
        normalizedError.includes("econnreset") ||
        normalizedError.includes("timeout");

      // Permanent error → stop immediately
      if (!isTemporary) {
        throw error instanceof Error
          ? error
          : new Error(errorMessage);
      }

      // No more attempts left
      if (attempt === maxAttempts) {
        console.error(
          "Gemini API failed after all retry attempts:",
          error
        );

        throw new Error(
          "The AI service is currently busy. Please try again in a moment."
        );
      }

      // Exponential backoff
      // Attempt 1 fails → wait 1 second
      // Attempt 2 fails → wait 2 seconds
      const delayMs = 1000 * Math.pow(2, attempt - 1);

      console.log(
        `Temporary Gemini error detected. Retrying in ${delayMs}ms...`
      );

      await new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }

  // Safety check: response must exist after successful request
  if (!response) {
    throw new Error(
      "The AI service did not return a response. Please try again."
    );
  }

  // Get Gemini's text response
  const text = response.text?.trim();

  // Check if Gemini returned an empty response
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  // Store the parsed Gemini result
  let analysis: any;

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

