
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
  // In production: BETTER_AUTH_BASE_URL must be the FRONTEND URL (https://food-canvas.vercel.app)
  // This ensures the OAuth callback URI is generated as a frontend URL that goes through the proxy,
  // so state/PKCE cookies remain on the same domain (food-canvas.vercel.app) throughout the entire flow.
  //
  // WRONG: setting this to the backend URL causes the callback to bypass the proxy,
  //        breaking cookie consistency and producing state_mismatch.
  //
  // Local dev: http://localhost:5000 (backend handles auth directly, no cross-domain)
  baseURL: process.env.BETTER_AUTH_BASE_URL || process.env.BETTER_AUTH_URL || "http://localhost:5000",

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

