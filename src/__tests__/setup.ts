import { initClient, getClient } from "../client/index.js";

const TEST_API_KEY = "test-api-key";
const TEST_HOST = "localhost";
const TEST_PORT = 8108;
const TEST_PROTOCOL = "http" as const;

export function setupClient() {
  return initClient({
    nodes: [{ host: TEST_HOST, port: TEST_PORT, protocol: TEST_PROTOCOL }],
    apiKey: TEST_API_KEY,
  });
}

export async function cleanupTypesense() {
  const client = getClient();

  // Delete all collections
  const collections = await client.collections().retrieve();
  for (const collection of collections) {
    await client.collections(collection.name).delete();
  }

  // Delete all aliases
  const aliasesResponse = await client.aliases().retrieve();
  for (const alias of aliasesResponse.aliases) {
    await client.aliases(alias.name).delete();
  }

  // Delete all API keys (except the admin key, id=0)
  const keysResponse = await client.keys().retrieve();
  for (const key of keysResponse.keys) {
    if (key.id !== 0) {
      await client.keys(key.id).delete();
    }
  }

  // Delete all analytics rules
  try {
    const rulesResponse = await client.analytics.rules().retrieve();
    for (const rule of rulesResponse.rules || []) {
      await client.analytics.rules(rule.name).delete();
    }
  } catch {
    // analytics may not be available
  }
}
