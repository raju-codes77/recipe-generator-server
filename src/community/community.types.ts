export interface AuthenticatedCommunityUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export interface CommunityRecipeInput {
  title: string;
  cuisine?: string;
  difficulty?: "Easy" | "Medium" | "Hard";
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  servings?: number;
  dietaryTags?: string[];
  ingredients?: Array<{ name: string; amount: string; optional?: boolean }>;
  steps?: Array<{ stepNumber: number; instruction: string; durationMinutes?: number; tip?: string }>;
  nutrition?: { calories?: number; protein?: number; carbs?: number; fat?: number; fiber?: number };
  sourceType?: "community" | "ai_generated" | "mealdb";
}

export interface CreateCommunityPostInput {
  caption: string;
  imageUrl: string;
  additionalImages?: string[];
  tags?: string[];
  recipe?: CommunityRecipeInput;
  isChallengeEntry?: boolean;
  challengeName?: string;
}
