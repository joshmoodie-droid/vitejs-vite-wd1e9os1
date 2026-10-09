// Thumbnails of a request's photos for whoever is viewing it (supplier
// portal, admin). Photos the viewer isn't allowed to see just don't appear.

import { photoPaths } from "../../lib/photos";
import { PhotoStrip } from "./PhotoStrip";

export function RequestPhotos({ photos }: { photos: unknown }) {
  if (photoPaths(photos).length === 0) return null;
  return (
    <div className="pt-1">
      <div className="text-neutral-500 mb-1.5">Photos:</div>
      <PhotoStrip photos={photos} alt="Customer photo" />
    </div>
  );
}
