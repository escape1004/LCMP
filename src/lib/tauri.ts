import { convertFileSrc } from "@tauri-apps/api/tauri";

const schemeRegex = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const windowsPathRegex = /^[a-zA-Z]:[\\/]/;

const normalizePath = (value: string) => {
  let result = value.trim();
  if (result.startsWith("\\\\?\\")) {
    result = result.slice(4);
    if (result.startsWith("UNC\\")) {
      result = `\\\\${result.slice(4)}`;
    }
  }
  if (result.toLowerCase().startsWith("file://")) {
    result = decodeURIComponent(result.replace(/^file:\/+/, ""));
  }
  return result.replace(/\\/g, "/");
};

export const toFileSrc = (path?: string | null) => {
  if (!path) return null;
  const normalized = normalizePath(path);
  if (schemeRegex.test(normalized) && !normalized.toLowerCase().startsWith("file:")) {
    return normalized;
  }
  if (windowsPathRegex.test(normalized) || normalized.startsWith("//")) {
    return convertFileSrc(normalized);
  }
  return convertFileSrc(normalized);
};
