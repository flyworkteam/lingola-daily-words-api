import type { DecodedIdToken } from 'firebase-admin/auth';
import type { User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      firebaseToken?: DecodedIdToken;
      user?: User;
    }
  }
}

export {};
