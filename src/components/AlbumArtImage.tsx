import { useEffect, useState } from "react";
import { toFileSrc } from "../lib/tauri";
import { resolveAlbumArtDataUrl } from "../lib/albumArt";

interface AlbumArtImageProps {
  path: string;
  alt: string;
  className?: string;
}

export const AlbumArtImage = ({ path, alt, className }: AlbumArtImageProps) => {
  const [src, setSrc] = useState<string | null>(toFileSrc(path));
  const [triedDataUrl, setTriedDataUrl] = useState(false);

  useEffect(() => {
    setSrc(toFileSrc(path));
    setTriedDataUrl(false);
  }, [path]);

  const handleError = async () => {
    if (triedDataUrl) return;
    setTriedDataUrl(true);
    try {
      const dataUrl = await resolveAlbumArtDataUrl(path);
      if (dataUrl) {
        setSrc(dataUrl);
      }
    } catch (error) {
      console.error("Failed to load album art:", error);
    }
  };

  if (!src) return null;

  return <img src={src} alt={alt} className={className} onError={handleError} />;
};
