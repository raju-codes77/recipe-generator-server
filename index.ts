import express from "express";
import dotenv from "dotenv";
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.get("/db-test", async (req, res) => {
  try {
    const users = await prisma.user.findMany();

    res.json({
      success: true,
      message: "Database connected successfully",
      users,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Database connection failed",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});