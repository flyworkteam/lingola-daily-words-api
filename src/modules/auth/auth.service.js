import { upsertUserFromFirebase as upsertUserRow } from '../../db/repositories.js';

function providerFromToken(decoded) {
  const provider = decoded.firebase?.sign_in_provider;
  if (!provider) return null;
  if (provider === 'google.com') return 'google';
  if (provider === 'apple.com') return 'apple';
  return provider;
}

export async function upsertUserFromFirebaseToken(decoded) {
  const now = new Date();
  return upsertUserRow({
    firebaseUid: decoded.uid,
    email: decoded.email ?? null,
    displayName: decoded.name ?? null,
    photoUrl: decoded.picture ?? null,
    provider: providerFromToken(decoded),
    lastLoginAt: now,
  });
}

export function toPublicUser(user) {
  return {
    id: user.id,
    firebaseUid: user.firebaseUid,
    email: user.email,
    displayName: user.displayName,
    photoUrl: user.photoUrl,
    provider: user.provider,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}
