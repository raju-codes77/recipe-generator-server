
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
  // Production: https://food-canvas-server.vercel.app
  // Local: http://localhost:5000
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:5000",

  trustedOrigins: Array.from(
    new Set([
      "http://localhost:3000",
      "http://localhost:5000",
      "https://food-canvas.vercel.app",
      "https://food-canvas-server.vercel.app",
      ...configuredClientOrigins,
    ])
  ),

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  trustHost: true,

  advanced: {
    defaultCookieAttributes: {
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
    },
  },

  // OAuth state is stored in the database.
  // This is appropriate because Prisma/PostgreSQL is configured.
  account: {
    storeStateStrategy: "database",
  },

  emailAndPassword: {
    enabled: true,
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
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

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Asynchronously trigger welcome email after successful DB creation
          import("../services/emailService.js")
            .then(({ sendWelcomeEmail }) => {
              if (user.email && user.name) {
                // Background execution, does not block auth flow
                sendWelcomeEmail(user.email, user.name).catch(console.error);
              }
            })
            .catch(console.error);
        },
      },
    },
  },
});

