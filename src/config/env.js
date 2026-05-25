import "dotenv/config";
function required(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}
function parseCsv(value) {
  if (!value?.trim()) {
    return [];
  }
  return value.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}
const env = {
  PORT: Number(process.env.PORT ?? 3e3),
  HOST: process.env.HOST?.trim() || "0.0.0.0",
  DATABASE_URL: required("DATABASE_URL"),
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim(),
  FIREBASE_SERVICE_ACCOUNT_PATH: process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim(),
  ADMIN_API_KEY: process.env.ADMIN_API_KEY?.trim() || "",
  ADMIN_IP_ALLOWLIST: parseCsv(process.env.ADMIN_IP_ALLOWLIST),
  CDN_HOSTNAME: process.env.CDN_HOSTNAME?.trim() || "",
  CDN_USERNAME: process.env.CDN_USERNAME?.trim() || "",
  CDN_PASSWORD: process.env.CDN_PASSWORD?.trim() || "",
  CDN_BASE_URL: (() => {
    const hostname = process.env.CDN_HOSTNAME?.trim();
    return hostname ? `https://${hostname}` : "";
  })()
};
function validateStartupConfig() {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON && !env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    console.warn(
      "[config] FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH is not set. Auth endpoints will fail."
    );
  }
  if (!env.ADMIN_API_KEY) {
    console.warn("[config] ADMIN_API_KEY is not set. Admin import endpoints are disabled.");
  }
}
export {
  env,
  validateStartupConfig
};
