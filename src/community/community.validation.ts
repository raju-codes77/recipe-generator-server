import type { CreateCommunityPostInput } from "./community.types";

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function parsePostInput(body: unknown): CreateCommunityPostInput {
  const value = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const caption = text(value.caption, 3000);
  const imageUrl = text(value.imageUrl, 2000);

  if (!caption) {
    throw Object.assign(new Error("Caption is required"), { statusCode: 400 });
  }

  if (!imageUrl) {
    throw Object.assign(new Error("Post image is required"), { statusCode: 400 });
  }

  return {
    caption,
    imageUrl,
    additionalImages: Array.isArray(value.additionalImages)
      ? value.additionalImages
          .map((item) => text(item, 2000))
          .filter(Boolean)
          .slice(0, 5)
      : [],
    tags: Array.isArray(value.tags)
      ? value.tags
          .map((item) => text(item, 60))
          .filter(Boolean)
          .slice(0, 12)
      : [],
    recipe:
      value.recipe && typeof value.recipe === "object"
        ? (value.recipe as CreateCommunityPostInput["recipe"])
        : undefined,
    isChallengeEntry: value.isChallengeEntry === true,
    challengeName: text(value.challengeName, 160) || undefined,
  };
}

export function parseRequiredText(
  value: unknown,
  field: string,
  maxLength = 2000
): string {
  const parsed = text(value, maxLength);

  if (!parsed) {
    throw Object.assign(new Error(`${field} is required`), { statusCode: 400 });
  }

  return parsed;
}

export function parseRating(value: unknown): number {
  const rating = Number(value);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw Object.assign(
      new Error("Rating must be between 1 and 5"),
      { statusCode: 400 }
    );
  }

  return rating;
}