
import { supabase } from "../lib/supabase.js";

export const uploadMealImage = async (
  file: Buffer,
  fileName: string,
  contentType: string
) => {
  // Create a safer filename
  const sanitizedFileName = fileName.replace(
    /[^a-zA-Z0-9._-]/g,
    "-"
  );

  // Create a unique storage path
  const filePath = `meals/${Date.now()}-${sanitizedFileName}`;

  // Upload image to Supabase Storage
  const { error } = await supabase.storage
    .from("meal-images")
    .upload(filePath, file, {
      contentType,
      upsert: false,
    });

  // Stop if upload fails
  if (error) {
    console.error("Supabase meal image upload failed:", error);

    throw new Error(
      `Image upload failed: ${error.message}`
    );
  }

  // Get the public URL of the uploaded image
  const { data } = supabase.storage
    .from("meal-images")
    .getPublicUrl(filePath);

  // Ensure the public URL was generated
  if (!data?.publicUrl) {
    throw new Error(
      "Image uploaded successfully, but failed to generate public URL."
    );
  }

  return data.publicUrl;
};

