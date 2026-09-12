import { Router, Request, Response } from "express";
import { prisma } from "../src/lib/prisma.js";
import { auth } from "../src/lib/auth.js";

const router = Router();

// Helper to get authenticated user
async function getAuthenticatedUser(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    if (!session?.user?.id) return null;
    return await prisma.user.findUnique({ where: { id: session.user.id } });
  } catch (error) {
    return null;
  }
}

// ─── USER DASHBOARD OVERVIEW ──────────────────────────────────────────────
router.get("/user/overview", async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const userId = user.id;

    // Dates for filtering
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const firstDayStr = firstDayOfMonth.toISOString().split('T')[0];
    const lastDayStr = lastDayOfMonth.toISOString().split('T')[0];

    // Parallel aggregate queries for performance
    const [
      recipeCount,
      collectionCount,
      activeChallenges,
      userGoal,
      recentDailyEntries,
      recentRecipes,
      userProfile,
      recentAiRecipes, // proxy for AI usage since Meal Planner doesn't persist
      monthlyDailyEntries
    ] = await Promise.all([
      prisma.recipe.count({ where: { userId } }),
      prisma.collection.count({ where: { userId } }),
      prisma.challengeParticipant.findMany({
        where: { userId, status: "ACTIVE" },
        include: { challenge: true },
        take: 3
      }),
      prisma.userGoal.findUnique({ where: { userId } }),
      prisma.dailyEntry.findMany({
        where: {
          userId,
          // Since date is stored as a string "YYYY-MM-DD", we'll just fetch all and filter or fetch last 7
        },
        orderBy: { createdAt: 'desc' },
        take: 7
      }),
      prisma.recipe.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5
      }),
      prisma.user.findUnique({
        where: { id: userId },
        include: { userBadges: { include: { badge: true } } }
      }),
      prisma.pantryRecipe.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5
      }),
      prisma.dailyEntry.findMany({
        where: {
          userId,
          date: { gte: firstDayStr, lte: lastDayStr }
        }
      })
    ]);

    // Process Daily Entries for chart and stats
    let avgKcal = 0, maxKcal = 0, minKcal = 0;
    const chartData = [];
    
    // Create an array of the last 7 dates in "YYYY-MM-DD" format
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      const entry = recentDailyEntries.find(e => e.date === dateStr);
      
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      chartData.push({
        day: dayName,
        date: dateStr,
        calories: entry ? entry.kcal : 0
      });
    }

    if (recentDailyEntries.length > 0) {
      const totalKcal = recentDailyEntries.reduce((sum, e) => sum + e.kcal, 0);
      avgKcal = Math.round(totalKcal / recentDailyEntries.length);
      maxKcal = Math.max(...recentDailyEntries.map(e => e.kcal));
      minKcal = Math.min(...recentDailyEntries.map(e => e.kcal));
    }

    return res.json({
      stats: {
        recipes: recipeCount,
        collections: collectionCount,
        activeChallenges: activeChallenges.length,
        badges: userProfile?.userBadges.length || 0,
      },
      nutrition: {
        targetKcal: userGoal?.dailyKcal || 2000,
        avgKcal,
        maxKcal,
        minKcal,
        chartData
      },
      activeChallengesList: activeChallenges,
      recentRecipes,
      recentAiRecipes,
      monthlyDailyEntries,
      userLevel: Math.max(1, Math.floor((userProfile?.userBadges.length || 0) / 2) + 1),
      streak: 0
    });

  } catch (error) {
    console.error("[USER DASHBOARD] Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ─── ADMIN DASHBOARD OVERVIEW ─────────────────────────────────────────────
router.get("/admin/overview", async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    // Simple role check, adjust based on actual admin logic in the app
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    if (user.role !== "ADMIN" && user.role !== "admin" && user.email !== "admin@foodcanvas.com") { 
       return res.status(403).json({ message: "Forbidden" });
    }

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    // Parallel aggregate queries
    const [
      totalUsers,
      totalRecipes,
      totalCollections,
      totalChallenges,
      totalPosts,
      usersLastWeek,
      recipesLastWeek,
      postsLastWeek,
      recipesByCategory,
      activeUsersCount,
      recentRecipesList,
      recentUsersList,
      recentChallengesList,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.recipe.count(),
      prisma.collection.count(),
      prisma.challenge.count(),
      prisma.communityPost.count(),
      
      prisma.user.count({ where: { createdAt: { gte: twoWeeksAgo, lt: oneWeekAgo } } }),
      prisma.recipe.count({ where: { createdAt: { gte: twoWeeksAgo, lt: oneWeekAgo } } }),
      prisma.communityPost.count({ where: { createdAt: { gte: twoWeeksAgo, lt: oneWeekAgo } } }),
      
      prisma.recipe.groupBy({
        by: ['category'],
        _count: true,
        orderBy: { _count: { category: 'desc' } },
        take: 5,
        where: { category: { not: null } }
      }),

      prisma.session.groupBy({ by: ['userId'] }).then(res => res.length),

      prisma.recipe.findMany({
        orderBy: { createdAt: 'desc' },
        take: 4,
        include: { user: { select: { name: true } } }
      }),

      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 4,
        select: { id: true, name: true, email: true, createdAt: true, status: true, _count: { select: { recipes: true } } }
      }),

      prisma.challenge.findMany({
        orderBy: { createdAt: 'desc' },
        take: 3
      })
    ]);

    const [
      usersThisWeek,
      recipesThisWeek,
      postsThisWeek,
    ] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: oneWeekAgo } } }),
      prisma.recipe.count({ where: { createdAt: { gte: oneWeekAgo } } }),
      prisma.communityPost.count({ where: { createdAt: { gte: oneWeekAgo } } }),
    ]);

    const chartData = [];
    for (let i = 6; i >= 0; i--) {
      const dStart = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dStart.setHours(0, 0, 0, 0);
      const dEnd = new Date(dStart);
      dEnd.setHours(23, 59, 59, 999);
      
      const [dayUsers, dayRecipes, dayPosts] = await Promise.all([
        prisma.user.count({ where: { createdAt: { gte: dStart, lte: dEnd } } }),
        prisma.recipe.count({ where: { createdAt: { gte: dStart, lte: dEnd } } }),
        prisma.communityPost.count({ where: { createdAt: { gte: dStart, lte: dEnd } } }),
      ]);

      const monthName = dStart.toLocaleString('en-US', { month: 'short' });
      chartData.push({
        day: `${monthName} ${dStart.getDate()}`,
        users: dayUsers,
        recipes: dayRecipes,
        posts: dayPosts
      });
    }

    const calcDelta = (current: number, prev: number) => {
      if (prev === 0) return current > 0 ? 100 : 0;
      return Number(((current - prev) / prev * 100).toFixed(1));
    };

    return res.json({
      stats: {
        users: { total: totalUsers, delta: calcDelta(usersThisWeek, usersLastWeek) },
        recipes: { total: totalRecipes, delta: calcDelta(recipesThisWeek, recipesLastWeek) },
        collections: { total: totalCollections, delta: 0 }, 
        challenges: { total: totalChallenges, delta: 0 },
        posts: { total: totalPosts, delta: calcDelta(postsThisWeek, postsLastWeek) },
      },
      chartData,
      userGrowth: {
        newUsers: usersThisWeek,
        activeUsers: activeUsersCount,
        returningUsers: Math.max(0, totalUsers - usersThisWeek)
      },
      topCategories: recipesByCategory.map(c => ({
        name: c.category,
        count: c._count,
        pct: Number(((c._count / Math.max(1, totalRecipes)) * 100).toFixed(1))
      })),
      recentRecipes: recentRecipesList.map(r => ({
        title: r.title,
        author: r.user?.name || "Unknown",
        time: r.createdAt,
        cal: r.kcal ? `${r.kcal} kcal` : "--"
      })),
      recentUsers: recentUsersList.map(u => ({
        name: u.name,
        email: u.email,
        joined: u.createdAt,
        recipes: u._count?.recipes || 0,
        status: u.status || "ACTIVE"
      })),
      recentActivity: [
        ...recentUsersList.map(u => ({ text: `${u.name} joined the platform`, time: u.createdAt })),
        ...recentRecipesList.map(r => ({ text: `Recipe published: '${r.title}'`, time: r.createdAt })),
        ...recentChallengesList.map(c => ({ text: `New challenge created: '${c.title}'`, time: c.createdAt }))
      ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 4)
    });

  } catch (error) {
    console.error("[ADMIN DASHBOARD] Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ─── USER DASHBOARD PAGINATED AI RECIPES ──────────────────────────────────
router.get("/user/ai-recipes", async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 9;
    const skip = (page - 1) * limit;

    const [recipes, total] = await Promise.all([
      prisma.pantryRecipe.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.pantryRecipe.count({
        where: { userId: user.id }
      })
    ]);

    const totalPages = Math.ceil(total / limit);

    return res.json({
      recipes,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    });
  } catch (error) {
    console.error("[AI RECIPES PAGINATION] Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
