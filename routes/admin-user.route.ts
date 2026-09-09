import { Router } from "express";
import { prisma } from "../src/lib/prisma.js";
const router = Router();

// ================= GET ALL USERS =================
router.get("/users", async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("Fetch Users Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch users.",
    });
  }
});

// ================= UPDATE USER STATUS =================
router.patch("/users/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { status },
    });

    return res.json({
      success: true,
      message: `User status updated to ${status}`,
      updatedUser,
    });
  } catch (error) {
    console.error("Update Status Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update user status.",
    });
  }
});

// ================= DELETE USER =================
router.delete("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.user.delete({
      where: { id },
    });

    return res.json({
      success: true,
      message: "User deleted successfully.",
    });
  } catch (error) {
    console.error("Delete User Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete user.",
    });
  }
});

export default router;