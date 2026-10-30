import { useEffect, useState } from "react";
import { Sprout } from "lucide-react";
import { loadPhoto, type PhotoSize } from "../lib/db";
import { t } from "../i18n";

interface Shown {
  /** `${size}:${path}` of the request this answers, so a stale answer never shows for a new path. */
  key: string;
  src: string | null; // null once the load failed
}

/** A sprout on the photo's tile where there is no photo (or it could not be loaded). */
function NoPhoto({ className, alt }: { className: string; alt: string }) {
  return (
    <div className={`${className} placeholder`} role="img" aria-label={`${alt} · ${t.common.noPhoto}`}>
      <Sprout size={28} strokeWidth={1.75} aria-hidden />
    </div>
  );
}

interface Props {
  path: string | null | undefined;
  alt: string;
  className?: string;
  /** `thumb` for a tile: the 320 px copy stored beside the original, or the original itself for a photo that predates thumbnails. */
  size?: PhotoSize;
}

/**
 * A photo from the private bucket: the copy kept on the phone when there is one, otherwise
 * downloaded through a signed URL and kept for the next time (`loadPhoto`). The object URL it shows
 * is revoked when the photo changes or the tile goes.
 */
export function PhotoImg({ path, alt, className = "photo", size = "full" }: Props) {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    if (!path) return;
    const key = `${size}:${path}`;
    let active = true;
    let objectUrl: string | null = null;
    loadPhoto(path, size)
      .then((source) => {
        if (!active) {
          if (source.objectUrl) URL.revokeObjectURL(source.url);
          return;
        }
        if (source.objectUrl) objectUrl = source.url;
        setShown({ key, src: source.url });
      })
      .catch(() => active && setShown({ key, src: null }));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, size]);

  if (!path) return <NoPhoto className={className} alt={alt} />;
  const current = shown && shown.key === `${size}:${path}` ? shown : null;
  if (!current) return <div className={`${className} placeholder`} aria-busy />;
  if (!current.src) return <NoPhoto className={className} alt={alt} />;
  return <img className={className} src={current.src} alt={alt} loading="lazy" decoding="async" />;
}
