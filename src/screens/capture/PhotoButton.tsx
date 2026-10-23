import { useRef, type ChangeEvent } from "react";

interface Props {
  label: string;
  /** true opens the camera straight away (capture="environment"); false shows the gallery picker. */
  camera: boolean;
  className?: string;
  disabled?: boolean;
  onFile: (file: File) => void;
}

/** A large button in front of a hidden <input type="file"> that yields one image. */
export function PhotoButton({ label, camera, className = "", disabled = false, onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so the same file can be chosen again
    if (file) onFile(file);
  }

  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => inputRef.current?.click()}>
        {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={camera ? "environment" : undefined}
        hidden
        onChange={onChange}
      />
    </>
  );
}
