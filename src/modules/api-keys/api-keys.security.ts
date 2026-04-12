import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const API_KEY_PREFIX = "ft_live_";

export function generateRawApiKey(): string {
  return `${API_KEY_PREFIX}${randomBytes(24).toString("hex")}`;
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function getKeyPrefix(raw: string): string {
  return raw.slice(0, 16);
}

export function getKeyPreview(raw: string): string {
  const start = raw.slice(0, 11);
  const end = raw.slice(-4);
  return `${start}...${end}`;
}

export function isApiKeyFormat(raw: string): boolean {
  return /^ft_live_[a-f0-9]{48}$/i.test(raw);
}

export function safeHashEquals(expectedHex: string, actualHex: string): boolean {
  if (expectedHex.length !== actualHex.length) return false;
  return timingSafeEqual(Buffer.from(expectedHex, "utf8"), Buffer.from(actualHex, "utf8"));
}
