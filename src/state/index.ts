import { createHash } from "crypto";
import { getClient } from "../client/index.js";
import type {
  State,
  ManagedResource,
  ResourceIdentifier,
  CollectionConfig,
  AliasConfig,
  SynonymConfig,
  OverrideConfig,
  ApiKeyConfig,
} from "../types/index.js";

const STATE_COLLECTION_NAME = "_tsctl_state";
const STATE_DOC_ID = "state";

interface StateDocument {
  id: string;
  state: string; // JSON stringified State
  updated_at: number;
}

/**
 * Ensures the state collection exists in Typesense
 */
export async function ensureStateCollection(): Promise<void> {
  const client = getClient();

  try {
    await client.collections(STATE_COLLECTION_NAME).retrieve();
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "httpStatus" in error &&
      error.httpStatus === 404
    ) {
      // Collection doesn't exist, create it
      await client.collections().create({
        name: STATE_COLLECTION_NAME,
        fields: [
          { name: "state", type: "string" },
          { name: "updated_at", type: "int64" },
        ],
      });
    } else {
      throw error;
    }
  }
}

/**
 * Load the current state from Typesense
 */
export async function loadState(): Promise<State> {
  const client = getClient();

  try {
    await ensureStateCollection();

    const doc = (await client
      .collections(STATE_COLLECTION_NAME)
      .documents(STATE_DOC_ID)
      .retrieve()) as StateDocument;

    return JSON.parse(doc.state) as State;
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "httpStatus" in error &&
      error.httpStatus === 404
    ) {
      // No state exists yet
      return {
        version: "1.0",
        resources: [],
      };
    }
    throw error;
  }
}

/**
 * Save the state to Typesense
 */
export async function saveState(state: State): Promise<void> {
  const client = getClient();

  await ensureStateCollection();

  const doc: StateDocument = {
    id: STATE_DOC_ID,
    state: JSON.stringify(state),
    updated_at: Date.now(),
  };

  try {
    await client
      .collections(STATE_COLLECTION_NAME)
      .documents()
      .upsert(doc);
  } catch {
    // If upsert fails, try create
    await client
      .collections(STATE_COLLECTION_NAME)
      .documents()
      .create(doc);
  }
}

/**
 * Compute a checksum for a resource config
 */
export function computeChecksum(
  config: CollectionConfig | AliasConfig | SynonymConfig | OverrideConfig | ApiKeyConfig
): string {
  const normalized = JSON.stringify(config, Object.keys(config).sort());
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

/**
 * Create a resource identifier string for display
 */
export function formatResourceId(identifier: ResourceIdentifier): string {
  if (identifier.collection) {
    return `${identifier.type}.${identifier.collection}.${identifier.name}`;
  }
  return `${identifier.type}.${identifier.name}`;
}

/**
 * Parse a resource identifier string
 */
export function parseResourceId(id: string): ResourceIdentifier {
  const parts = id.split(".");
  if (parts.length === 3) {
    return {
      type: parts[0] as ResourceIdentifier["type"],
      collection: parts[1],
      name: parts[2]!,
    };
  }
  return {
    type: parts[0] as ResourceIdentifier["type"],
    name: parts[1]!,
  };
}

/**
 * Find a resource in state
 */
export function findResource(
  state: State,
  identifier: ResourceIdentifier
): ManagedResource | undefined {
  return state.resources.find(
    (r) =>
      r.identifier.type === identifier.type &&
      r.identifier.name === identifier.name &&
      r.identifier.collection === identifier.collection
  );
}

/**
 * Add or update a resource in state
 */
export function upsertResource(
  state: State,
  resource: ManagedResource
): State {
  const existingIndex = state.resources.findIndex(
    (r) =>
      r.identifier.type === resource.identifier.type &&
      r.identifier.name === resource.identifier.name &&
      r.identifier.collection === resource.identifier.collection
  );

  const newResources = [...state.resources];

  if (existingIndex >= 0) {
    newResources[existingIndex] = resource;
  } else {
    newResources.push(resource);
  }

  return {
    ...state,
    resources: newResources,
  };
}

/**
 * Remove a resource from state
 */
export function removeResource(
  state: State,
  identifier: ResourceIdentifier
): State {
  return {
    ...state,
    resources: state.resources.filter(
      (r) =>
        !(
          r.identifier.type === identifier.type &&
          r.identifier.name === identifier.name &&
          r.identifier.collection === identifier.collection
        )
    ),
  };
}
