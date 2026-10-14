import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
import http from "node:http";
import pg from "pg";

export async function readDatabaseConfig() {
  const config = parseEnv(await readFile(".env.supabase.local", "utf8"));
  if (
    !/^db\.[a-z0-9]+\.supabase\.co$/.test(config.SUPABASE_DB_HOST ?? "") ||
    config.SUPABASE_DB_PORT !== "5432" ||
    config.SUPABASE_DB_NAME !== "postgres" ||
    !config.SUPABASE_DB_PASSWORD ||
    !config.SUPABASE_DB_CA_FILE
  )
    throw new Error("LOCAL_DATABASE_CONFIGURATION_REQUIRED");
  return config;
}
export async function connectDatabase(config, runtime) {
  const host = config.SUPABASE_DB_HOST;
  let stream;
  if (process.argv.includes("--proxy")) {
    stream = await new Promise((resolveSocket, reject) => {
      const endpoint = `${host}:5432`;
      const proxy = new URL(
        process.env.COLORVERSE_DB_PROXY ??
          process.env.HTTPS_PROXY ??
          "http://127.0.0.1:7892",
      );
      if (proxy.protocol !== "http:" || proxy.username || proxy.password)
        throw new Error("INVALID_DATABASE_PROXY");
      const request = http.request({
        host: proxy.hostname,
        port: Number(proxy.port || 80),
        method: "CONNECT",
        path: endpoint,
        headers: { Host: endpoint },
      });
      const timer = setTimeout(
        () => request.destroy(new Error("PROXY_TIMEOUT")),
        12000,
      );
      request.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      request.on("connect", (response, socket, head) => {
        clearTimeout(timer);
        if (response.statusCode !== 200) {
          socket.destroy();
          reject(new Error("PROXY_REJECTED"));
          return;
        }
        if (head.length) socket.unshift(head);
        socket.connect = () => {
          queueMicrotask(() => socket.emit("connect"));
          return socket;
        };
        resolveSocket(socket);
      });
      request.end();
    });
  }
  const client = new pg.Client({
    host,
    port: 5432,
    database: "postgres",
    user: runtime?.CLOUD_DATABASE_USER ?? config.SUPABASE_DB_USER,
    password: runtime?.CLOUD_DATABASE_PASSWORD ?? config.SUPABASE_DB_PASSWORD,
    ssl: {
      rejectUnauthorized: true,
      ca: await readFile(resolve(config.SUPABASE_DB_CA_FILE), "utf8"),
    },
    stream,
    connectionTimeoutMillis: 12000,
    query_timeout: 12000,
    statement_timeout: 8000,
    application_name: "colorverse-cloud-setup",
  });
  try {
    await client.connect();
    return client;
  } catch (error) {
    await client.end().catch(() => {});
    throw error;
  }
}
