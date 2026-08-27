import { randomUUID } from "node:crypto";

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function uploadCommunityImage(
  dataUrl: string,
  folder: "posts" | "stories"
): Promise<string> {
  const match = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);

  if (!match || !ALLOWED_TYPES.has(match[1])) {
    throw Object.assign(
      new Error("Only JPEG, PNG, WebP, or GIF images are allowed"),
      { statusCode: 400 }
    );
  }

  const bytes = Buffer.from(match[2], "base64");

  if (bytes.length > MAX_IMAGE_BYTES) {
    throw Object.assign(
      new Error("Image must be 6 MB or smaller"),
      { statusCode: 400 }
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "community-images";

  if (!supabaseUrl || !secret) {
    throw Object.assign(
      new Error("Supabase Storage is not configured"),
      { statusCode: 503 }
    );
  }

  const extension = match[1] === "image/jpeg" ? "jpg" : match[1].split("/")[1];
  const objectPath = `${folder}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;

  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/${bucket}/${objectPath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        apikey: secret,
        "Content-Type": match[1],
        "x-upsert": "false",
      },
      body: bytes,
    }
  );

  if (!response.ok) {
    const details = await response.text();
    console.error("Supabase Storage upload failed", response.status, details);

    throw Object.assign(
      new Error("Image upload failed"),
      { statusCode: 502 }
    );
  }

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${objectPath}`;
}