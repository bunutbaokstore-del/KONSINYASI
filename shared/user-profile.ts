export const KTP_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type KtpContentType = (typeof KTP_CONTENT_TYPES)[number];

export type KtpUpload = {
  uri: string;
  base64: string;
  contentType: KtpContentType;
  originalName: string;
  fileSize?: number;
};

export function normalizePhone(value: string) {
  return value.trim().replace(/[\s()-]/g, "");
}

export function isValidPhone(value: string) {
  const normalized = normalizePhone(value);
  return /^\+?\d{8,15}$/.test(normalized);
}

export function isValidProfileAddress(value: string) {
  return value.trim().length >= 10;
}

export function isValidProfileName(value: string) {
  return value.trim().length >= 2;
}
