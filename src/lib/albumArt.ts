import { exists, readBinaryFile } from "@tauri-apps/api/fs";

const dataUrlCache = new Map<string, string>();
const pendingCache = new Map<string, Promise<string | null>>();

const getMimeType = (path: string) => {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".bmp")) return "image/bmp";
  return "image/jpeg";
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

export const resolveAlbumArtDataUrl = async (path: string) => {
  if (dataUrlCache.has(path)) {
    return dataUrlCache.get(path)!;
  }
  if (pendingCache.has(path)) {
    return pendingCache.get(path)!;
  }
  
  const task = (async () => {
    const isValid = await exists(path);
    if (!isValid) return null;
    const bytes = await readBinaryFile(path);
    const base64 = toBase64(bytes);
    const mime = getMimeType(path);
    const dataUrl = `data:${mime};base64,${base64}`;
    dataUrlCache.set(path, dataUrl);
    return dataUrl;
  })();
  
  pendingCache.set(path, task);
  const result = await task;
  pendingCache.delete(path);
  return result;
};
