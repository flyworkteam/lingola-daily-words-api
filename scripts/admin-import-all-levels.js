import 'dotenv/config';

const port = process.env.PORT ?? 3000;
const host = process.env.HOST?.trim() || '127.0.0.1';
const bindHost = host === '0.0.0.0' ? '127.0.0.1' : host;
const adminKey = process.env.ADMIN_API_KEY?.trim();

if (!adminKey) {
  console.error('ADMIN_API_KEY is not set in .env');
  process.exit(1);
}

const body = {
  targetLang: process.argv[2]?.trim() || 'tr',
  limit: Number(process.argv[3] ?? 50),
  maxOffset: Number(process.argv[4] ?? 300),
};

const url = `http://${bindHost}:${port}/api/admin/import-all-levels`;

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Admin-Api-Key': adminKey,
  },
  body: JSON.stringify(body),
});

const payload = await response.json().catch(() => ({}));

if (!response.ok) {
  console.error('Import failed:', response.status, payload);
  process.exit(1);
}

console.log('Import completed:', JSON.stringify(payload, null, 2));
