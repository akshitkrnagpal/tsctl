import Typesense, { Client } from "typesense";
import type { ConnectionConfig } from "../types/index.js";

let client: Client | null = null;

export function initClient(config: ConnectionConfig): Client {
  client = new Typesense.Client({
    nodes: config.nodes,
    apiKey: config.apiKey,
    connectionTimeoutSeconds: config.connectionTimeoutSeconds ?? 10,
    retryIntervalSeconds: config.retryIntervalSeconds ?? 0.1,
    numRetries: config.numRetries ?? 3,
  });
  return client;
}

export function getClient(): Client {
  if (!client) {
    throw new Error(
      "Typesense client not initialized. Call initClient() first or run 'tsctl init'"
    );
  }
  return client;
}

export async function testConnection(): Promise<boolean> {
  try {
    const c = getClient();
    await c.health.retrieve();
    return true;
  } catch {
    return false;
  }
}

export function getClientFromEnv(): Client {
  const host = process.env["TYPESENSE_HOST"] || "localhost";
  const port = parseInt(process.env["TYPESENSE_PORT"] || "8108", 10);
  const protocol = (process.env["TYPESENSE_PROTOCOL"] || "http") as
    | "http"
    | "https";
  const apiKey = process.env["TYPESENSE_API_KEY"];

  if (!apiKey) {
    throw new Error(
      "TYPESENSE_API_KEY environment variable is required.\n" +
        "Set it in your environment or create a .env file."
    );
  }

  return initClient({
    nodes: [{ host, port, protocol }],
    apiKey,
  });
}
