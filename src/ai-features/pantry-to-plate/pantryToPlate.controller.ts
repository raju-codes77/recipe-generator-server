// import { Request, Response } from "express";
// import { generateAndSaveRecipe } from "./pantryToPlate.service";
// // import { generateAndSaveRecipe } from "./pantryToPlate.service";

// export async function generateRecipeHandler(req: Request, res: Response) {
//   try {
//     const { ingredients } = req.body;

//     if (!ingredients || ingredients.length === 0) {
//       return res.status(400).json({ error: "ingredients required" });
//     }

//     const recipe = await generateAndSaveRecipe(req.body);
//     res.json(recipe);
//   } catch (err) {
//     console.error("[pantry-to-plate] generate error:", err);
//     res.status(500).json({ error: "Failed to generate recipe" });
//   }
// }