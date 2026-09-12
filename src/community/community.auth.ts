import type { Request } from "express";
import { auth } from "../lib/auth.js";
import type { AuthenticatedCommunityUser } from "./community.types.js";
import { prisma } from "../lib/prisma.js";

function requestHeaders(req: Request): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (typeof value === "string") headers.set(name, value);
  }
  return headers;
}

export async function getOptionalCommunityUser(req: Request): Promise<AuthenticatedCommunityUser | null> {
  const session = await auth.api.getSession({ headers: requestHeaders(req) });
  if (session?.user) {
    return {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
    };
  }

  // Fallback to userId from query or body (challenges route concept)
  const fallbackUserId = req.query?.userId || req.body?.userId;
  if (fallbackUserId && typeof fallbackUserId === "string" && fallbackUserId !== "undefined") {
    try {
      const user = await prisma.user.findUnique({
        where: { id: fallbackUserId },
        select: { id: true, name: true, email: true, image: true }
      });
      if (user) {
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      }
    } catch (error) {
      console.error("[Community Auth] Error fetching fallback user:", error);
    }
  }

  return null;
}

export async function requireCommunityUser(req: Request): Promise<AuthenticatedCommunityUser> {
  const user = await getOptionalCommunityUser(req);
  if (!user) throw Object.assign(new Error("Authentication required"), { statusCode: 401 });
  return user;
}
