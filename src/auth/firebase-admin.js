import admin from "firebase-admin";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";

let _app = null;

function parseServiceAccountJson(raw) {
  let value = raw.trim();
  if (!value) {
    throw new Error("Firebase service account JSON is empty.");
  }

  let parsed = JSON.parse(value);
  if (typeof parsed === "string") {
    parsed = JSON.parse(parsed);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Firebase service account JSON must be an object.");
  }

  if (typeof parsed.private_key === "string" && parsed.private_key.includes("\\n")) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }

  return parsed;
}

function readServiceAccountFromEnv() {
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return parseServiceAccountJson(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const abs = path.isAbsolute(env.FIREBASE_SERVICE_ACCOUNT_PATH)
      ? env.FIREBASE_SERVICE_ACCOUNT_PATH
      : path.resolve(process.cwd(), env.FIREBASE_SERVICE_ACCOUNT_PATH);
    const content = fs.readFileSync(abs, "utf8");
    return parseServiceAccountJson(content);
  }

  return null;
}

/** Health / deploy doğrulaması — Admin SDK başlatmadan proje kimliği. */
export function getFirebaseAdminStatus() {
  try {
    const account = readServiceAccountFromEnv();
    if (!account) {
      return { configured: false, projectId: null };
    }
    return {
      configured: true,
      projectId: typeof account.project_id === "string" ? account.project_id : null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Firebase service account";
    return { configured: false, projectId: null, error: message };
  }
}

function getFirebaseAuth() {
  if (_app) return admin.auth(_app);
  if (admin.apps.length) {
    _app = admin.app();
    return admin.auth(_app);
  }

  const account = readServiceAccountFromEnv();
  if (!account) {
    throw new Error(
      "Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON."
    );
  }

  const cred = admin.credential.cert(account);
  _app = admin.initializeApp({ credential: cred });
  return admin.auth(_app);
}

async function verifyFirebaseIdToken(idToken) {
  try {
    return await getFirebaseAuth().verifyIdToken(idToken);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
    ) {
      console.error("[firebase-admin] verifyIdToken failed:", error.code, error.message);
    } else {
      console.error("[firebase-admin] verifyIdToken failed:", error);
    }
    throw error;
  }
}

export {
  getFirebaseAuth,
  verifyFirebaseIdToken,
};
