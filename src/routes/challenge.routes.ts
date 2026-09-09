import express from "express";
import {
  getChallenges,
  getFeaturedChallenges,
  getChallengeById,
  joinChallenge,
  getChallengeProgress,
  getBadges,
  getLeaderboard,
  generateChallenges,
  completeChallengeDay,
  getChallengeParticipant
} from "../controllers/challenge.controller.js";

const router = express.Router();

router.get("/global/leaderboard", getLeaderboard);
router.get("/user/progress", getChallengeProgress);
router.get("/user/badges", getBadges);
router.post("/generate", generateChallenges);
router.get("/", getChallenges);
router.get("/featured", getFeaturedChallenges);
router.get("/:id", getChallengeById);
router.get("/:challengeId/participant", getChallengeParticipant);
router.post("/:id/join", joinChallenge);
router.post("/:challengeId/days/:dayId/complete", completeChallengeDay);

export default router;
