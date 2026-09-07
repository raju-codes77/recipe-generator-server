import type { Request } from "express";
import { auth } from "../lib/auth";
import type { AuthenticatedCommunityUser } from "./community.types";

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
  if (!session?.user) return null;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image,
  };
}

export async function requireCommunityUser(req: Request): Promise<AuthenticatedCommunityUser> {
  const user = await getOptionalCommunityUser(req);
  if (!user) throw Object.assign(new Error("Authentication required"), { statusCode: 401 });
  return user;
}
