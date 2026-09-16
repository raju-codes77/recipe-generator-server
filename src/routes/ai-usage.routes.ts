import express from "express";
import { prisma } from "../lib/prisma";

export const aiUsageRouter = express.Router();

aiUsageRouter.get("/stats", async (req, res) => {
  try {
    const filter = req.query.filter as string; // 'This Month', 'Last Month', 'All Time'
    
    let currentStartDate: Date | null = null;
    let currentEndDate: Date | null = null;
    let previousStartDate: Date | null = null;
    let previousEndDate: Date | null = null;
    
    const now = new Date();
    
    if (filter === "This Month") {
      currentStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
      currentEndDate = now;
      
      previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      previousEndDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else if (filter === "Last Month") {
      currentStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      currentEndDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      
      previousStartDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      previousEndDate = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999);
    }

    // Function to get counts for a period
    const getCounts = async (start: Date | null, end: Date | null) => {
      const where: any = {};
      if (start && end) {
        where.createdAt = {
          gte: start,
          lte: end,
        };
      }
      
      const counts = await prisma.aiUsageEvent.groupBy({
        by: ['toolName'],
        _count: {
          _all: true,
        },
        where
      });
      
      const map: Record<string, number> = {};
      counts.forEach((c: any) => map[c.toolName] = c._count._all);
      return map;
    };

    const currentCounts = await getCounts(currentStartDate, currentEndDate);
    const previousCounts = await getCounts(previousStartDate, previousEndDate);
    
    // Tools to track: "RECIPES", "PHOTOS", "NUTRITION", "TASTE", "WELLNESS"
    const tools = ["RECIPES", "PHOTOS", "NUTRITION", "TASTE", "WELLNESS"];
    const results: any = {};
    
    for (const tool of tools) {
      const curr = currentCounts[tool] || 0;
      const prev = previousCounts[tool] || 0;
      
      let trend = "0%";
      let trendDir = "up"; // 'up' or 'down'
      
      if (prev > 0) {
        const percentChange = ((curr - prev) / prev) * 100;
        trend = `${Math.abs(percentChange).toFixed(1)}%`;
        trendDir = percentChange >= 0 ? "up" : "down";
      } else if (curr > 0 && prev === 0) {
        trend = "+100%";
      }
      
      results[tool] = {
        count: curr,
        trend,
        trendDir
      };
    }

    res.json(results);
  } catch (error) {
    console.error("AI Usage Stats Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
