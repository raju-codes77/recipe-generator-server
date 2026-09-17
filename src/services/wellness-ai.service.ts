import { groqClient, getGroqModel } from "../config/groq.js";
import { geminiClient, GEMINI_MODEL, withAIRetry } from "../config/ai.config.js";

const SAFE_FALLBACK_TIPS = [
  "💧 Remember to stay hydrated and take a short break.",
  "🧘 Take a deep breath and relax your shoulders for a moment.",
  "🏃 Take a short stretch break if you've been sitting for a while.",
  "🍎 Try adding a variety of colorful vegetables to your meals today.",
  "😴 Ensure you get enough rest tonight to recharge your body.",
];

export async function generateWellnessTip(categories: string[]): Promise<string> {
  const categoriesStr = categories.length > 0 ? categories.join(", ") : "general wellness";

  const prompt = `
You are the FoodCanvas AI Wellness Assistant.
Generate one short, friendly, practical wellness reminder based on these categories: ${categoriesStr}.

The reminder must:
- Be suitable for general users.
- Be concise.
- Be easy to understand.
- Be supportive and non-judgmental.
- Focus only on general wellness.
- Never diagnose medical conditions.
- Never prescribe medication.
- Never provide emergency medical advice.
- Never make strong medical claims.
- Never shame the user.
- Never mention that you are an AI.
- Return ONLY the reminder text, nothing else.
Maximum 25 words.
  `.trim();

  try {
    if (!geminiClient) throw new Error("Gemini AI is not configured.");
    
    // 1. Try Gemini
    const response = await withAIRetry(
      async () => {
        return await geminiClient!.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
        });
      },
      "Gemini Wellness Reminder",
      3
    );

    if (response.text) {
      return response.text.trim().replace(/^["']|["']$/g, '');
    }
    throw new Error("Empty response from Gemini");
  } catch (error: any) {
    console.warn("Gemini wellness generation failed, falling back to Groq:", error.message);
    
    try {
      // 2. Try Groq
      const completion = await groqClient.chat.completions.create({
        model: getGroqModel(),
        messages: [
          { role: "system", content: "You are a helpful wellness assistant. Return only the short tip text." },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      });

      const raw = completion.choices[0]?.message?.content;
      if (raw) {
         return raw.trim().replace(/^["']|["']$/g, '');
      }
      throw new Error("Empty response from Groq");
    } catch (groqError: any) {
      console.error("Groq fallback also failed for wellness tip:", groqError.message);
      
      // 3. Hardcoded Fallback
      return SAFE_FALLBACK_TIPS[Math.floor(Math.random() * SAFE_FALLBACK_TIPS.length)];
    }
  }
}
