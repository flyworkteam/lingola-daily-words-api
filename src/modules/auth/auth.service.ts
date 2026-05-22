import type { DecodedIdToken } from 'firebase-admin/auth';
import { prisma } from '../../db/prisma.js';

function providerFromToken(decoded: DecodedIdToken): string | null {
  const provider = decoded.firebase?.sign_in_provider;
  if (!provider) return null;
  if (provider === 'google.com') return 'google';
  if (provider === 'apple.com') return 'apple';
  return provider;
}

export async function upsertUserFromFirebaseToken(decoded: DecodedIdToken) {
  const now = new Date();
  const email = decoded.email ?? null;
  const displayName = decoded.name ?? null;
  const photoUrl = decoded.picture ?? null;
  const provider = providerFromToken(decoded);

  return prisma.user.upsert({
    where: { firebaseUid: decoded.uid },
    create: {
      firebaseUid: decoded.uid,
      email,
      displayName,
      photoUrl,
      provider,
      lastLoginAt: now,
    },
    update: {
      email,
      displayName,
      photoUrl,
      provider,
      lastLoginAt: now,
    },
  });
}

export function toPublicUser(user: {
  id: string;
  firebaseUid: string;
  email: string | null;
  displayName: string | null;
  photoUrl: string | null;
  provider: string | null;
  createdAt: Date;
  lastLoginAt: Date | null;
}) {
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
