import { Client, type ClientConfig } from "pg";
export interface DatabaseBinding {
  connectionString: string;
  ssl?: ClientConfig["ssl"];
}
export function databaseClient(binding: DatabaseBinding, timeout = 8000) {
  return new Client({
    connectionString: binding.connectionString,
    ...(binding.ssl ? { ssl: binding.ssl } : {}),
    connectionTimeoutMillis: 4000,
    query_timeout: timeout,
  });
}
