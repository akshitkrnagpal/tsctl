#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { config as dotenvConfig } from "dotenv";
import { writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createInterface } from "readline";

import { getClientFromEnv, testConnection } from "../client/index.js";
import { loadConfig, findConfigFile } from "../config/loader.js";
import { loadState, saveState, formatResourceId } from "../state/index.js";
import { buildPlan, formatPlan, importResources, buildNewState, detectDrift, formatDriftReport } from "../plan/index.js";
import { planMigration, executeMigration, formatMigrationPlan } from "../migrate/index.js";
import { applyPlan } from "../apply/index.js";
import type { TypesenseConfig } from "../types/index.js";

/**
 * Load environment configuration based on the specified environment
 * Loads .env file first, then .env.<environment> to override
 */
function loadEnvironment(env?: string): void {
  // Always load base .env first
  dotenvConfig();

  if (env) {
    // Load environment-specific .env file
    const envFile = resolve(process.cwd(), `.env.${env}`);
    if (existsSync(envFile)) {
      dotenvConfig({ path: envFile, override: true });
      console.log(chalk.gray(`Using environment: ${env}`));
    } else {
      console.log(chalk.yellow(`Warning: Environment file .env.${env} not found, using defaults`));
    }
  }
}

const program = new Command();

program
  .name("tsctl")
  .description("Terraform-like CLI for managing Typesense infrastructure")
  .version("0.1.0")
  .option("-e, --env <environment>", "Environment to use (loads .env.<environment>)")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    loadEnvironment(opts.env);
  });

// ============================================================================
// init command
// ============================================================================

program
  .command("init")
  .description("Initialize a new tsctl project")
  .option("-f, --force", "Overwrite existing config file")
  .option("--with-environments", "Create example environment files (development, staging, production)")
  .action(async (options) => {
    console.log(chalk.bold("\nInitializing tsctl project...\n"));

    // Check for existing config
    const existingConfig = await findConfigFile();
    if (existingConfig && !options.force) {
      console.log(chalk.yellow(`Config file already exists: ${existingConfig}`));
      console.log(chalk.gray("Use --force to overwrite"));
      return;
    }

    // Create sample config file
    const configPath = resolve(process.cwd(), "tsctl.config.ts");
    const sampleConfig = `import { defineConfig } from "@tsctl/cli";

export default defineConfig({
  collections: [
    {
      name: "products",
      fields: [
        { name: "name", type: "string" },
        { name: "description", type: "string", optional: true },
        { name: "price", type: "float" },
        { name: "category", type: "string", facet: true },
        { name: "tags", type: "string[]", facet: true, optional: true },
        { name: "in_stock", type: "bool", facet: true },
        { name: "created_at", type: "int64" },
      ],
      default_sorting_field: "created_at",
    },
  ],
  aliases: [
    {
      name: "products_live",
      collection: "products",
    },
  ],
});
`;

    writeFileSync(configPath, sampleConfig);
    console.log(chalk.green(`✓ Created ${configPath}`));

    // Create .env file if it doesn't exist
    const envPath = resolve(process.cwd(), ".env");
    if (!existsSync(envPath)) {
      const envContent = `# Typesense Connection (default/development)
TYPESENSE_HOST=localhost
TYPESENSE_PORT=8108
TYPESENSE_PROTOCOL=http
TYPESENSE_API_KEY=your-api-key-here
`;
      writeFileSync(envPath, envContent);
      console.log(chalk.green(`✓ Created ${envPath}`));
      console.log(chalk.yellow("  Update TYPESENSE_API_KEY with your actual API key"));
    }

    // Create environment-specific files if requested
    if (options.withEnvironments) {
      const environments = [
        {
          name: "development",
          host: "localhost",
          port: "8108",
          protocol: "http",
        },
        {
          name: "staging",
          host: "staging.typesense.example.com",
          port: "443",
          protocol: "https",
        },
        {
          name: "production",
          host: "production.typesense.example.com",
          port: "443",
          protocol: "https",
        },
      ];

      for (const env of environments) {
        const envFilePath = resolve(process.cwd(), `.env.${env.name}`);
        if (!existsSync(envFilePath)) {
          const envFileContent = `# Typesense Connection (${env.name})
TYPESENSE_HOST=${env.host}
TYPESENSE_PORT=${env.port}
TYPESENSE_PROTOCOL=${env.protocol}
TYPESENSE_API_KEY=your-${env.name}-api-key-here
`;
          writeFileSync(envFilePath, envFileContent);
          console.log(chalk.green(`✓ Created .env.${env.name}`));
        }
      }

      console.log(chalk.gray("\n  Use --env flag to switch environments:"));
      console.log(chalk.gray("    tsctl plan --env production"));
      console.log(chalk.gray("    tsctl apply --env staging"));
    }

    // Test connection
    const spinner = ora("Testing connection...").start();
    try {
      getClientFromEnv();
      const connected = await testConnection();
      if (connected) {
        spinner.succeed("Connected to Typesense");
      } else {
        spinner.warn("Could not connect to Typesense (check your .env settings)");
      }
    } catch (error) {
      spinner.warn(`Connection test skipped: ${error instanceof Error ? error.message : String(error)}`);
    }

    console.log(chalk.bold("\n✓ Project initialized"));
    console.log(chalk.gray("\nNext steps:"));
    console.log(chalk.gray("  1. Update .env with your Typesense credentials"));
    console.log(chalk.gray("  2. Edit tsctl.config.ts to define your schema"));
    console.log(chalk.gray("  3. Run 'tsctl plan' to see what will be created"));
    console.log(chalk.gray("  4. Run 'tsctl apply' to apply changes"));
  });

// ============================================================================
// validate command
// ============================================================================

program
  .command("validate")
  .description("Validate the configuration file")
  .option("-c, --config <path>", "Path to config file")
  .action(async (options) => {
    const spinner = ora("Validating config...").start();

    try {
      const config = await loadConfig(options.config);
      spinner.succeed("Config is valid");

      // Show summary
      console.log(chalk.gray("\nResources defined:"));
      if (config.collections?.length) {
        console.log(chalk.gray(`  Collections: ${config.collections.length}`));
        for (const c of config.collections) {
          console.log(chalk.gray(`    - ${c.name} (${c.fields.length} fields)`));
        }
      }
      if (config.aliases?.length) {
        console.log(chalk.gray(`  Aliases: ${config.aliases.length}`));
        for (const a of config.aliases) {
          console.log(chalk.gray(`    - ${a.name} → ${a.collection}`));
        }
      }
      if (config.synonyms?.length) {
        console.log(chalk.gray(`  Synonyms: ${config.synonyms.length}`));
        for (const s of config.synonyms) {
          const type = s.root ? `root: ${s.root}` : `${s.synonyms?.length || 0} terms`;
          console.log(chalk.gray(`    - ${s.id} (${s.collection}) [${type}]`));
        }
      }
      if (config.overrides?.length) {
        console.log(chalk.gray(`  Overrides: ${config.overrides.length}`));
        for (const o of config.overrides) {
          const ruleDesc = o.rule.query ? `query: "${o.rule.query}"` : o.rule.filter_by ? `filter: ${o.rule.filter_by}` : "custom";
          console.log(chalk.gray(`    - ${o.id} (${o.collection}) [${ruleDesc}]`));
        }
      }
      if (config.apiKeys?.length) {
        console.log(chalk.gray(`  API Keys: ${config.apiKeys.length}`));
        for (const k of config.apiKeys) {
          const collections = k.collections.join(", ");
          console.log(chalk.gray(`    - ${k.description} [${collections}]`));
        }
      }
      if (config.synonymSets?.length) {
        console.log(chalk.gray(`  Synonym Sets: ${config.synonymSets.length}`));
        for (const s of config.synonymSets) {
          console.log(chalk.gray(`    - ${s.name} (${s.items.length} items)`));
        }
      }
      if (config.curationSets?.length) {
        console.log(chalk.gray(`  Curation Sets: ${config.curationSets.length}`));
        for (const c of config.curationSets) {
          console.log(chalk.gray(`    - ${c.name} (${c.items.length} items)`));
        }
      }
      if (config.stopwords?.length) {
        console.log(chalk.gray(`  Stopwords: ${config.stopwords.length}`));
        for (const s of config.stopwords) {
          console.log(chalk.gray(`    - ${s.id} (${s.stopwords.length} words)`));
        }
      }
      if (config.presets?.length) {
        console.log(chalk.gray(`  Presets: ${config.presets.length}`));
        for (const p of config.presets) {
          console.log(chalk.gray(`    - ${p.name}`));
        }
      }
      if (config.analyticsRules?.length) {
        console.log(chalk.gray(`  Analytics Rules: ${config.analyticsRules.length}`));
        for (const r of config.analyticsRules) {
          console.log(chalk.gray(`    - ${r.name} (${r.type})`));
        }
      }
      if (config.stemmingDictionaries?.length) {
        console.log(chalk.gray(`  Stemming Dictionaries: ${config.stemmingDictionaries.length}`));
        for (const d of config.stemmingDictionaries) {
          console.log(chalk.gray(`    - ${d.id} (${d.words.length} words)`));
        }
      }
    } catch (error) {
      spinner.fail("Config validation failed");
      console.error(chalk.red(`\n${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// ============================================================================
// plan command
// ============================================================================

program
  .command("plan")
  .description("Show what changes will be made")
  .option("-c, --config <path>", "Path to config file")
  .option("-o, --out <path>", "Save plan to file")
  .option("--json", "Output plan as JSON")
  .action(async (options) => {
    try {
      // Initialize client
      getClientFromEnv();

      // Load config
      if (!options.json) {
        var spinner = ora("Loading config...").start();
      }
      const config = await loadConfig(options.config);
      if (!options.json) spinner!.succeed("Config loaded");

      // Build plan
      if (!options.json) {
        var planSpinner = ora("Building plan...").start();
      }
      const plan = await buildPlan(config);
      if (!options.json) planSpinner!.succeed("Plan built");

      if (options.json) {
        // JSON output: strip diff (contains ANSI codes) and output clean JSON
        const cleanPlan = {
          ...plan,
          changes: plan.changes.map((c) => ({
            action: c.action,
            identifier: c.identifier,
            before: c.before,
            after: c.after,
          })),
        };
        console.log(JSON.stringify(cleanPlan, null, 2));
      } else {
        // Display plan
        console.log(formatPlan(plan));
      }

      // Save plan if requested
      if (options.out) {
        const planPath = resolve(options.out);
        writeFileSync(planPath, JSON.stringify(plan, null, 2));
        if (!options.json) {
          console.log(chalk.gray(`\nPlan saved to ${planPath}`));
        }
      }
    } catch (error) {
      if (options.json) {
        console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      } else {
        console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
      }
      process.exit(1);
    }
  });

// ============================================================================
// apply command
// ============================================================================

program
  .command("apply")
  .description("Apply changes to Typesense")
  .option("-c, --config <path>", "Path to config file")
  .option("-y, --yes", "Auto-approve changes")
  .option("--force-recreate", "Force recreation of collections with incompatible changes")
  .option("-t, --target <resources...>", "Only apply specific resources (e.g., collection.products alias.products_live)")
  .action(async (options) => {
    try {
      // Initialize client
      getClientFromEnv();

      // Load config
      const spinner = ora("Loading config...").start();
      const config = await loadConfig(options.config);
      spinner.succeed("Config loaded");

      // Build plan
      const planSpinner = ora("Building plan...").start();
      const plan = await buildPlan(config);
      planSpinner.succeed("Plan built");

      // Filter plan by target if specified
      if (options.target) {
        const targets = new Set(options.target as string[]);
        plan.changes = plan.changes.filter((c) => {
          const resourceId = formatResourceId(c.identifier);
          return targets.has(resourceId);
        });
        plan.hasChanges = plan.changes.some((c) => c.action !== "no-change");
        plan.summary = {
          create: plan.changes.filter((c) => c.action === "create").length,
          update: plan.changes.filter((c) => c.action === "update").length,
          delete: plan.changes.filter((c) => c.action === "delete").length,
          noChange: plan.changes.filter((c) => c.action === "no-change").length,
        };
      }

      // Display plan
      console.log(formatPlan(plan));

      if (!plan.hasChanges) {
        return;
      }

      // Confirm if not auto-approved
      if (!options.yes) {
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question(
            chalk.yellow("\nDo you want to apply these changes? (yes/no): "),
            resolve
          );
        });
        rl.close();

        if (answer.toLowerCase() !== "yes" && answer.toLowerCase() !== "y") {
          console.log(chalk.gray("Apply cancelled."));
          return;
        }
      }

      // Apply plan
      const result = await applyPlan(plan, config, {
        autoApprove: options.yes,
        forceRecreate: options.forceRecreate,
      });

      if (!result.success) {
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// ============================================================================
// destroy command
// ============================================================================

program
  .command("destroy")
  .description("Destroy all managed resources")
  .option("-y, --yes", "Auto-approve destruction")
  .action(async (options) => {
    try {
      // Initialize client
      getClientFromEnv();

      // Load state
      const state = await loadState();

      if (state.resources.length === 0) {
        console.log(chalk.yellow("\nNo resources to destroy."));
        return;
      }

      console.log(chalk.bold.red("\n⚠️  DESTRUCTION PLAN\n"));
      console.log(chalk.red("The following resources will be destroyed:\n"));

      for (const resource of state.resources) {
        console.log(chalk.red(`  - ${formatResourceId(resource.identifier)}`));
      }

      // Confirm
      if (!options.yes) {
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question(
            chalk.red("\nType 'destroy' to confirm: "),
            resolve
          );
        });
        rl.close();

        if (answer !== "destroy") {
          console.log(chalk.gray("Destroy cancelled."));
          return;
        }
      }

      // Build a destroy plan (empty config)
      const emptyConfig: TypesenseConfig = {};
      const plan = await buildPlan(emptyConfig);

      // Apply destruction
      await applyPlan(plan, emptyConfig, { autoApprove: true });

      console.log(chalk.green("\n✓ All managed resources destroyed."));
    } catch (error) {
      console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// ============================================================================
// import command
// ============================================================================

program
  .command("import")
  .description("Import existing Typesense resources into state")
  .option("-o, --out <path>", "Output config file path", "tsctl.imported.config.ts")
  .action(async (options) => {
    try {
      // Initialize client
      getClientFromEnv();

      const spinner = ora("Importing resources...").start();
      const { collections, aliases, synonyms, synonymSets, overrides, curationSets, analyticsRules, apiKeys, stopwords, presets, stemmingDictionaries } = await importResources();
      spinner.succeed("Resources imported");

      console.log(chalk.gray("\nFound:"));
      console.log(chalk.gray(`  Collections: ${collections.length}`));
      console.log(chalk.gray(`  Aliases: ${aliases.length}`));
      console.log(chalk.gray(`  Synonyms: ${synonyms.length}`));
      console.log(chalk.gray(`  Synonym Sets: ${synonymSets.length}`));
      console.log(chalk.gray(`  Overrides: ${overrides.length}`));
      console.log(chalk.gray(`  Curation Sets: ${curationSets.length}`));
      console.log(chalk.gray(`  Analytics Rules: ${analyticsRules.length}`));
      console.log(chalk.gray(`  API Keys: ${apiKeys.length}`));
      console.log(chalk.gray(`  Stopwords: ${stopwords.length}`));
      console.log(chalk.gray(`  Presets: ${presets.length}`));
      console.log(chalk.gray(`  Stemming Dictionaries: ${stemmingDictionaries.length}`));

      if (apiKeys.length > 0) {
        console.log(chalk.yellow("\n  Note: API key values cannot be retrieved after creation."));
        console.log(chalk.yellow("  Imported API keys will track existing keys but cannot recreate them."));
      }

      // Generate config file
      const config: TypesenseConfig = {
        collections: collections.length > 0 ? collections : undefined,
        aliases: aliases.length > 0 ? aliases : undefined,
        synonyms: synonyms.length > 0 ? synonyms : undefined,
        synonymSets: synonymSets.length > 0 ? synonymSets : undefined,
        overrides: overrides.length > 0 ? overrides : undefined,
        curationSets: curationSets.length > 0 ? curationSets : undefined,
        analyticsRules: analyticsRules.length > 0 ? analyticsRules : undefined,
        apiKeys: apiKeys.length > 0 ? apiKeys : undefined,
        stopwords: stopwords.length > 0 ? stopwords : undefined,
        presets: presets.length > 0 ? presets : undefined,
        stemmingDictionaries: stemmingDictionaries.length > 0 ? stemmingDictionaries : undefined,
      };

      const configContent = `import { defineConfig } from "@tsctl/cli";

export default defineConfig(${JSON.stringify(config, null, 2)});
`;

      const outPath = resolve(options.out);
      writeFileSync(outPath, configContent);
      console.log(chalk.green(`\n✓ Config written to ${outPath}`));

      // Save state
      const newState = buildNewState({ version: "1.0", resources: [] }, config);
      await saveState(newState);
      console.log(chalk.green("✓ State saved to Typesense"));

      console.log(chalk.gray("\nReview the generated config and rename to tsctl.config.ts"));
    } catch (error) {
      console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// ============================================================================
// drift command
// ============================================================================

program
  .command("drift")
  .description("Detect changes made outside of tsctl (drift detection)")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    try {
      // Initialize client
      getClientFromEnv();

      const spinner = ora("Detecting drift...").start();
      const report = await detectDrift();
      spinner.succeed("Drift detection complete");

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(formatDriftReport(report));
      }

      // Exit with code 1 if drift is detected (useful for CI/CD)
      if (report.hasDrift) {
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// ============================================================================
// migrate command
// ============================================================================

program
  .command("migrate")
  .description("Blue/green migration for collections (zero-downtime updates)")
  .requiredOption("-a, --alias <name>", "Alias to migrate")
  .requiredOption("-c, --config <path>", "Path to config file")
  .option("--collection <name>", "Collection name from config (if multiple)")
  .option("--skip-delete", "Keep old collection after migration (for rollback)")
  .option("-y, --yes", "Auto-approve migration")
  .option("--create-only", "Only create the new collection (don't switch alias)")
  .option("--switch-only", "Only switch alias (collection must exist)")
  .option("--cleanup <collection>", "Delete an old collection after successful migration")
  .action(async (options) => {
    try {
      // Initialize client
      getClientFromEnv();

      // Load config
      const spinner = ora("Loading config...").start();
      const config = await loadConfig(options.config);
      spinner.succeed("Config loaded");

      // Find the collection in config
      if (!config.collections || config.collections.length === 0) {
        console.error(chalk.red("No collections defined in config"));
        process.exit(1);
      }

      let collectionConfig = config.collections[0];
      if (options.collection) {
        const found = config.collections.find((c) => c.name === options.collection);
        if (!found) {
          console.error(chalk.red(`Collection '${options.collection}' not found in config`));
          process.exit(1);
        }
        collectionConfig = found;
      } else if (config.collections.length > 1) {
        console.error(chalk.red("Multiple collections in config. Use --collection to specify which one."));
        console.log(chalk.gray("Available collections:"));
        for (const c of config.collections) {
          console.log(chalk.gray(`  - ${c.name}`));
        }
        process.exit(1);
      }

      // Handle cleanup mode
      if (options.cleanup) {
        const cleanupSpinner = ora(`Deleting collection '${options.cleanup}'...`).start();
        try {
          const { deleteCollection } = await import("../resources/collection.js");
          await deleteCollection(options.cleanup);
          cleanupSpinner.succeed(`Deleted collection '${options.cleanup}'`);
        } catch (error) {
          cleanupSpinner.fail(`Failed to delete collection: ${error instanceof Error ? error.message : String(error)}`);
          process.exit(1);
        }
        return;
      }

      // Plan migration
      const planSpinner = ora("Planning migration...").start();
      const plan = await planMigration(options.alias, collectionConfig!);
      planSpinner.succeed("Migration planned");

      // Display plan
      console.log(formatMigrationPlan(plan));

      // Handle create-only mode
      if (options.createOnly) {
        if (!options.yes) {
          const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          const answer = await new Promise<string>((resolve) => {
            rl.question(
              chalk.yellow("\nCreate the new collection? (yes/no): "),
              resolve
            );
          });
          rl.close();

          if (answer.toLowerCase() !== "yes" && answer.toLowerCase() !== "y") {
            console.log(chalk.gray("Migration cancelled."));
            return;
          }
        }

        const createSpinner = ora(`Creating collection '${plan.newCollection}'...`).start();
        try {
          const { createCollection } = await import("../resources/collection.js");
          await createCollection(plan.newCollectionConfig);
          createSpinner.succeed(`Created collection '${plan.newCollection}'`);
          console.log(chalk.green("\n✓ Collection created. Index your data, then run:"));
          console.log(chalk.cyan(`  tsctl migrate -a ${options.alias} -c ${options.config} --switch-only`));
        } catch (error) {
          createSpinner.fail(`Failed: ${error instanceof Error ? error.message : String(error)}`);
          process.exit(1);
        }
        return;
      }

      // Handle switch-only mode
      if (options.switchOnly) {
        if (!options.yes) {
          const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          const answer = await new Promise<string>((resolve) => {
            rl.question(
              chalk.yellow(`\nSwitch alias '${options.alias}' to the latest collection? (yes/no): `),
              resolve
            );
          });
          rl.close();

          if (answer.toLowerCase() !== "yes" && answer.toLowerCase() !== "y") {
            console.log(chalk.gray("Migration cancelled."));
            return;
          }
        }

        // Find the latest versioned collection
        const { findCollectionVersions, extractBaseName } = await import("../migrate/index.js");
        const baseName = extractBaseName(collectionConfig!.name);
        const versions = await findCollectionVersions(baseName);

        if (versions.length === 0) {
          console.error(chalk.red(`No collections found matching '${baseName}'`));
          process.exit(1);
        }

        // Sort by name (timestamp) and get latest
        const latestCollection = versions.sort((a, b) => b.name.localeCompare(a.name))[0]!;

        const switchSpinner = ora(`Switching alias '${options.alias}' to '${latestCollection.name}'...`).start();
        try {
          const { upsertAlias } = await import("../resources/alias.js");
          await upsertAlias({ name: options.alias, collection: latestCollection.name });
          switchSpinner.succeed(`Switched alias '${options.alias}' to '${latestCollection.name}'`);

          if (plan.currentCollection) {
            console.log(chalk.green("\n✓ Migration complete. Old collection still exists for rollback."));
            console.log(chalk.gray(`  To delete the old collection:`));
            console.log(chalk.cyan(`  tsctl migrate -a ${options.alias} -c ${options.config} --cleanup ${plan.currentCollection}`));
          }
        } catch (error) {
          switchSpinner.fail(`Failed: ${error instanceof Error ? error.message : String(error)}`);
          process.exit(1);
        }
        return;
      }

      // Full migration
      if (!options.yes) {
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question(
            chalk.yellow("\nProceed with migration? (yes/no): "),
            resolve
          );
        });
        rl.close();

        if (answer.toLowerCase() !== "yes" && answer.toLowerCase() !== "y") {
          console.log(chalk.gray("Migration cancelled."));
          return;
        }
      }

      // Execute migration
      console.log(chalk.bold("\nExecuting migration...\n"));

      const result = await executeMigration(plan, {
        skipDelete: options.skipDelete,
        onStep: (step, index) => {
          console.log(chalk.gray(`  Step ${index + 1}: ${step.description}...`));
        },
      });

      if (result.success) {
        console.log(chalk.green("\n✓ Migration completed successfully!"));
        console.log(chalk.gray(`  New collection: ${result.newCollectionName}`));
        console.log(chalk.gray(`  Alias: ${result.aliasName}`));

        if (options.skipDelete && result.oldCollectionName) {
          console.log(chalk.yellow(`\n  Old collection '${result.oldCollectionName}' was kept for rollback.`));
          console.log(chalk.gray(`  To delete it later:`));
          console.log(chalk.cyan(`  tsctl migrate -a ${options.alias} -c ${options.config} --cleanup ${result.oldCollectionName}`));
        }
      } else {
        console.error(chalk.red("\n✗ Migration failed:"));
        for (const error of result.errors) {
          console.error(chalk.red(`  ${error}`));
        }
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// ============================================================================
// env command
// ============================================================================

const envCmd = program
  .command("env")
  .description("Manage environments");

envCmd
  .command("list")
  .description("List available environments")
  .action(async () => {
    console.log(chalk.bold("\nAvailable environments:\n"));

    // Find all .env files
    const cwd = process.cwd();
    const envFiles = [".env"];
    const envNames = ["(default)"];

    // Check for environment-specific files
    const commonEnvs = ["development", "dev", "staging", "stage", "production", "prod", "local", "test"];
    for (const env of commonEnvs) {
      const envFile = `.env.${env}`;
      if (existsSync(resolve(cwd, envFile))) {
        envFiles.push(envFile);
        envNames.push(env);
      }
    }

    // Also scan for any other .env.* files
    const fs = await import("fs");
    const files = fs.readdirSync(cwd);
    for (const file of files) {
      if (file.startsWith(".env.") && !envFiles.includes(file)) {
        envFiles.push(file);
        envNames.push(file.replace(".env.", ""));
      }
    }

    if (envFiles.length === 0) {
      console.log(chalk.yellow("  No environment files found."));
      console.log(chalk.gray("\n  Create .env files with: tsctl init --with-environments"));
      return;
    }

    for (let i = 0; i < envFiles.length; i++) {
      const isDefault = i === 0;
      const name = envNames[i];
      const file = envFiles[i];

      if (isDefault) {
        console.log(`  ${chalk.green("●")} ${chalk.bold(name!)} ${chalk.gray(`(${file})`)}`);
      } else {
        console.log(`  ${chalk.gray("○")} ${name} ${chalk.gray(`(${file})`)}`);
      }
    }

    console.log(chalk.gray("\n  Use --env flag to switch:"));
    console.log(chalk.gray("    tsctl plan --env production"));
    console.log(chalk.gray("    tsctl apply --env staging -y"));
  });

envCmd
  .command("show")
  .description("Show current environment configuration")
  .action(async () => {
    const globalOpts = program.opts();
    const envName = globalOpts.env || "(default)";

    console.log(chalk.bold(`\nEnvironment: ${chalk.cyan(envName)}\n`));

    const host = process.env.TYPESENSE_HOST || "localhost";
    const port = process.env.TYPESENSE_PORT || "8108";
    const protocol = process.env.TYPESENSE_PROTOCOL || "http";
    const apiKey = process.env.TYPESENSE_API_KEY;

    console.log(`  Host:     ${chalk.cyan(host)}`);
    console.log(`  Port:     ${chalk.cyan(port)}`);
    console.log(`  Protocol: ${chalk.cyan(protocol)}`);
    console.log(`  API Key:  ${apiKey ? chalk.green("●●●●●●●● (set)") : chalk.red("(not set)")}`);
    console.log(`  URL:      ${chalk.cyan(`${protocol}://${host}:${port}`)}`);

    // Test connection
    const spinner = ora("Testing connection...").start();
    try {
      getClientFromEnv();
      const connected = await testConnection();
      if (connected) {
        spinner.succeed(chalk.green("Connected to Typesense"));
      } else {
        spinner.fail(chalk.red("Could not connect to Typesense"));
      }
    } catch (error) {
      spinner.fail(`Connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

// ============================================================================
// state command
// ============================================================================

const stateCmd = program
  .command("state")
  .description("Manage state");

stateCmd
  .command("list")
  .description("List all managed resources")
  .action(async () => {
    try {
      getClientFromEnv();
      const state = await loadState();

      if (state.resources.length === 0) {
        console.log(chalk.yellow("\nNo resources in state."));
        return;
      }

      console.log(chalk.bold("\nManaged resources:\n"));
      for (const resource of state.resources) {
        console.log(`  ${formatResourceId(resource.identifier)}`);
        console.log(chalk.gray(`    Checksum: ${resource.checksum}`));
        console.log(chalk.gray(`    Updated: ${resource.lastUpdated}`));
        console.log();
      }
    } catch (error) {
      console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

stateCmd
  .command("show")
  .description("Show full state")
  .action(async () => {
    try {
      getClientFromEnv();
      const state = await loadState();
      console.log(JSON.stringify(state, null, 2));
    } catch (error) {
      console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

stateCmd
  .command("clear")
  .description("Clear state (does not delete resources)")
  .option("-y, --yes", "Auto-approve")
  .action(async (options) => {
    try {
      getClientFromEnv();

      if (!options.yes) {
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question(
            chalk.yellow("Clear state? Resources will NOT be deleted. (yes/no): "),
            resolve
          );
        });
        rl.close();

        if (answer.toLowerCase() !== "yes" && answer.toLowerCase() !== "y") {
          console.log(chalk.gray("Cancelled."));
          return;
        }
      }

      await saveState({ version: "1.0", resources: [] });
      console.log(chalk.green("✓ State cleared."));
    } catch (error) {
      console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// ============================================================================
// completion command
// ============================================================================

program
  .command("completion")
  .description("Generate shell completion script")
  .argument("<shell>", "Shell type: bash, zsh, or fish")
  .action((shell: string) => {
    const commands = "init validate plan apply destroy import drift migrate env state completion";
    const globalFlags = "--env --help --version";

    switch (shell) {
      case "bash":
        console.log(`# tsctl bash completion
# Add to ~/.bashrc: eval "$(tsctl completion bash)"
_tsctl_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local commands="${commands}"
  local global_flags="${globalFlags}"

  if [ "\${COMP_CWORD}" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
  elif [ "\${COMP_CWORD}" -eq 2 ]; then
    case "\${COMP_WORDS[1]}" in
      state) COMPREPLY=( $(compgen -W "list show clear" -- "\${cur}") ) ;;
      env) COMPREPLY=( $(compgen -W "list show" -- "\${cur}") ) ;;
      plan) COMPREPLY=( $(compgen -W "--config --out --json" -- "\${cur}") ) ;;
      apply) COMPREPLY=( $(compgen -W "--config --yes --force-recreate --target" -- "\${cur}") ) ;;
      migrate) COMPREPLY=( $(compgen -W "--alias --config --collection --skip-delete --yes --create-only --switch-only --cleanup" -- "\${cur}") ) ;;
      *) COMPREPLY=( $(compgen -W "\${global_flags}" -- "\${cur}") ) ;;
    esac
  fi
}
complete -F _tsctl_completions tsctl`);
        break;

      case "zsh":
        console.log(`# tsctl zsh completion
# Add to ~/.zshrc: eval "$(tsctl completion zsh)"
_tsctl() {
  local -a commands=(
    'init:Initialize a new project'
    'validate:Validate config file'
    'plan:Show planned changes'
    'apply:Apply changes to Typesense'
    'destroy:Destroy all managed resources'
    'import:Import existing resources'
    'drift:Detect drift'
    'migrate:Blue/green migration'
    'env:Manage environments'
    'state:Manage state'
    'completion:Generate shell completions'
  )

  _arguments -C \\
    '--env[Environment]:environment' \\
    '--help[Show help]' \\
    '--version[Show version]' \\
    '1:command:->command' \\
    '*::arg:->args'

  case "\$state" in
    command)
      _describe 'command' commands
      ;;
    args)
      case "\$words[1]" in
        state)
          _values 'subcommand' 'list[List managed resources]' 'show[Show full state]' 'clear[Clear state]'
          ;;
        env)
          _values 'subcommand' 'list[List environments]' 'show[Show current environment]'
          ;;
        plan)
          _arguments '--config[Config file]:file:_files' '--out[Output file]:file:_files' '--json[JSON output]'
          ;;
        apply)
          _arguments '--config[Config file]:file:_files' '-y[Auto-approve]' '--target[Target resources]:resource'
          ;;
      esac
      ;;
  esac
}
compdef _tsctl tsctl`);
        break;

      case "fish":
        console.log(`# tsctl fish completion
# Save to ~/.config/fish/completions/tsctl.fish
complete -c tsctl -n '__fish_use_subcommand' -a 'init' -d 'Initialize a new project'
complete -c tsctl -n '__fish_use_subcommand' -a 'validate' -d 'Validate config file'
complete -c tsctl -n '__fish_use_subcommand' -a 'plan' -d 'Show planned changes'
complete -c tsctl -n '__fish_use_subcommand' -a 'apply' -d 'Apply changes to Typesense'
complete -c tsctl -n '__fish_use_subcommand' -a 'destroy' -d 'Destroy all managed resources'
complete -c tsctl -n '__fish_use_subcommand' -a 'import' -d 'Import existing resources'
complete -c tsctl -n '__fish_use_subcommand' -a 'drift' -d 'Detect drift'
complete -c tsctl -n '__fish_use_subcommand' -a 'migrate' -d 'Blue/green migration'
complete -c tsctl -n '__fish_use_subcommand' -a 'env' -d 'Manage environments'
complete -c tsctl -n '__fish_use_subcommand' -a 'state' -d 'Manage state'
complete -c tsctl -n '__fish_use_subcommand' -a 'completion' -d 'Generate completions'
complete -c tsctl -l env -d 'Environment to use'
complete -c tsctl -n '__fish_seen_subcommand_from plan' -l config -d 'Config file'
complete -c tsctl -n '__fish_seen_subcommand_from plan' -l json -d 'JSON output'
complete -c tsctl -n '__fish_seen_subcommand_from plan' -l out -d 'Output file'
complete -c tsctl -n '__fish_seen_subcommand_from apply' -l config -d 'Config file'
complete -c tsctl -n '__fish_seen_subcommand_from apply' -s y -l yes -d 'Auto-approve'
complete -c tsctl -n '__fish_seen_subcommand_from apply' -s t -l target -d 'Target resources'
complete -c tsctl -n '__fish_seen_subcommand_from state' -a 'list show clear'
complete -c tsctl -n '__fish_seen_subcommand_from env' -a 'list show'`);
        break;

      default:
        console.error(`Unknown shell: ${shell}. Supported: bash, zsh, fish`);
        process.exit(1);
    }
  });

// ============================================================================
// Run CLI
// ============================================================================

program.parse();
