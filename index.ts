import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./src/lib/auth";
import { prisma } from "./src/lib/prisma";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// cors
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

// Better Auth MUST come before express.json()
app.all("/api/auth/*splat", toNodeHandler(auth));

// Other routes
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Server is running");
});

// ================= RECIPES ROUTE =================
app.get("/api/recipes", async (req: any, res: any) => {
  try {
    const { search, category, cuisine, maxTime, maxCalories, minRating, sortBy, tab, userId } = req.query;

    // ১. ডাটাবেসে কোনো রেসিপি আছে কি না চেক করা, না থাকলে TheMealDB থেকে এনে সেভ করা
    const count = await prisma.recipe.count();
    if (count === 0) {
      const externalRes = await fetch("https://www.themealdb.com/api/json/v1/1/search.php?s=chicken");
      const externalData: any = await externalRes.json();

      if (externalData.meals) {
        for (const [index, meal] of externalData.meals.entries()) {
          const ingredientsList: any[] = [];
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
              userId: null,
              ingredients: {
                create: ingredientsList,
              },
            },
          });
        }
      }
    }

    // ২. Prisma dynamic where clause তৈরি (ফিল্টারিংয়ের জন্য)
    const conditions: any[] = [];

    if (tab === "my-recipes") {
      if (!userId) {
        return res.status(400).json({ success: false, message: "UserId is required for My Recipes" });
      }
      conditions.push({ userId: String(userId) });
    } 
    else if (tab === "favorites") {
      if (!userId) {
        return res.status(400).json({ success: false, message: "UserId is required for Favorites" });
      }
      const userFavorites = await prisma.favorite.findMany({
        where: { userId: String(userId) },
        select: { recipeId: true },
      });
      const favoriteRecipeIds = userFavorites.map((fav: any) => fav.recipeId);
      conditions.push({ id: { in: favoriteRecipeIds } });
    }
    else if (tab === "collections") {
      if (!userId) {
        return res.status(400).json({ success: false, message: "UserId is required for Collections" });
      }
      // ইউজারের সব কালেকশনের ভেতরের রেসিপি আইডিগুলো বের করা
      const userCollections = await prisma.collection.findMany({
        where: { userId: String(userId) },
        include: {
          recipes: {
            select: { recipeId: true }
          }
        }
      });

      const collectionRecipeIds = userCollections.flatMap((col) => 
        col.recipes.map((r) => r.recipeId)
      );

      conditions.push({ id: { in: collectionRecipeIds } });
    }

    if (search) {
      conditions.push({
        OR: [
          { title: { contains: String(search), mode: "insensitive" } },
          {
            ingredients: {
              some: {
                name: { contains: String(search), mode: "insensitive" },
              },
            },
          },
        ],
      });
    }

    if (category && category !== "All") {
      conditions.push({ category: { equals: String(category), mode: "insensitive" } });
    }

    if (cuisine && cuisine !== "All") {
      conditions.push({ cuisine: { equals: String(cuisine), mode: "insensitive" } });
    }

    if (maxTime) {
      conditions.push({ time: { lte: Number(maxTime) } });
    }

    if (maxCalories) {
      conditions.push({ calories: { lte: Number(maxCalories) } });
    }

    if (minRating) {
      conditions.push({ rating: { gte: Number(minRating) } });
    }

    const whereClause = conditions.length > 0 ? { AND: conditions } : {};

    // ৩. সর্টিং লজিক
    let sortOrder: "asc" | "desc" = "desc";
    let sortByField = "createdAt";

    if (sortBy === "Top Rated") {
      sortByField = "rating";
      sortOrder = "desc";
    } else if (sortBy === "Quickest") {
      sortByField = "time";
      sortOrder = "asc";
    }

    const orderByObj: any = {};
    orderByObj[sortByField] = sortOrder;

    // ৪. ডাটাবেস থেকে কুয়েরি করা
    const recipes = await prisma.recipe.findMany({
      where: whereClause,
      include: {
        ingredients: true,
      },
      orderBy: orderByObj,
    });

    res.json({
      success: true,
      count: recipes.length,
      recipes,
    });

  } catch (error: any) {
    console.error("API Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch recipes",
      error: error.message,
    });
  }
});

// ================= FAVORITES ROUTES =================
app.get("/api/favorites/check", async (req: any, res: any) => {
  try {
    const { userId, recipeId } = req.query;

    if (!userId || !recipeId) {
      return res.status(400).json({
        success: false,
        message: "userId and recipeId are required",
      });
    }

    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_recipeId: {
          userId: String(userId),
          recipeId: String(recipeId),
        },
      },
    });

    res.json({
      success: true,
      isFavorite: !!favorite,
    });
  } catch (error: any) {
    console.error("Check Favorite Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check favorite",
    });
  }
});

app.post("/api/favorites", async (req: any, res: any) => {
  try {
    const { userId, recipeId } = req.body;

    if (!userId || !recipeId) {
      return res.status(400).json({
        success: false,
        message: "userId and recipeId are required",
      });
    }

    const favorite = await prisma.favorite.create({
      data: {
        userId: String(userId),
        recipeId: String(recipeId),
      },
      include: {
        recipe: true,
      },
    });

    res.status(201).json({
      success: true,
      message: "Recipe added to favorites",
      favorite,
    });
  } catch (error: any) {
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "Recipe already in favorites",
      });
    }

    console.error("Add Favorite Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add favorite",
      error: error.message,
    });
  }
});

app.delete("/api/favorites", async (req: any, res: any) => {
  try {
    const { userId, recipeId } = req.body;

    if (!userId || !recipeId) {
      return res.status(400).json({
        success: false,
        message: "userId and recipeId are required",
      });
    }

    await prisma.favorite.delete({
      where: {
        userId_recipeId: {
          userId: String(userId),
          recipeId: String(recipeId),
        },
      },
    });

    res.json({
      success: true,
      message: "Recipe removed from favorites",
    });
  } catch (error: any) {
    console.error("Remove Favorite Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove favorite",
      error: error.message,
    });
  }
});

// COLLECTIONS ROUTES 

// ১. ইউজারের সব কালেকশন লিস্ট আনার রুট
app.get("/api/collections", async (req: any, res: any) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, message: "UserId is required" });
    }
    const collections = await prisma.collection.findMany({
      where: { userId: String(userId) },
      include: {
        recipes: {
          include: { recipe: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json({ success: true, collections });
  } catch (error: any) {
    console.error("Get Collections Error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch collections", error: error.message });
  }
});

// ২. নতুন কালেকশন তৈরির রুট (যেমন: "Breakfast Ideas")
app.post("/api/collections", async (req: any, res: any) => {
  try {
    const { userId, name } = req.body;
    if (!userId || !name) {
      return res.status(400).json({ success: false, message: "UserId and name are required" });
    }
    const newCollection = await prisma.collection.create({
      data: {
        userId: String(userId),
        name: String(name),
      },
    });
    res.status(201).json({ success: true, message: "Collection created successfully", collection: newCollection });
  } catch (error: any) {
    console.error("Create Collection Error:", error);
    res.status(500).json({ success: false, message: "Failed to create collection", error: error.message });
  }
});

// ৩. নির্দিষ্ট কালেকশনে রেসিপি অ্যাড করার রুট
app.post("/api/collections/add-recipe", async (req: any, res: any) => {
  try {
    const { collectionId, recipeId } = req.body;
    if (!collectionId || !recipeId) {
      return res.status(400).json({ success: false, message: "CollectionId and recipeId are required" });
    }
    const addedItem = await prisma.collectionRecipe.create({
      data: {
        collectionId: String(collectionId),
        recipeId: String(recipeId),
      },
    });
    res.status(201).json({ success: true, message: "Recipe added to collection", addedItem });
  } catch (error: any) {
    if (error.code === "P2002") {
      return res.status(409).json({ success: false, message: "Recipe already exists in this collection" });
    }
    console.error("Add to Collection Error:", error);
    res.status(500).json({ success: false, message: "Failed to add recipe to collection", error: error.message });
  }
});



// DB Test
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
      message: "Database connection request failed",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});