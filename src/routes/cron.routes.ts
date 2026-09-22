import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { sendInactivityReminderEmail } from "../services/emailService.js";

const router = Router();

// Endpoint secured by an environment variable to prevent arbitrary public calls
router.get("/inactive-users", async (req, res) => {
  // Simple auth check. In Vercel, Cron jobs can be authenticated via CRON_SECRET headers.
  // We check either Authorization header or CRON_SECRET.
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (
    cronSecret &&
    authHeader !== `Bearer ${cronSecret}` &&
    req.headers["x-vercel-cron"] !== "1"
  ) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const now = new Date();
    // 3 days ago
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    // 7 days ago
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Fetch users for 7-day reminder (Stage 1 -> Stage 2)
    const usersFor7Day = await prisma.user.findMany({
      where: {
        lastActivityAt: { lt: sevenDaysAgo },
        inactivityReminderStage: 1, // Only send if they already got the 3-day reminder
      },
      select: { id: true, email: true, name: true },
    });

    // Fetch users for 3-day reminder (Stage 0 -> Stage 1)
    const usersFor3Day = await prisma.user.findMany({
      where: {
        lastActivityAt: { lt: threeDaysAgo },
        inactivityReminderStage: 0,
      },
      select: { id: true, email: true, name: true },
    });

    const results = {
      threeDayEmails: 0,
      sevenDayEmails: 0,
      failed: 0,
    };

    // Process 7-day reminders
    for (const user of usersFor7Day) {
      // Atomic claim
      const claim = await prisma.user.updateMany({
        where: { id: user.id, inactivityReminderStage: 1 },
        data: { inactivityReminderStage: 2 },
      });
      if (claim.count === 0) continue; // Claimed by another process

      const success = await sendInactivityReminderEmail(user.email, user.name, 2);
      if (success) {
        results.sevenDayEmails++;
      } else {
        // Rollback state so it can be tried again next time
        await prisma.user.update({
          where: { id: user.id },
          data: { inactivityReminderStage: 1 },
        });
        results.failed++;
      }
    }

    // Process 3-day reminders
    for (const user of usersFor3Day) {
      // Atomic claim
      const claim = await prisma.user.updateMany({
        where: { id: user.id, inactivityReminderStage: 0 },
        data: { inactivityReminderStage: 1 },
      });
      if (claim.count === 0) continue; // Claimed by another process

      const success = await sendInactivityReminderEmail(user.email, user.name, 1);
      if (success) {
        results.threeDayEmails++;
      } else {
        // Rollback state so it can be tried again next time
        await prisma.user.update({
          where: { id: user.id },
          data: { inactivityReminderStage: 0 },
        });
        results.failed++;
      }
    }

    console.log("[Cron] Inactive users job completed:", results);
    res.status(200).json({ success: true, results });
  } catch (error) {
    console.error("[Cron] Error processing inactive users:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
