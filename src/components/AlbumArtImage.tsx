import { useEffect, useRef, useState } from "react";
import { toFileSrc } from "../lib/tauri";
import { resolveAlbumArtDataUrl } from "../lib/albumArt";
import { invoke } from "@tauri-apps/api/tauri";
import { exists } from "@tauri-apps/api/fs";

interface AlbumArtImageProps {
  filePath?: string | null;
  path?: string | null;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
  preferPath?: boolean;
}

const embeddedCache = new Map<string, string | null>();
const embeddedPending = new Map<string, Promise<string | null>>();
const schemeRegex = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const windowsPathRegex = /^[a-zA-Z]:[\\/]/;

const normalizeLocalPath = (value: string) => {
  let result = value.trim();
  if (result.startsWith("\\\\?\\")) {
    result = result.slice(4);
    if (result.startsWith("UNC\\")) {
      result = `\\\\${result.slice(4)}`;
    }
  }
  if (result.toLowerCase().startsWith("file://")) {
    result = decodeURIComponent(result.replace(/^file:\/*/i, ""));
  }
  return result;
};

const isLocalPath = (value: string) => {
  if (windowsPathRegex.test(value)) return true;
  if (value.startsWith("\\\\")) return true;
  if (value.startsWith("/")) return true;
  if (value.toLowerCase().startsWith("file://")) return true;
  return false;
};

const getEmbeddedArtPath = async (filePath: string) => {
  if (embeddedCache.has(filePath)) {
    return embeddedCache.get(filePath) ?? null;
  }
  if (embeddedPending.has(filePath)) {
    return embeddedPending.get(filePath) ?? null;
  }
  const task = (async () => {
    try {
      const result = await invoke<string | null>("get_album_art_cache_path", { filePath });
      embeddedCache.set(filePath, result ?? null);
      return result ?? null;
    } catch (error) {
      console.error("Failed to resolve embedded album art:", error);
      embeddedCache.set(filePath, null);
      return null;
    }
  })();
  embeddedPending.set(filePath, task);
  const resolved = await task;
  embeddedPending.delete(filePath);
  return resolved;
};

export const AlbumArtImage = ({
  filePath,
  path,
  alt,
  className,
  fallback,
  preferPath = false,
}: AlbumArtImageProps) => {
  const [src, setSrc] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const sourceRef = useRef<"embedded" | "path" | "data" | null>(null);

  useEffect(() => {
    let cancelled = false;

    const preload = (candidate: string) =>
      new Promise<boolean>((resolve) => {
        const image = new Image();
        image.onload = () => resolve(true);
        image.onerror = () => resolve(false);
        image.src = candidate;
      });

    const setIfLoaded = async (candidate: string, allowDataUrl = true) => {
      const primary = toFileSrc(candidate);
      if (primary) {
        const ok = await preload(primary);
        if (ok && !cancelled) {
          setSrc(primary);
          return true;
        }
      }
      if (!allowDataUrl || cancelled) return false;
      try {
        const dataUrl = await resolveAlbumArtDataUrl(candidate);
        if (dataUrl && !cancelled) {
          const ok = await preload(dataUrl);
          if (ok && !cancelled) {
            setSrc(dataUrl);
            return true;
          }
        }
      } catch (error) {
        console.error("Failed to load album art:", error);
      }
      return false;
    };

    const load = async () => {
      setSrc(null);
      sourceRef.current = null;

      // 1) DB/path if exists (optionally preferred)
      if (path) {
        if (isLocalPath(path)) {
          const localPath = normalizeLocalPath(path);
          try {
            const ok = await exists(localPath);
            if (ok && !cancelled) {
              sourceRef.current = "path";
              if (await setIfLoaded(path, false)) return;
            }
          } catch (error) {
            console.error("Failed to check album art path:", error);
          }
        } else if (!schemeRegex.test(path) || path.toLowerCase().startsWith("file:")) {
          sourceRef.current = "path";
          if (await setIfLoaded(path, false)) return;
        } else {
          sourceRef.current = "path";
          if (await setIfLoaded(path, false)) return;
        }
      }

      // 2) Embedded cache path if already resolved (only when not preferring a path)
      if (!preferPath && filePath && embeddedCache.has(filePath)) {
        const embedded = embeddedCache.get(filePath);
        if (embedded) {
          sourceRef.current = "embedded";
          if (await setIfLoaded(embedded)) return;
        }
      }

      // 3) Embedded art extraction (disk cache) in background
      if (filePath) {
        const embedded = await getEmbeddedArtPath(filePath);
        if (embedded && !cancelled) {
          sourceRef.current = "embedded";
          await setIfLoaded(embedded);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [filePath, path]);

  if (!src) return <>{fallback ?? null}</>;

  return (
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      className={className}
    />
  );
};
