import { getClient } from "../client/index.js";
import type { AliasConfig } from "../types/index.js";

/**
 * Get an alias from Typesense
 */
export async function getAlias(name: string): Promise<AliasConfig | null> {
  const client = getClient();

  try {
    const alias = await client.aliases(name).retrieve();
    return {
      name: alias.name,
      collection: alias.collection_name,
    };
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
 * List all aliases from Typesense
 */
export async function listAliases(): Promise<AliasConfig[]> {
  const client = getClient();
  const response = await client.aliases().retrieve();

  return response.aliases.map((alias: { name: string; collection_name: string }) => ({
    name: alias.name,
    collection: alias.collection_name,
  }));
}

/**
 * Create or update an alias in Typesense
 * Aliases are upserted in Typesense
 */
export async function upsertAlias(config: AliasConfig): Promise<void> {
  const client = getClient();
  await client.aliases().upsert(config.name, {
    collection_name: config.collection,
  });
}

/**
 * Delete an alias from Typesense
 */
export async function deleteAlias(name: string): Promise<void> {
  const client = getClient();
  await client.aliases(name).delete();
}
