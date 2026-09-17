import { PrismaClient } from './generated/prisma/index.js';

const prisma = new PrismaClient();

async function main() {
  const nullUserIdRecipes = await prisma.pantryRecipe.count({
    where: { userId: null }
  });
  
  const allRecipes = await prisma.pantryRecipe.count();
  
  console.log(`Total Pantry Recipes: ${allRecipes}`);
  console.log(`Recipes with userId = null: ${nullUserIdRecipes}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
