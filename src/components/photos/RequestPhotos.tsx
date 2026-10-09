// Thumbnails of a request's photos for whoever is viewing it (supplier
// portal, admin). Each opens full size in a new tab. Photos the viewer isn't
// allowed to see (see migration 0014) just don't appear.

import { useEffect, useState } from "react";
import { signedPhotoUrls, photoPaths } from "../../lib/photos";

export function RequestPhotos({ photos }: { photos: unknown }) {
  const paths = photoPaths(photos);
  const key = paths.join("|");
  const [urls, setUrls] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    const list = key ? key.split("|") : [];
    if (list.length === 0) return;
    let cancelled = false;
    signedPhotoUrls(list)
      .then((u) => { if (!cancelled) setUrls(u); })
      .catch(() => { if (!cancelled) setUrls({}); });
    return () => { cancelled = true; };
  }, [key]);

  if (paths.length === 0) return null;
  const visible = paths.filter((p) => urls?.[p]);

  return (
    <div className="pt-1">
      <span className="text-neutral-500">Photos:</span>
      {urls === null ? (
        <span className="text-neutral-500"> loading…</span>
      ) : visible.length === 0 ? (
        <span className="text-neutral-500"> unavailable</span>
      ) : (
        <div className="flex flex-wrap gap-2 mt-1.5">
          {visible.map((p, i) => (
            <a key={p} href={urls![p]} target="_blank" rel="noopener noreferrer" className="block">
              <img
                src={urls![p]} alt={`Customer photo ${i + 1}`}
                className="w-20 h-20 object-cover rounded-md border border-neutral-700 hover:border-orange-500"
              />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
