import { createApp } from "./app.js";
import { env, validateStartupConfig } from "./config/env.js";
validateStartupConfig();
const app = createApp();
const server = app.listen(env.PORT, env.HOST, () => {
  const host = env.HOST === "0.0.0.0" ? "localhost" : env.HOST;
  console.log(`API listening on http://${host}:${env.PORT}`);
  if (env.PUBLIC_API_BASE_URL) {
    console.log(`Public API base URL (Flutter): ${env.PUBLIC_API_BASE_URL}`);
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRNOTAVAIL") {
    console.error(
      `[server] Cannot bind to ${env.HOST}:${env.PORT}. HOST must be 0.0.0.0 or 127.0.0.1 on this machine — not the remote MySQL IP. See docs/DEPLOYMENT.md.`,
    );
  }
  throw error;
});
