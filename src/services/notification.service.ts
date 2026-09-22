import { prisma } from "../lib/prisma.js";

export type NotificationType =
  | "POST_LIKE"
  | "POST_COMMENT"
  | "FOLLOW"
  | "MESSAGE"
  | "MEAL_ANALYSIS_SUCCESS"
  | "MEAL_TRACK_SUCCESS"
  | "MEAL_PLAN_SUCCESS"
  | "BUDGET_MEAL_PLAN_SUCCESS"
  | "GENERAL";

interface CreateNotificationParams {
  userId: string;
  actorId?: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
  relatedPostId?: string;
}

export const NotificationService = {
  /**
   * Create a notification. Avoids duplicates for likes and follows by checking existing.
   */
  async createNotification(params: CreateNotificationParams) {
    try {
      // 1. Verify user exists
      const user = await prisma.user.findUnique({
        where: { id: params.userId },
        select: { id: true },
      });
      if (!user) return null;

      // 2. Prevent self-notifications for social interactions
      if (params.actorId && params.actorId === params.userId) {
        return null;
      }

      // 3. Duplicate prevention for specific events
      if (params.type === "POST_LIKE" && params.actorId && params.relatedPostId) {
        const existing = await prisma.notification.findFirst({
          where: {
            userId: params.userId,
            actorId: params.actorId,
            type: "POST_LIKE",
            relatedPostId: params.relatedPostId,
          },
        });
        if (existing) return existing;
      }

      if (params.type === "FOLLOW" && params.actorId) {
        const existing = await prisma.notification.findFirst({
          where: {
            userId: params.userId,
            actorId: params.actorId,
            type: "FOLLOW",
          },
        });
        if (existing) return existing;
      }

      // 4. Create the notification
      const notification = await prisma.notification.create({
        data: params,
      });

      return notification;
    } catch (error) {
      console.error("[NotificationService] createNotification error:", error);
      // We don't throw to avoid breaking the main feature flows
      return null;
    }
  },

  /**
   * Get user notifications with pagination
   */
  async getUserNotifications(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [notifications, unreadCount, totalCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.notification.count({
        where: { userId, isRead: false },
      }),
      prisma.notification.count({
        where: { userId },
      }),
    ]);

    // Format with simulated actor if needed (in a real app, actor could be a relation, 
    // but here we just fetch actor details if actorId exists)
    // To keep it lightweight and fast, we'll fetch unique actorIds and attach basic info.
    const actorIds = [...new Set(notifications.map(n => n.actorId).filter(Boolean) as string[])];
    let actorsMap: Record<string, any> = {};
    
    if (actorIds.length > 0) {
      const actors = await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, image: true },
      });
      actorsMap = actors.reduce((acc, a) => {
        acc[a.id] = a;
        return acc;
      }, {} as Record<string, any>);
    }

    const formattedNotifications = notifications.map(n => ({
      ...n,
      actor: n.actorId ? actorsMap[n.actorId] || null : null,
    }));

    return {
      notifications: formattedNotifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total: totalCount,
        hasNextPage: skip + limit < totalCount,
      }
    };
  },

  /**
   * Mark a specific notification as read
   */
  async markAsRead(notificationId: string, userId: string) {
    // Verify ownership implicitly by including userId in where clause
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) return null;

    return prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  },

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
};
