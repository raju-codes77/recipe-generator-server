import { Router, json } from "express";
import { communityController } from "./community.controller";

const router = Router();
router.use(json({ limit: "9mb" }));

router.get("/posts", communityController.listPosts);
router.post("/posts", communityController.createPost);
router.patch("/posts/:postId", communityController.updatePost);
router.delete("/posts/:postId", communityController.deletePost);
router.post("/posts/:postId/like", communityController.toggleLike);
router.post("/posts/:postId/made-it", communityController.toggleMadeIt);
router.post("/posts/:postId/comments", communityController.addComment);
router.patch("/comments/:commentId", communityController.updateComment);
router.delete("/comments/:commentId", communityController.deleteComment);
router.post("/posts/:postId/reviews", communityController.saveReview);
router.delete("/posts/:postId/reviews", communityController.deleteReview);
router.post("/posts/:postId/save", communityController.savePost);
router.post("/posts/:postId/reports", communityController.reportPost);
router.post("/users/:userId/follow", communityController.toggleFollow);
router.get("/collections", communityController.listCollections);
router.post("/collections", communityController.createCollection);
router.get("/stories", communityController.listStories);
router.post("/stories", communityController.createStory);
router.delete("/stories/:storyId", communityController.deleteStory);
router.get("/notifications", communityController.listNotifications);
router.patch("/notifications/:notificationId/read", communityController.markNotificationRead);
router.get("/messages/contacts", communityController.listContacts);
router.get("/messages/:userId", communityController.listMessages);
router.post("/messages/:userId", communityController.sendMessage);
router.post("/uploads", communityController.upload);

router.use(
  (
    error: Error & { statusCode?: number },
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } },
    _next: unknown,
  ) => {
    const status = error.statusCode || 500;
    if (status === 500) console.error(error);
    res.status(status).json({ message: status === 500 ? "Community request failed" : error.message });
  },
);

export default router;
