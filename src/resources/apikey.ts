import { getClient } from "../client/index.js";
import type { ApiKeyConfig } from "../types/index.js";

/**
 * Stored API key with its Typesense ID
 * We need to track the ID to be able to delete keys later
 */
export interface StoredApiKey extends ApiKeyConfig {
  id: number;
}

/**
 * Convert our ApiKeyConfig to Typesense API format for creation
 */
function toTypesenseApiKey(config: ApiKeyConfig): {
  description: string;
  actions: string[];
  collections: string[];
  value?: string;
  expires_at?: number;
  autodelete?: boolean;
} {
  const result: {
    description: string;
    actions: string[];
    collections: string[];
    value?: string;
    expires_at?: number;
    autodelete?: boolean;
  } = {
    description: config.description,
    actions: config.actions,
    collections: config.collections,
  };

  if (config.value) result.value = config.value;
  if (config.expires_at !== undefined) result.expires_at = config.expires_at;
  if (config.autodelete !== undefined) result.autodelete = config.autodelete;

  return result;
}

/**
 * Convert Typesense API key to our ApiKeyConfig format
 */
function fromTypesenseApiKey(apiKey: {
  id: number;
  description: string;
  actions: string[];
  collections: string[];
  expires_at?: number;
}): StoredApiKey {
  const config: StoredApiKey = {
    id: apiKey.id,
    description: apiKey.description,
    actions: apiKey.actions,
    collections: apiKey.collections,
  };

  if (apiKey.expires_at !== undefined) config.expires_at = apiKey.expires_at;

  return config;
}

/**
 * Get an API key by description from Typesense
 * We use description as the identifier since we don't know IDs upfront
 */
export async function getApiKey(description: string): Promise<StoredApiKey | null> {
  const client = getClient();

  try {
    const response = await client.keys().retrieve();
    const key = response.keys.find((k) => k.description === description);
    if (!key || !key.description) return null;
    return fromTypesenseApiKey({
      id: key.id,
      description: key.description,
      actions: key.actions,
      collections: key.collections,
      expires_at: key.expires_at,
    });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "httpStatus" in error &&
      error.httpStatus === 404
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * Get an API key by ID from Typesense
 */
export async function getApiKeyById(id: number): Promise<StoredApiKey | null> {
  const client = getClient();

  try {
    const key = await client.keys(id).retrieve();
    return fromTypesenseApiKey(key as {
      id: number;
      description: string;
      actions: string[];
      collections: string[];
      expires_at?: number;
      autodelete?: boolean;
    });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "httpStatus" in error &&
      error.httpStatus === 404
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * List all API keys from Typesense
 */
export async function listApiKeys(): Promise<StoredApiKey[]> {
  const client = getClient();

  const response = await client.keys().retrieve();
  return response.keys
    .filter((key) => key.description) // Only include keys with descriptions
    .map((key) =>
      fromTypesenseApiKey({
        id: key.id,
        description: key.description!,
        actions: key.actions,
        collections: key.collections,
        expires_at: key.expires_at,
      })
    );
}

/**
 * Create an API key in Typesense
 * Returns the created key with its ID and value (value is only shown once!)
 */
export async function createApiKey(config: ApiKeyConfig): Promise<{
  id: number;
  value: string;
}> {
  const client = getClient();
  const result = await client.keys().create(toTypesenseApiKey(config));
  if (!result.value) {
    throw new Error("API key creation did not return a value");
  }
  return {
    id: result.id,
    value: result.value,
  };
}

/**
 * Delete an API key from Typesense by ID
 */
export async function deleteApiKey(id: number): Promise<void> {
  const client = getClient();
  await client.keys(id).delete();
}

/**
 * Delete an API key by description
 * Finds the key by description first, then deletes it
 */
export async function deleteApiKeyByDescription(description: string): Promise<void> {
  const key = await getApiKey(description);
  if (key) {
    await deleteApiKey(key.id);
  }
}

/**
 * Compare two API key configs for equality
 * Used to determine if an update is needed
 */
export function apiKeyConfigsEqual(a: ApiKeyConfig, b: ApiKeyConfig): boolean {
  // Compare actions and collections as sets
  const actionsEqual =
    a.actions.length === b.actions.length &&
    a.actions.every((action) => b.actions.includes(action));

  const collectionsEqual =
    a.collections.length === b.collections.length &&
    a.collections.every((collection) => b.collections.includes(collection));

  return (
    actionsEqual &&
    collectionsEqual &&
    a.expires_at === b.expires_at &&
    a.autodelete === b.autodelete
  );
}
