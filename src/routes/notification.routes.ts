import { Router } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth.js";
import { NotificationService } from "../services/notification.service.js";

const router = Router();

// Middleware to protect routes and inject userId
router.use(async (req, res, next) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session || !session.user || !session.user.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    (req as any).userId = session.user.id;
    next();
  } catch (error) {
    console.error("[NotificationAuth] Error:", error);
    res.status(401).json({ success: false, message: "Unauthorized" });
  }
});

// GET /api/notifications
router.get("/", async (req, res) => {
  try {
    const userId = (req as any).userId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const data = await NotificationService.getUserNotifications(userId, page, limit);

    return res.status(200).json({
      success: true,
      ...data
    });
  } catch (error) {
    console.error("[NotificationRoutes] GET / error:", error);
    return res.status(500).json({ success: false, message: "Unable to load notifications." });
  }
});

// PATCH /api/notifications/read-all
router.patch("/read-all", async (req, res) => {
  try {
    const userId = (req as any).userId;
    await NotificationService.markAllAsRead(userId);

    return res.status(200).json({ success: true, message: "All notifications marked as read." });
  } catch (error) {
    console.error("[NotificationRoutes] PATCH /read-all error:", error);
    return res.status(500).json({ success: false, message: "Unable to mark all notifications as read." });
  }
});

// PATCH /api/notifications/:id/read
router.patch("/:id/read", async (req, res) => {
  try {
    const userId = (req as any).userId;
    const notificationId = req.params.id;

    const notification = await NotificationService.markAsRead(notificationId, userId);

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found or access denied." });
    }

    return res.status(200).json({ success: true, notification });
  } catch (error) {
    console.error("[NotificationRoutes] PATCH /:id/read error:", error);
    return res.status(500).json({ success: false, message: "Unable to mark notification as read." });
  }
});

export default router;
