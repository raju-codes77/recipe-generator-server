import { Router, Request, Response } from "express";
import { prisma } from "../src/lib/prisma.js";
import { auth } from "../src/lib/auth.js";

const router = Router();

// Middleware to verify admin
async function requireAdmin(req: Request, res: Response, next: Function) {
  try {
    const session = await auth.api.getSession({ headers: req.headers as any });
    if (!session?.user?.id) return res.status(401).json({ message: "Unauthorized" });
    
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user || (user.role !== "ADMIN" && user.role !== "admin" && user.email !== "admin@foodcanvas.com")) {
      return res.status(403).json({ message: "Forbidden" });
    }
    
    // Attach user to req for convenience if needed
    (req as any).adminUser = user;
    next();
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
}

router.use(requireAdmin);

// ─── USERS ─────────────────────────────────────────────────────────

router.get("/users", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: { id: true, name: true, email: true, role: true, status: true, createdAt: true, _count: { select: { recipes: true } } }
      }),
      prisma.user.count()
    ]);

    return res.json({ users, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    console.error("[ADMIN USERS] Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.patch("/users/:id/status", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { status }
    });
    return res.json(updatedUser);
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.delete("/users/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.user.delete({ where: { id } });
    return res.json({ message: "User deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── RECIPES ───────────────────────────────────────────────────────

router.get("/recipes", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [recipes, total] = await Promise.all([
      prisma.recipe.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { user: { select: { name: true, email: true } } }
      }),
      prisma.recipe.count()
    ]);

    return res.json({ recipes, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.delete("/recipes/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.recipe.delete({ where: { id } });
    return res.json({ message: "Recipe deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── POSTS ─────────────────────────────────────────────────────────

router.get("/posts", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      prisma.communityPost.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.communityPost.count()
    ]);

    // Manually fetch authors (due to no relation in schema)
    const authorIds = [...new Set(posts.map(p => p.authorId))];
    const authors = await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, email: true, image: true } });
    const authorMap = authors.reduce((acc: any, curr: any) => { acc[curr.id] = curr; return acc; }, {});

    const mappedPosts = posts.map(p => ({ ...p, author: authorMap[p.authorId] }));

    return res.json({ posts: mappedPosts, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.delete("/posts/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.communityPost.delete({ where: { id } });
    return res.json({ message: "Post deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

// ─── CHALLENGES ────────────────────────────────────────────────────

router.get("/challenges", async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [challenges, total] = await Promise.all([
      prisma.challenge.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { _count: { select: { participants: true } } }
      }),
      prisma.challenge.count()
    ]);

    return res.json({ challenges, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.delete("/challenges/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.challenge.delete({ where: { id } });
    return res.json({ message: "Challenge deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
