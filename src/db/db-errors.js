export function isDatabaseConnectionError(error) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = error.code;
  if (
    code === 'ER_ACCESS_DENIED_ERROR' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === 'PROTOCOL_CONNECTION_LOST'
  ) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error.message ?? '');
  return /access denied|connect|connection|timed out/i.test(message);
}
