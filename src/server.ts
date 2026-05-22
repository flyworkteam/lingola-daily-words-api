import { createApp } from './app.js';
import { env, validateStartupConfig } from './config/env.js';

validateStartupConfig();

const app = createApp();

app.listen(env.PORT, env.HOST, () => {
  const host = env.HOST === '0.0.0.0' ? 'localhost' : env.HOST;
  console.log(`API listening on http://${host}:${env.PORT}`);
});
