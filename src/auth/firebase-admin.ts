import admin from 'firebase-admin';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';

let _app: admin.app.App | null = null;

export function getFirebaseAuth(): admin.auth.Auth {
  if (_app) return admin.auth(_app);

  if (admin.apps.length) {
    _app = admin.app();
    return admin.auth(_app);
  }

  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const cred = admin.credential.cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON));
    _app = admin.initializeApp({ credential: cred });
    return admin.auth(_app);
  }

  if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const abs = path.isAbsolute(env.FIREBASE_SERVICE_ACCOUNT_PATH)
      ? env.FIREBASE_SERVICE_ACCOUNT_PATH
      : path.resolve(process.cwd(), env.FIREBASE_SERVICE_ACCOUNT_PATH);
    const content = fs.readFileSync(abs, 'utf8');
    const cred = admin.credential.cert(JSON.parse(content));
    _app = admin.initializeApp({ credential: cred });
    return admin.auth(_app);
  }

  throw new Error(
    'Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_PATH or FIREBASE_SERVICE_ACCOUNT_JSON.',
  );
}

export async function verifyFirebaseIdToken(idToken: string) {
  return getFirebaseAuth().verifyIdToken(idToken, true);
}
