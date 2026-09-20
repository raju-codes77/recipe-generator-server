import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma.js";

const configuredClientOrigins = [
  process.env.FRONTEND_URL,
  process.env.CLIENT_URL,
  process.env.NEXT_PUBLIC_APP_URL,
]
  .flatMap((value) => value?.split(",") ?? [])
  .map((value) => value.trim().replace(/\/$/, ""))
  .filter(Boolean);

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || "https://food-canvas-server.vercel.app",

  trustedOrigins: [
    "http://localhost:3000",
    "http://localhost:5000",
    "https://food-canvas.vercel.app",
    "https://food-canvas-server.vercel.app",
    ...configuredClientOrigins,
  ],

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
    },
  },

  emailAndPassword: {
    enabled: true,
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      redirectURI: `${process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || "https://food-canvas.vercel.app"}/api/auth/callback/google`,
    },
  },

  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
      },
    },
  },
});
