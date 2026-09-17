import { prisma } from "../lib/prisma.js";

/**
 * Track an AI usage event.
 * @param toolName The name of the AI tool (e.g., "RECIPES", "NUTRITION", "WELLNESS", "TASTE", "CHALLENGES", "PHOTOS")
 * @param userId (Optional) The ID of the user who performed the action
 */
export const trackAiUsage = async (toolName: string, userId?: string) => {
  try {
    await prisma.aiUsageEvent.create({
      data: {
        toolName,
        userId: userId || null,
      },
    });
    console.log(`Tracked AI Usage: ${toolName}`);
  } catch (error) {
    console.error("Failed to track AI usage:", error);
    // Non-blocking error
  }
};
