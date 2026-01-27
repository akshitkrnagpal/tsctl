import chalk from "chalk";
import ora from "ora";
import {
  getCollection,
  createCollection,
  deleteCollection,
  listCollections,
} from "../resources/collection.js";
import { upsertAlias, getAlias } from "../resources/alias.js";
import type { CollectionConfig, AliasConfig } from "../types/index.js";

export interface MigrationPlan {
  alias: string;
  currentCollection: string | null;
  newCollection: string;
  newCollectionConfig: CollectionConfig;
  steps: MigrationStep[];
}

export interface MigrationStep {
  action: "create_collection" | "switch_alias" | "delete_old_collection";
  description: string;
  target: string;
}

export interface MigrationResult {
  success: boolean;
  newCollectionName: string;
  oldCollectionName: string | null;
  aliasName: string;
  errors: string[];
}

/**
 * Generate a versioned collection name
 */
export function generateVersionedName(baseName: string): string {
  const timestamp = Date.now();
  return `${baseName}_${timestamp}`;
}

/**
 * Extract the base name from a versioned collection name
 */
export function extractBaseName(name: string): string {
  // Try to extract base name by removing _<timestamp> suffix
  const match = name.match(/^(.+)_\d{13}$/);
  return match ? match[1]! : name;
}

/**
 * Find all versions of a collection by base name
 */
export async function findCollectionVersions(baseName: string): Promise<CollectionConfig[]> {
  const allCollections = await listCollections();
  return allCollections.filter(
    (c) => c.name === baseName || c.name.startsWith(`${baseName}_`)
  );
}

/**
 * Plan a blue/green migration
 */
export async function planMigration(
  aliasName: string,
  newCollectionConfig: CollectionConfig
): Promise<MigrationPlan> {
  const steps: MigrationStep[] = [];

  // Get current alias target
  const currentAlias = await getAlias(aliasName);
  const currentCollection = currentAlias?.collection || null;

  // Generate new collection name with timestamp
  const baseName = extractBaseName(newCollectionConfig.name);
  const newCollectionName = generateVersionedName(baseName);

  // Update config with versioned name
  const versionedConfig: CollectionConfig = {
    ...newCollectionConfig,
    name: newCollectionName,
  };

  // Step 1: Create new collection
  steps.push({
    action: "create_collection",
    description: `Create new collection '${newCollectionName}'`,
    target: newCollectionName,
  });

  // Step 2: Switch alias (user should index data between step 1 and 2)
  steps.push({
    action: "switch_alias",
    description: `Switch alias '${aliasName}' to '${newCollectionName}'`,
    target: aliasName,
  });

  // Step 3: Delete old collection (optional)
  if (currentCollection) {
    steps.push({
      action: "delete_old_collection",
      description: `Delete old collection '${currentCollection}'`,
      target: currentCollection,
    });
  }

  return {
    alias: aliasName,
    currentCollection,
    newCollection: newCollectionName,
    newCollectionConfig: versionedConfig,
    steps,
  };
}

/**
 * Execute a migration step
 */
export async function executeMigrationStep(
  plan: MigrationPlan,
  step: MigrationStep
): Promise<void> {
  switch (step.action) {
    case "create_collection":
      await createCollection(plan.newCollectionConfig);
      break;

    case "switch_alias":
      await upsertAlias({
        name: plan.alias,
        collection: plan.newCollection,
      });
      break;

    case "delete_old_collection":
      if (plan.currentCollection) {
        await deleteCollection(plan.currentCollection);
      }
      break;
  }
}

/**
 * Execute a full migration
 */
export async function executeMigration(
  plan: MigrationPlan,
  options: {
    skipDelete?: boolean;
    onStep?: (step: MigrationStep, index: number) => void;
  } = {}
): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: true,
    newCollectionName: plan.newCollection,
    oldCollectionName: plan.currentCollection,
    aliasName: plan.alias,
    errors: [],
  };

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]!;

    // Skip delete step if requested
    if (step.action === "delete_old_collection" && options.skipDelete) {
      continue;
    }

    if (options.onStep) {
      options.onStep(step, i);
    }

    try {
      await executeMigrationStep(plan, step);
    } catch (error) {
      result.success = false;
      result.errors.push(
        `Step ${i + 1} failed: ${error instanceof Error ? error.message : String(error)}`
      );
      break; // Stop on first error
    }
  }

  return result;
}

/**
 * Format migration plan for display
 */
export function formatMigrationPlan(plan: MigrationPlan): string {
  const lines: string[] = [];

  lines.push(chalk.bold("\nMigration Plan:\n"));

  lines.push(`  Alias:              ${chalk.cyan(plan.alias)}`);
  lines.push(
    `  Current collection: ${plan.currentCollection ? chalk.yellow(plan.currentCollection) : chalk.gray("(none)")}`
  );
  lines.push(`  New collection:     ${chalk.green(plan.newCollection)}`);

  lines.push(chalk.bold("\nSteps:\n"));

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i]!;
    const icon =
      step.action === "create_collection"
        ? chalk.green("+")
        : step.action === "switch_alias"
          ? chalk.blue("→")
          : chalk.red("-");

    lines.push(`  ${i + 1}. ${icon} ${step.description}`);
  }

  lines.push(chalk.yellow("\n⚠️  Important:"));
  lines.push(chalk.yellow("  Index your data to the new collection before switching the alias."));
  lines.push(chalk.yellow("  Use --skip-delete to keep the old collection for rollback."));

  return lines.join("\n");
}
