import { prisma } from "./prisma.js";

/**
 * Records a meaningful user activity.
 * Updates lastActivityAt and resets inactivityReminderStage to 0 if they were previously inactive.
 */
export async function recordUserActivity(userId: string) {
  if (!userId) return;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { inactivityReminderStage: true },
    });

    if (!user) return;

    await prisma.user.update({
      where: { id: userId },
      data: {
        lastActivityAt: new Date(),
        // If they had previously received a reminder, reset their stage so the cycle starts fresh
        inactivityReminderStage: user.inactivityReminderStage > 0 ? 0 : undefined,
      },
    });
  } catch (error) {
    console.error(`[Activity] Failed to record activity for user ${userId}:`, error);
  }
}

