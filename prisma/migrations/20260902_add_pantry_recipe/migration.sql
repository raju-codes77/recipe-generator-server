-- CreateTable
CREATE TABLE IF NOT EXISTS "PantryRecipe" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "kcal" TEXT NOT NULL,
    "protein" TEXT NOT NULL,
    "whyChosen" TEXT NOT NULL,
    "ingredients" JSONB NOT NULL,
    "instructions" JSONB NOT NULL,
    "cuisine" TEXT NOT NULL,
    "mealType" TEXT NOT NULL,
    "cookingTime" TEXT NOT NULL,
    "diet" TEXT NOT NULL,
    "servings" TEXT NOT NULL,
    "selectedOptions" JSONB NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PantryRecipe_pkey" PRIMARY KEY ("id")
);
