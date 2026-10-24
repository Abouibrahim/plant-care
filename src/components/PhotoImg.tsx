import { useEffect, useState } from "react";
import { Sprout } from "lucide-react";
import { photoUrl } from "../lib/db";
import { t } from "../i18n";

interface Resolved {
  path: string;
  url: string | null; // null once resolution failed
}

/** A sprout on the photo's tile where there is no photo (or it could not be loaded). */
function NoPhoto({ className, alt }: { className: string; alt: string }) {
  return (
    <div className={`${className} placeholder`} role="img" aria-label={`${alt} · ${t.common.noPhoto}`}>
      <Sprout size={28} strokeWidth={1.75} aria-hidden />
    </div>
  );
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

  if (!path) return <NoPhoto className={className} alt={alt} />;
  const current = resolved && resolved.path === path ? resolved : null;
  if (!current) return <div className={`${className} placeholder`} aria-busy />;
  if (!current.url) return <NoPhoto className={className} alt={alt} />;
  return <img className={className} src={current.url} alt={alt} loading="lazy" />;
}
