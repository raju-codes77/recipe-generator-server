import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";

export const auth = betterAuth({
  trustedOrigins: [
    "http://localhost:3000",
  ],

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  emailAndPassword: {
    enabled: true,
  },

  // Role field-ti sothik vabe save ar fetch korar jonno
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user", // choto okkhor-e default "user"
        input: true,        // register form theke input receive korbe
      },
    },
  },
});