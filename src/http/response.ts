import type { Response } from 'express';

export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ ok: true, data });
}

export function fail(
  res: Response,
  args: { status: number; code: string; message?: string; details?: unknown },
) {
  return res.status(args.status).json({
    ok: false,
    error: {
      code: args.code,
      message: args.message ?? args.code,
      details: args.details,
    },
  });
}
