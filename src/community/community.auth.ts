import type { Request } from "express";
import { auth } from "../lib/auth.js";
import { fromNodeHeaders } from "better-auth/node";
import type { AuthenticatedCommunityUser } from "./community.types.js";
import { prisma } from "../lib/prisma.js";

export async function getOptionalCommunityUser(req: Request): Promise<AuthenticatedCommunityUser | null> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (session?.user) {
    return {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
    };
  }

  return null;
}

export async function requireCommunityUser(req: Request): Promise<AuthenticatedCommunityUser> {
  const user = await getOptionalCommunityUser(req);
  if (!user) throw Object.assign(new Error("Authentication required"), { statusCode: 401 });
  return user;
}
