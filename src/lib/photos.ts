// Request photos: shrink on the device, upload to the private `photos`
// storage bucket, and read back through short-lived signed URLs.
// Access rules live in supabase/migrations/0014_request_photos.sql — a
// customer writes only to their own `<user id>/` folder.

import { supabase } from "../supabaseClient";

export const MAX_PHOTOS = 3;
const BUCKET = "photos";
const MAX_EDGE = 1600; // px, longest side after resizing
const JPEG_QUALITY = 0.8;
const SIGNED_URL_TTL = 60 * 60; // seconds

// Resize to MAX_EDGE and re-encode as JPEG. createImageBitmap applies the
// EXIF orientation, so phone photos aren't sideways. Throws if the browser
// can't decode the file (e.g. HEIC on desktop Chrome).
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process that photo.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("Couldn't process that photo.");
  return blob;
}

// Upload one photo for the signed-in user; returns its storage path.
export async function uploadPhoto(userId: string, file: File): Promise<string> {
  const blob = await compressImage(file);
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

// Best effort: a photo removed before the request is sent shouldn't linger.
export async function deletePhoto(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}

// path -> signed URL, for the paths the caller is allowed to see. Paths the
// caller can't read are simply missing from the result.
export async function signedPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL);
  if (error) throw new Error(error.message);
  const out: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) out[item.path] = item.signedUrl;
  }
  return out;
}

// requests.photos may be null (older rows / anonymous requests) or an array.
export function photoPaths(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((p): p is string => typeof p === "string") : [];
}
