// Loads .env next to the package (if present) into process.env.
// Existing environment variables win, as with process.loadEnvFile().
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function loadEnv() {
  const file = join(ROOT, ".env");
  if (existsSync(file)) process.loadEnvFile(file);
  return {
    DEMIFY_URL: (process.env.DEMIFY_URL || "http://127.0.0.1:3000").trim(),
    DEMIFY_ADMIN_TOKEN: (process.env.DEMIFY_ADMIN_TOKEN || "").trim(),
    MQTT_URL: (process.env.MQTT_URL || "mqtt://127.0.0.1:1883").trim(),
    PORT: Number(process.env.PORT || 8443),
    HTTP_PORT: process.env.HTTP_PORT ? Number(process.env.HTTP_PORT) : null,
    PULSE_TOKEN: (process.env.PULSE_TOKEN || "").trim(),
    CREW_ID: (process.env.CREW_ID || "test").trim(),
  };
}

/** First 3 characters only: secrets never appear in full in logs. */
export function mask(secret) {
  return secret ? `${secret.slice(0, 3)}…` : "(none)";
}

export function stamp() {
  return new Date().toLocaleTimeString("de-CH", { hour12: false });
}
