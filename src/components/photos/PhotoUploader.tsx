// Photo picker for the request forms (signed-in customers). Each chosen photo
// is shrunk on the device and uploaded straight away; the form only holds the
// storage paths. On a phone the picker offers both the camera and the gallery.

import { useEffect, useRef, useState } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import { MAX_PHOTOS, uploadPhoto, deletePhoto, signedPhotoUrls } from "../../lib/photos";

export function PhotoUploader({
  userId, value, onChange, hint,
}: {
  userId: string;
  value: string[];
  onChange: (paths: string[]) => void;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  // path -> preview URL (a local object URL for fresh uploads, else signed)
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");

  // Paths we have no preview for (e.g. the form was restored) get signed
  // URLs — asked for once each, so a path we can't read doesn't refetch forever.
  const requested = useRef(new Set<string>());
  useEffect(() => {
    const missing = value.filter((p) => !previews[p] && !requested.current.has(p));
    if (missing.length === 0) return;
    missing.forEach((p) => requested.current.add(p));
    signedPhotoUrls(missing)
      .then((urls) => setPreviews((pv) => ({ ...pv, ...urls })))
      .catch(() => {});
  }, [value, previews]);

  const room = MAX_PHOTOS - value.length - uploading;

  const onFiles = async (files: FileList | null) => {
    setError("");
    const picked = Array.from(files ?? []).filter((f) => f.type.startsWith("image/") || f.type === "");
    if (inputRef.current) inputRef.current.value = ""; // allow re-picking the same file
    if (picked.length === 0) return;
    const batch = picked.slice(0, Math.max(0, room));
    if (picked.length > batch.length) setError(`You can attach up to ${MAX_PHOTOS} photos.`);
    setUploading((n) => n + batch.length);
    const added: string[] = [];
    for (const file of batch) {
      try {
        const path = await uploadPhoto(userId, file);
        added.push(path);
        setPreviews((pv) => ({ ...pv, [path]: URL.createObjectURL(file) }));
      } catch (e) {
        setError(
          e instanceof Error && /decode|source image|InvalidStateError/i.test(`${e.name} ${e.message}`)
            ? "That photo format isn't supported here — try a JPEG or PNG."
            : `Couldn't upload a photo${e instanceof Error ? `: ${e.message}` : ""}.`,
        );
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (added.length) onChange([...value, ...added]);
  };

  const remove = (path: string) => {
    onChange(value.filter((p) => p !== path));
    deletePhoto(path).catch(() => {});
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {value.map((path, i) => (
          <div key={path} className="relative w-24 h-24 rounded-lg overflow-hidden border border-neutral-700 bg-neutral-800">
            {previews[path] && <img src={previews[path]} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />}
            <button
              type="button" onClick={() => remove(path)} aria-label={`Remove photo ${i + 1}`}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-red-500"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {Array.from({ length: uploading }).map((_, i) => (
          <div key={`up-${i}`} className="w-24 h-24 rounded-lg border border-neutral-700 bg-neutral-800 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-orange-500 animate-spin" />
          </div>
        ))}
        {room > 0 && (
          <button
            type="button" onClick={() => inputRef.current?.click()}
            className="w-24 h-24 rounded-lg border border-dashed border-neutral-600 hover:border-orange-500 text-neutral-400 hover:text-white flex flex-col items-center justify-center gap-1 text-xs font-semibold"
          >
            <Camera className="w-5 h-5" />
            {value.length === 0 ? "Add photo" : "Add another"}
          </button>
        )}
      </div>
      <input
        ref={inputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
      {error ? (
        <p className="text-xs text-red-400 mt-2">{error}</p>
      ) : (
        <p className="text-xs text-neutral-500 mt-2">{hint ?? `Up to ${MAX_PHOTOS} photos.`}</p>
      )}
    </div>
  );
}
