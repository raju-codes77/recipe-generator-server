import "dotenv/config";

import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: 5,
});

export const prisma = new PrismaClient({
  adapter,
});