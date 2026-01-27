import chalk from "chalk";
import ora from "ora";
import { loadState, saveState, formatResourceId } from "../state/index.js";
import {
  createCollection,
  updateCollection,
  deleteCollection,
  getCollection,
} from "../resources/collection.js";
import { upsertAlias, deleteAlias } from "../resources/alias.js";
import { upsertSynonym, deleteSynonym } from "../resources/synonym.js";
import {
  createSynonymSet,
  updateSynonymSet,
  deleteSynonymSet,
  getSynonymSet,
} from "../resources/synonymset.js";
import { upsertOverride, deleteOverride } from "../resources/override.js";
import {
  createAnalyticsRule,
  updateAnalyticsRule,
  deleteAnalyticsRule,
} from "../resources/analyticsrule.js";
import {
  createApiKey,
  deleteApiKeyByDescription,
  getApiKey,
} from "../resources/apikey.js";
import { buildNewState } from "../plan/index.js";
import type {
  Plan,
  ResourceChange,
  TypesenseConfig,
  CollectionConfig,
  AliasConfig,
  SynonymConfig,
  SynonymSetConfig,
  OverrideConfig,
  AnalyticsRuleConfig,
  ApiKeyConfig,
} from "../types/index.js";

export interface ApplyResult {
  success: boolean;
  applied: ResourceChange[];
  failed: Array<{ change: ResourceChange; error: Error }>;
}

/**
 * Apply a single resource change
 */
async function applyChange(change: ResourceChange): Promise<void> {
  const { action, identifier } = change;

  switch (identifier.type) {
    case "collection": {
      if (action === "create") {
        await createCollection(change.after as CollectionConfig);
      } else if (action === "update") {
        const existing = await getCollection(identifier.name);
        if (!existing) {
          throw new Error(`Collection ${identifier.name} not found for update`);
        }
        // Update handles field modifications by dropping and re-adding
        await updateCollection(change.after as CollectionConfig, existing);
      } else if (action === "delete") {
        await deleteCollection(identifier.name);
      }
      break;
    }

    case "alias": {
      if (action === "create" || action === "update") {
        await upsertAlias(change.after as AliasConfig);
      } else if (action === "delete") {
        await deleteAlias(identifier.name);
      }
      break;
    }

    case "synonym": {
      if (action === "create" || action === "update") {
        await upsertSynonym(change.after as SynonymConfig);
      } else if (action === "delete") {
        await deleteSynonym(identifier.name, identifier.collection!);
      }
      break;
    }

    case "synonymSet": {
      if (action === "create") {
        await createSynonymSet(change.after as SynonymSetConfig);
      } else if (action === "update") {
        const existing = await getSynonymSet(identifier.name);
        if (existing) {
          await updateSynonymSet(change.after as SynonymSetConfig, existing);
        }
      } else if (action === "delete") {
        await deleteSynonymSet(identifier.name);
      }
      break;
    }

    case "override": {
      if (action === "create" || action === "update") {
        await upsertOverride(change.after as OverrideConfig);
      } else if (action === "delete") {
        await deleteOverride(identifier.name, identifier.collection!);
      }
      break;
    }

    case "analyticsRule": {
      if (action === "create") {
        await createAnalyticsRule(change.after as AnalyticsRuleConfig);
      } else if (action === "update") {
        await updateAnalyticsRule(change.after as AnalyticsRuleConfig);
      } else if (action === "delete") {
        await deleteAnalyticsRule(identifier.name);
      }
      break;
    }

    case "apiKey": {
      if (action === "create") {
        const apiKeyConfig = change.after as ApiKeyConfig;
        const result = await createApiKey(apiKeyConfig);
        console.log(
          chalk.cyan(
            `\n   API Key created! Save this value (shown only once):\n   ${result.value}\n`
          )
        );
      } else if (action === "update") {
        // API keys can't be updated, so delete and recreate
        const existing = await getApiKey(identifier.name);
        if (existing) {
          await deleteApiKeyByDescription(identifier.name);
        }
        const apiKeyConfig = change.after as ApiKeyConfig;
        const result = await createApiKey(apiKeyConfig);
        console.log(
          chalk.cyan(
            `\n   API Key recreated! Save this value (shown only once):\n   ${result.value}\n`
          )
        );
      } else if (action === "delete") {
        await deleteApiKeyByDescription(identifier.name);
      }
      break;
    }

    default:
      throw new Error(`Unknown resource type: ${identifier.type}`);
  }
}

/**
 * Apply a plan to Typesense
 */
export async function applyPlan(
  plan: Plan,
  config: TypesenseConfig,
  options: {
    autoApprove?: boolean;
    forceRecreate?: boolean;
  } = {}
): Promise<ApplyResult> {
  const result: ApplyResult = {
    success: true,
    applied: [],
    failed: [],
  };

  // Filter to only changes that need to be applied
  const changesToApply = plan.changes.filter((c) => c.action !== "no-change");

  if (changesToApply.length === 0) {
    console.log(chalk.green("\nNo changes to apply."));
    return result;
  }

  // Resource type priority for ordering (lower = first)
  // SynonymSets must be created before collections that reference them
  const createOrder: Record<string, number> = {
    synonymSet: 0,
    collection: 1,
    alias: 2,
    synonym: 3,
    override: 4,
    analyticsRule: 5,
    apiKey: 6,
  };
  // For deletes, reverse the order (collections before synonym sets)
  const deleteOrder: Record<string, number> = {
    apiKey: 0,
    analyticsRule: 1,
    override: 2,
    synonym: 3,
    alias: 4,
    collection: 5,
    synonymSet: 6,
  };

  const sortByType = (a: ResourceChange, b: ResourceChange, order: Record<string, number>) => {
    return (order[a.identifier.type] ?? 99) - (order[b.identifier.type] ?? 99);
  };

  // Apply changes in order: creates first (with dependency order), then updates, then deletes
  const creates = changesToApply
    .filter((c) => c.action === "create")
    .sort((a, b) => sortByType(a, b, createOrder));
  const updates = changesToApply
    .filter((c) => c.action === "update")
    .sort((a, b) => sortByType(a, b, createOrder));
  const deletes = changesToApply
    .filter((c) => c.action === "delete")
    .sort((a, b) => sortByType(a, b, deleteOrder));

  const orderedChanges = [...creates, ...updates, ...deletes];

  console.log(chalk.bold(`\nApplying ${orderedChanges.length} changes...\n`));

  for (const change of orderedChanges) {
    const resourceId = formatResourceId(change.identifier);
    const actionSymbol =
      change.action === "create"
        ? chalk.green("+")
        : change.action === "update"
          ? chalk.yellow("~")
          : chalk.red("-");

    const spinner = ora(`${actionSymbol} ${resourceId}`).start();

    try {
      await applyChange(change);
      spinner.succeed(`${actionSymbol} ${resourceId}`);
      result.applied.push(change);
    } catch (error) {
      spinner.fail(`${actionSymbol} ${resourceId}`);
      console.error(
        chalk.red(`   Error: ${error instanceof Error ? error.message : String(error)}`)
      );
      result.failed.push({
        change,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      result.success = false;
    }
  }

  // Update state if any changes were applied
  if (result.applied.length > 0) {
    const currentState = await loadState();
    const newState = buildNewState(currentState, config);
    await saveState(newState);
    console.log(chalk.gray("\nState saved."));
  }

  // Print summary
  console.log(chalk.bold("\nApply complete:"));
  console.log(`  ${chalk.green(`${result.applied.length} applied`)}`);
  if (result.failed.length > 0) {
    console.log(`  ${chalk.red(`${result.failed.length} failed`)}`);
  }

  return result;
}
