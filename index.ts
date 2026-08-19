import express from "express";
import cors from "cors";

import dotenv from "dotenv";
import { PrismaClient } from "./generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
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



// kawsar creat
app.get("/api/recipes", async (req, res) => {
  try {
    const { search, category, cuisine, maxTime, maxCalories, minRating, sortBy } = req.query;

    // ১. ডাটাবেসে কোনো রেসিপি আছে কি না চেক করা, না থাকলে TheMealDB থেকে এনে সেভ করা
    const count = await prisma.recipe.count();
    if (count === 0) {
      const externalRes = await fetch("https://www.themealdb.com/api/json/v1/1/search.php?s=chicken");
      const externalData = await externalRes.json();

      if (externalData.meals) {
        for (const [index, meal] of externalData.meals.entries()) {
          const ingredientsList = [];
          for (let i = 1; i <= 20; i++) {
            const ingName = meal[`strIngredient${i}`]?.trim();
            const measure = meal[`strMeasure${i}`]?.trim();
            if (ingName) {
              ingredientsList.push({ name: ingName, measure: measure || "" });
            }
          }

          await prisma.recipe.create({
            data: {
              mealId: meal.idMeal,
              title: meal.strMeal,
              category: meal.strCategory || "Dinner",
              cuisine: meal.strArea || "Asian",
              rating: Number((4.5 + (index % 5) * 0.1).toFixed(1)),
              time: 25 + (index % 4) * 10,
              calories: 350 + (index % 5) * 50,
              image: meal.strMealThumb,
              instructions: meal.strInstructions,
              youtube: meal.strYoutube,
              ingredients: {
                create: ingredientsList,
              },
            },
          });
        }
      }
    }

    // ২. Prisma dynamic where clause তৈরি (ফিল্টারিংয়ের জন্য)
    let whereClause: any = {};

    if (search) {
      whereClause.OR = [
        { title: { contains: String(search), mode: "insensitive" } },
        {
          ingredients: {
            some: {
              name: { contains: String(search), mode: "insensitive" },
            },
          },
        },
      ];
    }

    if (category && category !== "All") {
      whereClause.category = { equals: String(category), mode: "insensitive" };
    }

    if (cuisine && cuisine !== "All") {
      whereClause.cuisine = { equals: String(cuisine), mode: "insensitive" };
    }

    if (maxTime) {
      whereClause.time = { lte: Number(maxTime) };
    }

    if (maxCalories) {
      whereClause.calories = { lte: Number(maxCalories) };
    }

    if (minRating) {
      whereClause.rating = { gte: Number(minRating) };
    }

    // ৩. সর্টিং লজিক
    let orderBy: any = { createdAt: "desc" };
    if (sortBy === "Top Rated") {
      orderBy = { rating: "desc" };
    } else if (sortBy === "Quickest") {
      orderBy = { time: "asc" };
    }

    // ৪. ডাটাবেস থেকে কুয়েরি করা
    const recipes = await prisma.recipe.findMany({
      where: whereClause,
      include: {
        ingredients: true,
      },
      orderBy: orderBy,
    });

    res.json({
      success: true,
      count: recipes.length,
      recipes,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch recipes",
    });
  }
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