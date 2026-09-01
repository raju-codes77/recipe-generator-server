import { supabase } from "../lib/supabase";

export const uploadMealImage = async (
  file: Buffer,
  fileName: string,
  contentType: string
) => {
  const filePath = `meals/${Date.now()}-${fileName}`;

  const { error } = await supabase.storage
    .from("meal-images")
    .upload(filePath, file, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Image upload failed: ${error.message}`);
  }

  const { data } = supabase.storage
    .from("meal-images")
    .getPublicUrl(filePath);

  return data.publicUrl;
};