import "dotenv/config";

import { PrismaClient } from "../../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  adapter: PrismaPg | undefined;
};

const adapter =
  globalForPrisma.adapter ??
  new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    max: 2, // Decreased for serverless concurrency to prevent EMAXCONNSESSION
  });

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.adapter = adapter;
  globalForPrisma.prisma = prisma;
}