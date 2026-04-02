import { diffJson } from "diff";
import chalk from "chalk";
import {
  loadState,
  computeChecksum,
  formatResourceId,
} from "../state/index.js";
import {
  getCollection,
  listCollections,
  getAlias,
  listAliases,
  getSynonym,
  listAllSynonyms,
  getSynonymSet,
  listSynonymSets,
  synonymSetConfigsEqual,
  getOverride,
  listAllOverrides,
  getCurationSet,
  listCurationSets,
  curationSetConfigsEqual,
  getAnalyticsRule,
  listAnalyticsRules,
  analyticsRuleConfigsEqual,
  getApiKey,
  listApiKeys,
  apiKeyConfigsEqual,
  getStopwordSet,
  listStopwordSets,
  stopwordSetConfigsEqual,
  getPreset,
  listPresets,
  presetConfigsEqual,
  getStemmingDictionary,
  listStemmingDictionaries,
  stemmingDictionaryConfigsEqual,
  type StoredApiKey,
} from "../resources/index.js";
import type {
  TypesenseConfig,
  Plan,
  ResourceChange,
  ResourceIdentifier,
  CollectionConfig,
  AliasConfig,
  SynonymConfig,
  SynonymSetConfig,
  OverrideConfig,
  CurationSetConfig,
  AnalyticsRuleConfig,
  ApiKeyConfig,
  StopwordSetConfig,
  PresetConfig,
  StemmingDictionaryConfig,
  ManagedResource,
  State,
} from "../types/index.js";

// Re-export for convenience
export { formatResourceId } from "../state/index.js";

/**
 * Normalize a config object for comparison
 * Removes undefined values and sorts keys
 */
function normalizeConfig<T extends object>(config: T): T {
  const sorted = Object.keys(config)
    .sort()
    .reduce((acc, key) => {
      const value = config[key as keyof T];
      if (value !== undefined) {
        if (Array.isArray(value)) {
          acc[key as keyof T] = value.map((item) =>
            typeof item === "object" && item !== null
              ? normalizeConfig(item)
              : item
          ) as T[keyof T];
        } else if (typeof value === "object" && value !== null) {
          acc[key as keyof T] = normalizeConfig(value as object) as T[keyof T];
        } else {
          acc[key as keyof T] = value;
        }
      }
      return acc;
    }, {} as T);
  return sorted;
}

/**
 * Compare two configs and check if they are equal
 */
function configsEqual(a: unknown, b: unknown): boolean {
  const normalizedA = normalizeConfig(a as object);
  const normalizedB = normalizeConfig(b as object);
  return JSON.stringify(normalizedA) === JSON.stringify(normalizedB);
}

/**
 * Check if a string value appears to be masked (contains consecutive asterisks)
 * Typesense masks sensitive fields like api_key with patterns like "sk-pr****..."
 */
function isMaskedValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  // Matches patterns like "sk-pr****" - contains 3+ consecutive asterisks
  return /\*{3,}/.test(value);
}

/**
 * Find matching item in local array by name property
 */
function findMatchingLocalItem(
  remoteItem: Record<string, unknown>,
  localArray: unknown[]
): Record<string, unknown> | undefined {
  // Match by 'name' property (used in fields array)
  if ("name" in remoteItem) {
    return localArray.find(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "name" in item &&
        (item as Record<string, unknown>).name === remoteItem.name
    ) as Record<string, unknown> | undefined;
  }
  return undefined;
}

/**
 * Recursively normalize remote config for comparison:
 * 1. Replace masked values with corresponding local values
 * 2. Strip fields from remote that don't exist in local (computed/default fields)
 */
function normalizeRemoteForComparison<T extends object>(remote: T, local: T): T {
  const result = {} as T;

  // Only include keys that exist in local config
  for (const key of Object.keys(local) as Array<keyof T>) {
    const remoteValue = remote[key];
    const localValue = local[key];

    // Skip if remote doesn't have this key
    if (remoteValue === undefined) {
      continue;
    }

    if (isMaskedValue(remoteValue)) {
      // Remote is masked, use local value
      result[key] = localValue;
    } else if (
      typeof remoteValue === "object" &&
      remoteValue !== null &&
      typeof localValue === "object" &&
      localValue !== null &&
      !Array.isArray(remoteValue)
    ) {
      // Recursively handle nested objects
      result[key] = normalizeRemoteForComparison(
        remoteValue as object,
        localValue as object
      ) as T[keyof T];
    } else if (Array.isArray(remoteValue) && Array.isArray(localValue)) {
      // Handle arrays (like fields array) - reorder to match local order
      // and normalize each matching item
      result[key] = localValue.map((localItem) => {
        if (typeof localItem === "object" && localItem !== null) {
          const matchingRemote = findMatchingLocalItem(
            localItem as Record<string, unknown>,
            remoteValue
          );
          if (matchingRemote) {
            return normalizeRemoteForComparison(
              matchingRemote,
              localItem as Record<string, unknown>
            );
          }
        }
        return localItem;
      }) as T[keyof T];
    } else {
      result[key] = remoteValue;
    }
  }

  return result;
}

/**
 * Generate a human-readable diff between two configs
 * Only shows added and removed lines, not unchanged context
 */
function generateDiff(before: unknown, after: unknown): string {
  const normalizedBefore = normalizeConfig((before || {}) as object);
  const normalizedAfter = normalizeConfig((after || {}) as object);

  const changes = diffJson(normalizedBefore, normalizedAfter);

  let result = "";
  for (const part of changes) {
    // Skip unchanged lines to keep diff concise
    if (!part.added && !part.removed) {
      continue;
    }

    const color = part.added ? chalk.green : chalk.red;
    const prefix = part.added ? "+ " : "- ";

    const lines = part.value.split("\n").filter((line) => line.trim());
    for (const line of lines) {
      result += color(`${prefix}${line}\n`);
    }
  }

  return result;
}

/**
 * Build a plan comparing desired config to actual state
 */
export async function buildPlan(config: TypesenseConfig): Promise<Plan> {
  const state = await loadState();
  const changes: ResourceChange[] = [];

  // Track what's in the desired config
  const desiredResources = new Set<string>();

  // Plan collections
  if (config.collections) {
    for (const collectionConfig of config.collections) {
      const identifier: ResourceIdentifier = {
        type: "collection",
        name: collectionConfig.name,
      };
      const resourceId = formatResourceId(identifier);
      desiredResources.add(resourceId);

      const existing = await getCollection(collectionConfig.name);

      if (!existing) {
        // Create
        changes.push({
          action: "create",
          identifier,
          after: collectionConfig,
          diff: generateDiff(null, collectionConfig),
        });
      } else {
        // Normalize remote: replace masked values and strip computed/default fields
        const existingForComparison = normalizeRemoteForComparison(existing, collectionConfig);

        if (!configsEqual(existingForComparison, collectionConfig)) {
          // Update
          changes.push({
            action: "update",
            identifier,
            before: existing,
            after: collectionConfig,
            diff: generateDiff(existingForComparison, collectionConfig),
          });
        } else {
          // No change
          changes.push({
            action: "no-change",
            identifier,
            before: existing,
            after: collectionConfig,
          });
        }
      }
    }
  }

  // Plan aliases
  if (config.aliases) {
    for (const aliasConfig of config.aliases) {
      const identifier: ResourceIdentifier = {
        type: "alias",
        name: aliasConfig.name,
      };
      const resourceId = formatResourceId(identifier);
      desiredResources.add(resourceId);

      const existing = await getAlias(aliasConfig.name);

      if (!existing) {
        // Create
        changes.push({
          action: "create",
          identifier,
          after: aliasConfig,
          diff: generateDiff(null, aliasConfig),
        });
      } else if (!configsEqual(existing, aliasConfig)) {
        // Update
        changes.push({
          action: "update",
          identifier,
          before: existing,
          after: aliasConfig,
          diff: generateDiff(existing, aliasConfig),
        });
      } else {
        // No change
        changes.push({
          action: "no-change",
          identifier,
          before: existing,
          after: aliasConfig,
        });
      }
    }
  }

  // Plan synonyms
  if (config.synonyms) {
    for (const synonymConfig of config.synonyms) {
      const identifier: ResourceIdentifier = {
        type: "synonym",
        name: synonymConfig.id,
        collection: synonymConfig.collection,
      };
      const resourceId = formatResourceId(identifier);
      desiredResources.add(resourceId);

      const existing = await getSynonym(synonymConfig.id, synonymConfig.collection);

      if (!existing) {
        // Create
        changes.push({
          action: "create",
          identifier,
          after: synonymConfig,
          diff: generateDiff(null, synonymConfig),
        });
      } else if (!configsEqual(existing, synonymConfig)) {
        // Update
        changes.push({
          action: "update",
          identifier,
          before: existing,
          after: synonymConfig,
          diff: generateDiff(existing, synonymConfig),
        });
      } else {
        // No change
        changes.push({
          action: "no-change",
          identifier,
          before: existing,
          after: synonymConfig,
        });
      }
    }
  }

  // Plan synonym sets (Typesense 30.0+)
  if (config.synonymSets) {
    for (const synonymSetConfig of config.synonymSets) {
      const identifier: ResourceIdentifier = {
        type: "synonymSet",
        name: synonymSetConfig.name,
      };
      const resourceId = formatResourceId(identifier);
      desiredResources.add(resourceId);

      const existing = await getSynonymSet(synonymSetConfig.name);

      if (!existing) {
        // Create
        changes.push({
          action: "create",
          identifier,
          after: synonymSetConfig,
          diff: generateDiff(null, synonymSetConfig),
        });
      } else if (!synonymSetConfigsEqual(existing, synonymSetConfig)) {
        // Update
        changes.push({
          action: "update",
          identifier,
          before: existing,
          after: synonymSetConfig,
          diff: generateDiff(existing, synonymSetConfig),
        });
      } else {
        // No change
        changes.push({
          action: "no-change",
          identifier,
          before: existing,
          after: synonymSetConfig,
        });
      }
    }
  }

  // Plan overrides
  if (config.overrides) {
    for (const overrideConfig of config.overrides) {
      const identifier: ResourceIdentifier = {
        type: "override",
        name: overrideConfig.id,
        collection: overrideConfig.collection,
      };
      const resourceId = formatResourceId(identifier);
      desiredResources.add(resourceId);

      const existing = await getOverride(overrideConfig.id, overrideConfig.collection);

      if (!existing) {
        // Create
        changes.push({
          action: "create",
          identifier,
          after: overrideConfig,
          diff: generateDiff(null, overrideConfig),
        });
      } else if (!configsEqual(existing, overrideConfig)) {
        // Update
        changes.push({
          action: "update",
          identifier,
          before: existing,
          after: overrideConfig,
          diff: generateDiff(existing, overrideConfig),
        });
      } else {
        // No change
        changes.push({
          action: "no-change",
          identifier,
          before: existing,
          after: overrideConfig,
        });
      }
    }
  }

  // Plan analytics rules
  if (config.analyticsRules) {
    for (const analyticsRuleConfig of config.analyticsRules) {
      const identifier: ResourceIdentifier = {
        type: "analyticsRule",
        name: analyticsRuleConfig.name,
      };
      const resourceId = formatResourceId(identifier);
      desiredResources.add(resourceId);

      const existing = await getAnalyticsRule(analyticsRuleConfig.name);

      if (!existing) {
        // Create
        changes.push({
          action: "create",
          identifier,
          after: analyticsRuleConfig,
          diff: generateDiff(null, analyticsRuleConfig),
        });
      } else if (!analyticsRuleConfigsEqual(existing, analyticsRuleConfig)) {
        // Update
        changes.push({
          action: "update",
          identifier,
          before: existing,
          after: analyticsRuleConfig,
          diff: generateDiff(existing, analyticsRuleConfig),
        });
      } else {
        // No change
        changes.push({
          action: "no-change",
          identifier,
          before: existing,
          after: analyticsRuleConfig,
        });
      }
    }
  }

  // Plan API keys (using description as identifier)
  if (config.apiKeys) {
    for (const apiKeyConfig of config.apiKeys) {
      const identifier: ResourceIdentifier = {
        type: "apiKey",
        name: apiKeyConfig.description,
      };
      const resourceId = formatResourceId(identifier);
      desiredResources.add(resourceId);

      const existing = await getApiKey(apiKeyConfig.description);

      if (!existing) {
        // Create
        changes.push({
          action: "create",
          identifier,
          after: apiKeyConfig,
          diff: generateDiff(null, apiKeyConfig),
        });
      } else if (!apiKeyConfigsEqual(existing, apiKeyConfig)) {
        // Update (requires delete + create since API keys can't be updated)
        changes.push({
          action: "update",
          identifier,
          before: existing,
          after: apiKeyConfig,
          diff: generateDiff(existing, apiKeyConfig),
        });
      } else {
        // No change
        changes.push({
          action: "no-change",
          identifier,
          before: existing,
          after: apiKeyConfig,
        });
      }
    }
  }

  // Plan curation sets (Typesense 30.0+)
  if (config.curationSets) {
    for (const curationSetConfig of config.curationSets) {
      const identifier: ResourceIdentifier = {
        type: "curationSet",
        name: curationSetConfig.name,
      };
      const resourceId = formatResourceId(identifier);
      desiredResources.add(resourceId);

      const existing = await getCurationSet(curationSetConfig.name);

      if (!existing) {
        changes.push({
          action: "create",
          identifier,
          after: curationSetConfig,
          diff: generateDiff(null, curationSetConfig),
        });
      } else if (!curationSetConfigsEqual(existing, curationSetConfig)) {
        changes.push({
          action: "update",
          identifier,
          before: existing,
          after: curationSetConfig,
          diff: generateDiff(existing, curationSetConfig),
        });
      } else {
        changes.push({
          action: "no-change",
          identifier,
          before: existing,
          after: curationSetConfig,
        });
      }
    }
  }

  // Plan stopwords
  if (config.stopwords) {
    for (const stopwordConfig of config.stopwords) {
      const identifier: ResourceIdentifier = {
        type: "stopword",
        name: stopwordConfig.id,
      };
      const resourceId = formatResourceId(identifier);
      desiredResources.add(resourceId);

      const existing = await getStopwordSet(stopwordConfig.id);

      if (!existing) {
        changes.push({
          action: "create",
          identifier,
          after: stopwordConfig,
          diff: generateDiff(null, stopwordConfig),
        });
      } else if (!stopwordSetConfigsEqual(existing, stopwordConfig)) {
        changes.push({
          action: "update",
          identifier,
          before: existing,
          after: stopwordConfig,
          diff: generateDiff(existing, stopwordConfig),
        });
      } else {
        changes.push({
          action: "no-change",
          identifier,
          before: existing,
          after: stopwordConfig,
        });
      }
    }
  }

  // Plan presets
  if (config.presets) {
    for (const presetConfig of config.presets) {
      const identifier: ResourceIdentifier = {
        type: "preset",
        name: presetConfig.name,
      };
      const resourceId = formatResourceId(identifier);
      desiredResources.add(resourceId);

      const existing = await getPreset(presetConfig.name);

      if (!existing) {
        changes.push({
          action: "create",
          identifier,
          after: presetConfig,
          diff: generateDiff(null, presetConfig),
        });
      } else if (!presetConfigsEqual(existing, presetConfig)) {
        changes.push({
          action: "update",
          identifier,
          before: existing,
          after: presetConfig,
          diff: generateDiff(existing, presetConfig),
        });
      } else {
        changes.push({
          action: "no-change",
          identifier,
          before: existing,
          after: presetConfig,
        });
      }
    }
  }

  // Plan stemming dictionaries
  if (config.stemmingDictionaries) {
    for (const stemmingConfig of config.stemmingDictionaries) {
      const identifier: ResourceIdentifier = {
        type: "stemmingDictionary",
        name: stemmingConfig.id,
      };
      const resourceId = formatResourceId(identifier);
      desiredResources.add(resourceId);

      const existing = await getStemmingDictionary(stemmingConfig.id);

      if (!existing) {
        changes.push({
          action: "create",
          identifier,
          after: stemmingConfig,
          diff: generateDiff(null, stemmingConfig),
        });
      } else if (!stemmingDictionaryConfigsEqual(existing, stemmingConfig)) {
        changes.push({
          action: "update",
          identifier,
          before: existing,
          after: stemmingConfig,
          diff: generateDiff(existing, stemmingConfig),
        });
      } else {
        changes.push({
          action: "no-change",
          identifier,
          before: existing,
          after: stemmingConfig,
        });
      }
    }
  }

  // Find resources to delete (in state but not in config)
  for (const resource of state.resources) {
    const resourceId = formatResourceId(resource.identifier);
    if (!desiredResources.has(resourceId)) {
      changes.push({
        action: "delete",
        identifier: resource.identifier,
        before: resource.config,
        diff: generateDiff(resource.config, null),
      });
    }
  }

  // Calculate summary
  const summary = {
    create: changes.filter((c) => c.action === "create").length,
    update: changes.filter((c) => c.action === "update").length,
    delete: changes.filter((c) => c.action === "delete").length,
    noChange: changes.filter((c) => c.action === "no-change").length,
  };

  return {
    changes,
    hasChanges: summary.create + summary.update + summary.delete > 0,
    summary,
  };
}

/**
 * Format a plan for display
 */
export function formatPlan(plan: Plan): string {
  const lines: string[] = [];

  lines.push(chalk.bold("\nTypesense Plan:\n"));

  // Group changes by action
  const creates = plan.changes.filter((c) => c.action === "create");
  const updates = plan.changes.filter((c) => c.action === "update");
  const deletes = plan.changes.filter((c) => c.action === "delete");
  const noChanges = plan.changes.filter((c) => c.action === "no-change");

  for (const change of creates) {
    lines.push(
      chalk.green(`  + ${formatResourceId(change.identifier)} (create)`)
    );
    if (change.diff) {
      lines.push(
        change.diff
          .split("\n")
          .map((l) => `      ${l}`)
          .join("\n")
      );
    }
    lines.push("");
  }

  for (const change of updates) {
    lines.push(
      chalk.yellow(`  ~ ${formatResourceId(change.identifier)} (update)`)
    );
    if (change.diff) {
      lines.push(
        change.diff
          .split("\n")
          .map((l) => `      ${l}`)
          .join("\n")
      );
    }
    lines.push("");
  }

  for (const change of deletes) {
    lines.push(
      chalk.red(`  - ${formatResourceId(change.identifier)} (delete)`)
    );
    if (change.diff) {
      lines.push(
        change.diff
          .split("\n")
          .map((l) => `      ${l}`)
          .join("\n")
      );
    }
    lines.push("");
  }

  for (const change of noChanges) {
    lines.push(
      chalk.gray(`    ${formatResourceId(change.identifier)} (no changes)`)
    );
  }

  lines.push(chalk.bold("\nSummary:"));
  lines.push(
    `  ${chalk.green(`${plan.summary.create} to create`)}, ` +
      `${chalk.yellow(`${plan.summary.update} to update`)}, ` +
      `${chalk.red(`${plan.summary.delete} to delete`)}, ` +
      `${chalk.gray(`${plan.summary.noChange} unchanged`)}`
  );

  if (!plan.hasChanges) {
    lines.push(chalk.green("\nNo changes needed. Infrastructure is up-to-date."));
  }

  return lines.join("\n");
}

/**
 * Build the new state after applying a plan
 */
export function buildNewState(
  currentState: State,
  config: TypesenseConfig
): State {
  const resources: ManagedResource[] = [];
  const now = new Date().toISOString();

  // Add collections
  if (config.collections) {
    for (const collectionConfig of config.collections) {
      resources.push({
        identifier: { type: "collection", name: collectionConfig.name },
        config: collectionConfig,
        checksum: computeChecksum(collectionConfig),
        lastUpdated: now,
      });
    }
  }

  // Add aliases
  if (config.aliases) {
    for (const aliasConfig of config.aliases) {
      resources.push({
        identifier: { type: "alias", name: aliasConfig.name },
        config: aliasConfig,
        checksum: computeChecksum(aliasConfig),
        lastUpdated: now,
      });
    }
  }

  // Add synonyms
  if (config.synonyms) {
    for (const synonymConfig of config.synonyms) {
      resources.push({
        identifier: {
          type: "synonym",
          name: synonymConfig.id,
          collection: synonymConfig.collection,
        },
        config: synonymConfig,
        checksum: computeChecksum(synonymConfig),
        lastUpdated: now,
      });
    }
  }

  // Add synonym sets (Typesense 30.0+)
  if (config.synonymSets) {
    for (const synonymSetConfig of config.synonymSets) {
      resources.push({
        identifier: {
          type: "synonymSet",
          name: synonymSetConfig.name,
        },
        config: synonymSetConfig,
        checksum: computeChecksum(synonymSetConfig),
        lastUpdated: now,
      });
    }
  }

  // Add overrides
  if (config.overrides) {
    for (const overrideConfig of config.overrides) {
      resources.push({
        identifier: {
          type: "override",
          name: overrideConfig.id,
          collection: overrideConfig.collection,
        },
        config: overrideConfig,
        checksum: computeChecksum(overrideConfig),
        lastUpdated: now,
      });
    }
  }

  // Add analytics rules
  if (config.analyticsRules) {
    for (const analyticsRuleConfig of config.analyticsRules) {
      resources.push({
        identifier: {
          type: "analyticsRule",
          name: analyticsRuleConfig.name,
        },
        config: analyticsRuleConfig,
        checksum: computeChecksum(analyticsRuleConfig),
        lastUpdated: now,
      });
    }
  }

  // Add API keys
  if (config.apiKeys) {
    for (const apiKeyConfig of config.apiKeys) {
      resources.push({
        identifier: {
          type: "apiKey",
          name: apiKeyConfig.description,
        },
        config: apiKeyConfig,
        checksum: computeChecksum(apiKeyConfig),
        lastUpdated: now,
      });
    }
  }

  // Add curation sets
  if (config.curationSets) {
    for (const curationSetConfig of config.curationSets) {
      resources.push({
        identifier: {
          type: "curationSet",
          name: curationSetConfig.name,
        },
        config: curationSetConfig,
        checksum: computeChecksum(curationSetConfig),
        lastUpdated: now,
      });
    }
  }

  // Add stopwords
  if (config.stopwords) {
    for (const stopwordConfig of config.stopwords) {
      resources.push({
        identifier: {
          type: "stopword",
          name: stopwordConfig.id,
        },
        config: stopwordConfig,
        checksum: computeChecksum(stopwordConfig),
        lastUpdated: now,
      });
    }
  }

  // Add presets
  if (config.presets) {
    for (const presetConfig of config.presets) {
      resources.push({
        identifier: {
          type: "preset",
          name: presetConfig.name,
        },
        config: presetConfig,
        checksum: computeChecksum(presetConfig),
        lastUpdated: now,
      });
    }
  }

  // Add stemming dictionaries
  if (config.stemmingDictionaries) {
    for (const stemmingConfig of config.stemmingDictionaries) {
      resources.push({
        identifier: {
          type: "stemmingDictionary",
          name: stemmingConfig.id,
        },
        config: stemmingConfig,
        checksum: computeChecksum(stemmingConfig),
        lastUpdated: now,
      });
    }
  }

  return {
    version: currentState.version,
    resources,
  };
}

/**
 * Import existing Typesense resources into state
 */
export async function importResources(): Promise<{
  collections: CollectionConfig[];
  aliases: AliasConfig[];
  synonyms: SynonymConfig[];
  synonymSets: SynonymSetConfig[];
  overrides: OverrideConfig[];
  curationSets: CurationSetConfig[];
  analyticsRules: AnalyticsRuleConfig[];
  apiKeys: ApiKeyConfig[];
  stopwords: StopwordSetConfig[];
  presets: PresetConfig[];
  stemmingDictionaries: StemmingDictionaryConfig[];
}> {
  const collections = await listCollections();
  const aliases = await listAliases();

  // Get synonyms and overrides from all collections
  const collectionNames = collections.map((c) => c.name);
  const synonyms = await listAllSynonyms(collectionNames);
  const synonymSets = await listSynonymSets();
  const overrides = await listAllOverrides(collectionNames);
  const curationSets = await listCurationSets();
  const analyticsRules = await listAnalyticsRules();
  const stopwords = await listStopwordSets();
  const presets = await listPresets();
  const stemmingDictionaries = await listStemmingDictionaries();

  // Get API keys (note: actual key values are not retrievable after creation)
  // Only include non-default values to keep config minimal
  const storedApiKeys = await listApiKeys();
  const apiKeys: ApiKeyConfig[] = storedApiKeys.map((key) => {
    const config: ApiKeyConfig = {
      description: key.description,
      actions: key.actions,
      collections: key.collections,
    };
    // Only include expires_at if set
    if (key.expires_at !== undefined) config.expires_at = key.expires_at;
    // autodelete defaults to false, only include if true
    if (key.autodelete === true) config.autodelete = true;
    return config;
  });

  return { collections, aliases, synonyms, synonymSets, overrides, curationSets, analyticsRules, apiKeys, stopwords, presets, stemmingDictionaries };
}

// ============================================================================
// Drift Detection
// ============================================================================

export interface DriftItem {
  identifier: ResourceIdentifier;
  type: "modified" | "deleted" | "unmanaged";
  stateConfig?: unknown;
  actualConfig?: unknown;
  diff?: string;
}

export interface DriftReport {
  items: DriftItem[];
  hasDrift: boolean;
  summary: {
    modified: number;
    deleted: number;
    unmanaged: number;
  };
}

/**
 * Normalize a config object for comparison (same as in buildPlan)
 */
function normalizeForComparison<T extends object>(config: T): T {
  const sorted = Object.keys(config)
    .sort()
    .reduce((acc, key) => {
      const value = config[key as keyof T];
      if (value !== undefined) {
        if (Array.isArray(value)) {
          acc[key as keyof T] = value.map((item) =>
            typeof item === "object" && item !== null
              ? normalizeForComparison(item)
              : item
          ) as T[keyof T];
        } else if (typeof value === "object" && value !== null) {
          acc[key as keyof T] = normalizeForComparison(value as object) as T[keyof T];
        } else {
          acc[key as keyof T] = value;
        }
      }
      return acc;
    }, {} as T);
  return sorted;
}

/**
 * Generate a diff between two configs for drift display
 * Only shows added and removed lines, not unchanged context
 */
function generateDriftDiff(stateConfig: unknown, actualConfig: unknown): string {
  const normalizedState = normalizeForComparison((stateConfig || {}) as object);
  const normalizedActual = normalizeForComparison((actualConfig || {}) as object);

  const changes = diffJson(normalizedState, normalizedActual);

  let result = "";
  for (const part of changes) {
    // Skip unchanged lines to keep diff concise
    if (!part.added && !part.removed) {
      continue;
    }

    const color = part.added ? chalk.green : chalk.red;
    const prefix = part.added ? "+ " : "- ";

    const lines = part.value.split("\n").filter((line) => line.trim());
    for (const line of lines) {
      result += color(`${prefix}${line}\n`);
    }
  }

  return result;
}

/**
 * Detect drift between state and actual Typesense resources
 * Drift occurs when resources are modified outside of tsctl
 */
export async function detectDrift(): Promise<DriftReport> {
  const state = await loadState();
  const items: DriftItem[] = [];

  // Check each resource in state against actual Typesense state
  for (const resource of state.resources) {
    const { identifier, config: stateConfig } = resource;
    let actualConfig: unknown = null;

    try {
      switch (identifier.type) {
        case "collection":
          actualConfig = await getCollection(identifier.name);
          break;
        case "alias":
          actualConfig = await getAlias(identifier.name);
          break;
        case "synonym":
          actualConfig = await getSynonym(identifier.name, identifier.collection!);
          break;
        case "override":
          actualConfig = await getOverride(identifier.name, identifier.collection!);
          break;
        case "apiKey":
          actualConfig = await getApiKey(identifier.name);
          break;
        case "curationSet":
          actualConfig = await getCurationSet(identifier.name);
          break;
        case "stopword":
          actualConfig = await getStopwordSet(identifier.name);
          break;
        case "preset":
          actualConfig = await getPreset(identifier.name);
          break;
        case "stemmingDictionary":
          actualConfig = await getStemmingDictionary(identifier.name);
          break;
      }
    } catch {
      // Resource doesn't exist or error fetching
      actualConfig = null;
    }

    if (actualConfig === null) {
      // Resource was deleted outside of tsctl
      items.push({
        identifier,
        type: "deleted",
        stateConfig,
        diff: generateDriftDiff(stateConfig, null),
      });
    } else {
      // For collections, normalize remote: replace masked values and strip computed fields
      let actualForComparison = actualConfig;
      if (identifier.type === "collection") {
        actualForComparison = normalizeRemoteForComparison(
          actualConfig as object,
          stateConfig as object
        );
      }

      // Check if resource was modified
      const normalizedState = normalizeForComparison(stateConfig as object);
      const normalizedActual = normalizeForComparison(actualForComparison as object);

      if (JSON.stringify(normalizedState) !== JSON.stringify(normalizedActual)) {
        items.push({
          identifier,
          type: "modified",
          stateConfig,
          actualConfig: actualForComparison,
          diff: generateDriftDiff(stateConfig, actualForComparison),
        });
      }
    }
  }

  // Check for unmanaged resources (exist in Typesense but not in state)
  const managedCollections = new Set(
    state.resources
      .filter((r) => r.identifier.type === "collection")
      .map((r) => r.identifier.name)
  );
  const managedAliases = new Set(
    state.resources
      .filter((r) => r.identifier.type === "alias")
      .map((r) => r.identifier.name)
  );

  // Check for unmanaged collections
  const allCollections = await listCollections();
  for (const collection of allCollections) {
    if (!managedCollections.has(collection.name) && !collection.name.startsWith("_tsctl")) {
      items.push({
        identifier: { type: "collection", name: collection.name },
        type: "unmanaged",
        actualConfig: collection,
      });
    }
  }

  // Check for unmanaged aliases
  const allAliases = await listAliases();
  for (const alias of allAliases) {
    if (!managedAliases.has(alias.name)) {
      items.push({
        identifier: { type: "alias", name: alias.name },
        type: "unmanaged",
        actualConfig: alias,
      });
    }
  }

  const summary = {
    modified: items.filter((i) => i.type === "modified").length,
    deleted: items.filter((i) => i.type === "deleted").length,
    unmanaged: items.filter((i) => i.type === "unmanaged").length,
  };

  return {
    items,
    hasDrift: items.length > 0,
    summary,
  };
}

/**
 * Format a drift report for display
 */
export function formatDriftReport(report: DriftReport): string {
  const lines: string[] = [];

  lines.push(chalk.bold("\nDrift Detection Report:\n"));

  if (!report.hasDrift) {
    lines.push(chalk.green("  No drift detected. State matches Typesense."));
    return lines.join("\n");
  }

  // Modified resources
  const modified = report.items.filter((i) => i.type === "modified");
  if (modified.length > 0) {
    lines.push(chalk.yellow.bold("  Modified outside of tsctl:"));
    for (const item of modified) {
      lines.push(chalk.yellow(`    ~ ${formatResourceId(item.identifier)}`));
      if (item.diff) {
        lines.push(
          item.diff
            .split("\n")
            .map((l) => `        ${l}`)
            .join("\n")
        );
      }
    }
    lines.push("");
  }

  // Deleted resources
  const deleted = report.items.filter((i) => i.type === "deleted");
  if (deleted.length > 0) {
    lines.push(chalk.red.bold("  Deleted outside of tsctl:"));
    for (const item of deleted) {
      lines.push(chalk.red(`    - ${formatResourceId(item.identifier)}`));
    }
    lines.push("");
  }

  // Unmanaged resources
  const unmanaged = report.items.filter((i) => i.type === "unmanaged");
  if (unmanaged.length > 0) {
    lines.push(chalk.cyan.bold("  Unmanaged resources (not in config):"));
    for (const item of unmanaged) {
      lines.push(chalk.cyan(`    ? ${formatResourceId(item.identifier)}`));
    }
    lines.push("");
  }

  // Summary
  lines.push(chalk.bold("Summary:"));
  lines.push(
    `  ${chalk.yellow(`${report.summary.modified} modified`)}, ` +
      `${chalk.red(`${report.summary.deleted} deleted`)}, ` +
      `${chalk.cyan(`${report.summary.unmanaged} unmanaged`)}`
  );

  lines.push(chalk.gray("\n  Run 'tsctl apply' to reconcile state with config."));
  lines.push(chalk.gray("  Run 'tsctl import' to add unmanaged resources to config."));

  return lines.join("\n");
}
