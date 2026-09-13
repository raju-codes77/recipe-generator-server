import { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { generateAIChallenges } from "../services/ai-challenge.service.js";

// GET /api/challenges
export const getChallenges = async (req: Request, res: Response): Promise<any> => {
  try {
    const { status, mine, search, sort } = req.query;
    const userId = (req as any).user?.id || req.query?.userId as string;

    let whereClause: any = { isActive: true };

    if (status === 'upcoming') whereClause.isActive = false;

    if (search) {
      whereClause.OR = [
        { title: { contains: String(search), mode: 'insensitive' } },
        { description: { contains: String(search), mode: 'insensitive' } }
      ];
    }

    const participantStatus = req.query.participantStatus;

    if (mine === 'true' && userId) {
      // Personal view: only challenges the user joined with the given participation status
      whereClause.participants = {
        some: { 
          userId,
          ...(participantStatus ? { status: String(participantStatus) } : {})
        }
      };
    } else if (userId) {
      // Global view: hide challenges the current user has already completed
      whereClause.participants = {
        none: {
          userId,
          status: 'COMPLETED'
        }
      };
    }

    let orderByClause: any = { createdAt: 'desc' };
    if (sort === 'popular') orderByClause = { participants: { _count: 'desc' } };
    if (sort === 'reward') orderByClause = { rewardPoints: 'desc' };

    const includeClause: any = {
      _count: {
        select: { participants: true }
      }
    };

    // Always embed the requesting user's own participant record when userId is known.
    // This lets the All Challenges view know "has this user already joined?" without a second request.
    if (userId) {
      includeClause.participants = {
        where: { userId },
        select: {
          id: true,
          status: true,
          joinedAt: true,
          completedAt: true,
          lastCompletedAt: true,
          currentDay: true,
          completedDays: true,
          totalDays: true,
          completionPercentage: true,
          currentStreak: true,
          longestStreak: true
        }
      };
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 6;
    const skip = (page - 1) * limit;

    const [total, challenges] = await Promise.all([
      prisma.challenge.count({ where: whereClause }),
      prisma.challenge.findMany({
        where: whereClause,
        orderBy: orderByClause,
        include: includeClause,
        skip,
        take: limit
      })
    ]);

    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({ 
      success: true, 
      challenges,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/challenges/featured
export const getFeaturedChallenges = async (req: Request, res: Response): Promise<any> => {
  try {
    const challenges = await prisma.challenge.findMany({
      where: { isActive: true, isFeatured: true },
      take: 3,
      include: {
        _count: {
          select: { participants: true }
        }
      }
    });
    return res.status(200).json({ success: true, challenges });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/challenges/:id
export const getChallengeById = async (req: Request, res: Response): Promise<any> => {
  try {
    const challenge = await prisma.challenge.findUnique({
      where: { id: String(req.params.id) },
      include: {
        days: {
          orderBy: { dayNumber: 'asc' }
        },
        _count: {
          select: { participants: true }
        }
      }
    });
    if (!challenge) {
      return res.status(404).json({ success: false, message: "Challenge not found" });
    }
    return res.status(200).json({ success: true, challenge });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/challenges/:id/join
export const joinChallenge = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = String((req as any).user?.id || req.body?.userId); 
    if (!userId || userId === "undefined") return res.status(401).json({ success: false, message: "Unauthorized" });

    const challengeId = String(req.params.id);

    const existing = await prisma.challengeParticipant.findUnique({
      where: {
        challengeId_userId: { challengeId, userId }
      }
    });

    if (existing) {
      return res.status(400).json({ success: false, message: "Already joined this challenge" });
    }

    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      include: { days: true }
    });

    if (!challenge) {
      return res.status(404).json({ success: false, message: "Challenge not found" });
    }

    const participant = await prisma.challengeParticipant.create({
      data: {
        challengeId,
        userId,
        status: "ACTIVE",
        totalDays: challenge.days.length,
        currentDay: 1,
        completedDays: 0,
        completionPercentage: 0,
        currentStreak: 0,
        longestStreak: 0
      }
    });

    return res.status(201).json({ success: true, participant });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/challenges/:challengeId/participant
export const getChallengeParticipant = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = String((req as any).user?.id || req.query?.userId); 
    if (!userId || userId === "undefined") return res.status(401).json({ success: false, message: "Unauthorized" });

    const challengeId = String(req.params.challengeId);
    
    const participant = await prisma.challengeParticipant.findUnique({
      where: { challengeId_userId: { challengeId, userId } }
    });

    if (!participant) return res.status(404).json({ success: false, message: "Not joined" });

    return res.status(200).json({ success: true, participant });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/challenges/:challengeId/days/:dayId/complete
export const completeChallengeDay = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = String((req as any).user?.id || req.body?.userId); 
    if (!userId || userId === "undefined") return res.status(401).json({ success: false, message: "Unauthorized" });

    const challengeId = String(req.params.challengeId);
    const dayId = String(req.params.dayId);

    const participant = await prisma.challengeParticipant.findUnique({
      where: { challengeId_userId: { challengeId, userId } }
    });

    if (!participant) return res.status(404).json({ success: false, message: "Participant not found" });
    if (participant.status !== "ACTIVE") return res.status(400).json({ success: false, message: "Challenge is not active" });

    const challengeDay = await prisma.challengeDay.findUnique({ where: { id: dayId } });
    if (!challengeDay || challengeDay.challengeId !== challengeId) {
      return res.status(404).json({ success: false, message: "Day not found" });
    }

    if (challengeDay.dayNumber !== participant.currentDay) {
      return res.status(400).json({ success: false, message: "Cannot complete this day yet" });
    }

    // Verify day not already completed (we increment currentDay, so this is handled, but checking submission prevents double submission)
    const existingSub = await prisma.challengeSubmission.findUnique({
      where: { challengeDayId_userId: { challengeDayId: dayId, userId } }
    });
    if (existingSub) {
      return res.status(400).json({ success: false, message: "Already completed this day" });
    }

    // Mark completed
    await prisma.challengeSubmission.create({
      data: {
        challengeDayId: dayId,
        userId,
        status: "APPROVED",
        imageUrl: "", // Or from req.body if upload is implemented
      }
    });

    // Update streak
    const now = new Date();
    let newStreak = participant.currentStreak + 1;
    if (participant.lastCompletedAt) {
      const msSinceLast = now.getTime() - participant.lastCompletedAt.getTime();
      const hoursSinceLast = msSinceLast / (1000 * 60 * 60);
      if (hoursSinceLast > 48) {
        newStreak = 1; // Missed a day, reset streak
      }
    }

    const newCompletedDays = participant.completedDays + 1;
    const newPercentage = Math.round((newCompletedDays / participant.totalDays) * 100);
    const isFinished = newCompletedDays >= participant.totalDays;

    const updatedParticipant = await prisma.challengeParticipant.update({
      where: { id: participant.id },
      data: {
        currentDay: participant.currentDay + 1,
        completedDays: newCompletedDays,
        completionPercentage: newPercentage,
        currentStreak: newStreak,
        longestStreak: Math.max(newStreak, participant.longestStreak),
        lastCompletedAt: now,
        status: isFinished ? "COMPLETED" : "ACTIVE",
        completedAt: isFinished ? now : null
      }
    });

    return res.status(200).json({ success: true, participant: updatedParticipant });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/challenges/user/progress
export const getChallengeProgress = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = String((req as any).user?.id || req.query?.userId); 
    if (!userId || userId === "undefined") return res.status(401).json({ success: false, message: "Unauthorized" });

    const totalParticipated = await prisma.challengeParticipant.count({ where: { userId } });
    const completedChallenges = await prisma.challengeParticipant.count({ where: { userId, status: "COMPLETED" } });
    
    // Calculate total XP earned from completed challenges
    const participants = await prisma.challengeParticipant.findMany({
      where: { userId },
      include: { challenge: true }
    });
    
    const xp = participants
      .filter(p => p.status === "COMPLETED")
      .reduce((sum, p) => sum + p.challenge.rewardPoints, 0);

    const longestStreak = participants.reduce((max, p) => Math.max(max, p.longestStreak), 0);
    const activeCurrentStreak = participants
      .filter(p => p.status === "ACTIVE")
      .reduce((max, p) => Math.max(max, p.currentStreak), 0);

    return res.status(200).json({
      success: true,
      progress: {
        totalParticipated,
        completedChallenges,
        streak: activeCurrentStreak || longestStreak,
        xp
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/challenges/user/badges
export const getBadges = async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = String((req as any).user?.id || req.query?.userId); 
    if (!userId || userId === "undefined") return res.status(401).json({ success: false, message: "Unauthorized" });

    const badges = await prisma.userBadge.findMany({
      where: { userId },
      include: { badge: true }
    });
    return res.status(200).json({ success: true, badges });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/challenges/global/leaderboard
export const getLeaderboard = async (req: Request, res: Response): Promise<any> => {
  try {
    // ELIGIBILITY: get every unique userId that has at least one participation record
    // (any status — ACTIVE, COMPLETED, DROPPED, EXPIRED).
    // This is the gating condition; users who never joined never appear.
    const eligibleParticipants = await prisma.challengeParticipant.groupBy({
      by: ['userId'],
      // No status filter — any join makes the user eligible
      _count: { id: true }
    });

    if (eligibleParticipants.length === 0) {
      return res.status(200).json({ success: true, leaderboard: [] });
    }

    // SCORING: for each eligible user, fetch their public profile + completed challenge XP
    const entries = await Promise.all(
      eligibleParticipants.map(async (entry) => {
        const user = await prisma.user.findUnique({
          where: { id: entry.userId },
          select: {
            id: true,
            name: true,
            image: true,  // User.image — the avatar field, consistent with community/profile
            challengeParticipants: {
              // XP comes from completed challenges only (existing scoring logic)
              where: { status: 'COMPLETED' },
              include: { challenge: { select: { rewardPoints: true } } }
            }
          }
        });
        if (!user) return null;

        const xp = user.challengeParticipants.reduce(
          (sum, p) => sum + (p.challenge?.rewardPoints ?? 0), 0
        );
        const completedChallenges = user.challengeParticipants.length;
        // Total joined (all statuses) from the groupBy result
        const totalJoined = entry._count.id;

        return {
          id: user.id,
          name: user.name,
          image: user.image ?? null,
          xp,
          completedChallenges,
          totalJoined
        };
      })
    );

    // Remove nulls (deleted users), sort by XP desc, then by totalJoined as tiebreaker
    const sorted = (entries.filter(Boolean) as NonNullable<(typeof entries)[number]>[])
      .sort((a, b) => b.xp - a.xp || b.totalJoined - a.totalJoined)
      .slice(0, 10)
      .map((user, index) => ({ ...user, rank: index + 1 }));

    return res.status(200).json({ success: true, leaderboard: sorted });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/challenges/generate
export const generateChallenges = async (req: Request, res: Response): Promise<any> => {
  try {
    const { forceMore } = req.body || {};
    
    // Check existing challenges if not forcing more
    if (!forceMore) {
      const activeCount = await prisma.challenge.count({ where: { isActive: true } });
      if (activeCount >= 4) {
        return res.status(200).json({ success: true, message: "Sufficient challenges already exist." });
      }
    }

    // Call AI to generate challenges
    const aiChallenges = await generateAIChallenges();

    const createdChallenges = [];

    // Save to DB preventing duplicates
    for (const challengeData of aiChallenges) {
      const existing = await prisma.challenge.findFirst({
        where: { title: { equals: challengeData.title, mode: 'insensitive' } }
      });

      if (!existing) {
        const created = await prisma.challenge.create({
          data: {
            title: challengeData.title,
            description: challengeData.description,
            durationDays: challengeData.durationDays,
            difficulty: challengeData.difficulty,
            rewardPoints: challengeData.rewardPoints,
            coverImage: challengeData.coverImage,
            isActive: true,
            days: {
              create: challengeData.days.map((d: any) => ({
                dayNumber: d.dayNumber,
                title: d.title,
                description: d.description
              }))
            }
          },
          include: { days: true }
        });
        createdChallenges.push(created);
      }
    }

    return res.status(201).json({ success: true, challenges: createdChallenges });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
