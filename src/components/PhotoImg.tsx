import { useEffect, useState } from "react";
import { photoUrl } from "../lib/db";
import { t } from "../i18n";

interface Resolved {
  path: string;
  url: string | null; // null once resolution failed
}

/** Renders a photo from the private bucket through a signed URL. */
export function PhotoImg({ path, alt, className = "photo" }: { path: string | null | undefined; alt: string; className?: string }) {
  const [resolved, setResolved] = useState<Resolved | null>(null);

  useEffect(() => {
    if (!path) return;
    let active = true;
    photoUrl(path)
      .then((url) => active && setResolved({ path, url }))
      .catch(() => active && setResolved({ path, url: null }));
    return () => {
      active = false;
    };
  }, [path]);

  if (!path) {
    return (
      <div className={`${className} placeholder`} aria-label={alt}>
        {t.common.noPhoto}
      </div>
    );
  }
  const current = resolved && resolved.path === path ? resolved : null;
  if (!current) return <div className={`${className} placeholder`} aria-busy />;
  if (!current.url) {
    return (
      <div className={`${className} placeholder`} aria-label={alt}>
        {t.common.noPhoto}
      </div>
    );
  }
  return <img className={className} src={current.url} alt={alt} loading="lazy" />;
}
