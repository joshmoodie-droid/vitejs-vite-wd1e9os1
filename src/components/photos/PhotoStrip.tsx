// A row of photo thumbnails from storage paths, each opening full size in a
// new tab. Paths the viewer can't read (see migration 0014) are left out.

import { useEffect, useState } from "react";
import { signedPhotoUrls, photoPaths } from "../../lib/photos";

export function PhotoStrip({ photos, size = "w-20 h-20", alt = "Photo" }: { photos: unknown; size?: string; alt?: string }) {
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
  if (urls === null) return <span className="text-neutral-500 text-xs">Loading photos…</span>;
  const visible = paths.filter((p) => urls[p]);
  if (visible.length === 0) return <span className="text-neutral-500 text-xs">Photos unavailable</span>;

  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((p, i) => (
        <a key={p} href={urls[p]} target="_blank" rel="noopener noreferrer" className="block">
          <img src={urls[p]} alt={`${alt} ${i + 1}`} className={`${size} object-cover rounded-md border border-neutral-700 hover:border-orange-500`} />
        </a>
      ))}
    </div>
  );
}
