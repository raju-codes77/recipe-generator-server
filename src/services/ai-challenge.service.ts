import { Type, Schema } from "@google/genai";
import { groqClient, getGroqModel } from "../config/groq.js";
import { geminiClient, GEMINI_MODEL, withAIRetry } from "../config/ai.config.js";

const challengeSchema: Schema = {
  type: Type.ARRAY,
  description: "List of exactly 1 cooking and health challenge.",
  items: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: "A catchy title for the challenge" },
      description: { type: Type.STRING, description: "A short, engaging description of the challenge goal." },
      durationDays: { type: Type.INTEGER, description: "Duration in days (e.g., 3, 5, 7)." },
      difficulty: { type: Type.STRING, description: "Difficulty level: Beginner, Intermediate, or Advanced." },
      rewardPoints: { type: Type.INTEGER, description: "XP rewarded upon completion (e.g., 50, 100, 200)." },
      coverImage: { type: Type.STRING, description: "An Unsplash image URL that matches the theme." },
      days: {
        type: Type.ARRAY,
        description: "The daily tasks for the challenge. Array length must match durationDays.",
        items: {
          type: Type.OBJECT,
          properties: {
            dayNumber: { type: Type.INTEGER, description: "The day number (1, 2, 3...)" },
            title: { type: Type.STRING, description: "Title of the day's task." },
            description: { type: Type.STRING, description: "Description of the cooking or healthy eating task." }
          },
          required: ["dayNumber", "title", "description"]
        }
      }
    },
    required: ["title", "description", "durationDays", "difficulty", "rewardPoints", "coverImage", "days"]
  }
};

export async function generateAIChallenges(personalizationContext?: string) {
  const prompt = `
    You are an expert chef and nutritionist for the FoodCanvas app.
    Generate 1 diverse, engaging, and unique cooking or healthy eating challenge.
    ${personalizationContext ? `Tailor the challenge to this user context: ${personalizationContext}` : 'Make it generally appealing to a wide audience.'}
    
    CRITICAL INSTRUCTIONS:
    1. The "description" field MUST be a short, actionable overview (e.g., "Reset your taste buds by reducing added sugar and focusing on whole foods.").
    2. The "days" array MUST represent actionable "Mission Points".
    3. Each day's "title" MUST begin with an appropriate emoji (e.g., "🥤 Day 1 — Cut Sugary Drinks").
    4. Each day's "description" MUST contain a direct, actionable instruction (e.g., "Avoid soft drinks, packaged juices, and sweetened beverages.").
    5. Generate practical, achievable actions relevant to the challenge's difficulty and category.
    6. Do NOT include any markdown formatting. Generate structured JSON exactly matching the schema.
    
    Ensure the output strictly adheres to the requested JSON schema.
    Use high-quality unsplash image URLs for the coverImage, for example: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=1200&auto=format&fit=crop&q=80' (vary the photo IDs based on the topic).
  `;

  try {
    if (!geminiClient) throw new Error("Gemini AI is not configured.");

    const response = await withAIRetry(
      async () => {
        return await geminiClient!.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: challengeSchema,
          }
        });
      },
      "Gemini AI Challenge",
      3
    );

    if (!response.text) throw new Error("No response from AI");
    
    const challenges = JSON.parse(response.text);
    return challenges;
  } catch (error: any) {
    console.warn("Gemini failed, falling back to Groq:", error.message);
    try {
      const groqPrompt = prompt + "\n\n" + "Respond with ONLY raw JSON like: { \"challenges\": [ { ... } ] }. Use this schema for the items: " + JSON.stringify(challengeSchema.items);
      const completion = await groqClient.chat.completions.create({
        model: getGroqModel(),
        messages: [
          { role: "system", content: "You always respond with valid raw JSON only. Return a JSON object with a 'challenges' key containing an array of exactly 1 challenge." },
          { role: "user", content: groqPrompt },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) throw new Error("Empty response from Groq");
      
      const result = JSON.parse(raw);
      if (result.challenges && Array.isArray(result.challenges)) {
        return result.challenges;
      }
      return [result]; // fallback if it just returns the object directly
    } catch (groqError: any) {
      console.error("Groq fallback also failed:", groqError.message);
      throw groqError;
    }
  }
}
