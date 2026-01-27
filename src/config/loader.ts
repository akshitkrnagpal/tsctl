import { cosmiconfig } from "cosmiconfig";
import { resolve, dirname } from "path";
import { pathToFileURL } from "url";
import { TypesenseConfigSchema, type TypesenseConfig } from "../types/index.js";

const MODULE_NAME = "tsctl";

/**
 * TypeScript/ESM loader for cosmiconfig
 */
async function typeScriptLoader(filepath: string): Promise<unknown> {
  const fileUrl = pathToFileURL(filepath).href;
  // Add cache busting to ensure we get fresh config
  const cacheBustedUrl = `${fileUrl}?t=${Date.now()}`;
  const module = await import(cacheBustedUrl);
  return module.default || module;
}

/**
 * Create the cosmiconfig explorer with all supported file formats
 *
 * Supported config files (in search order):
 * - package.json ("tsctl" property)
 * - .tsctlrc (JSON or YAML)
 * - .tsctlrc.json
 * - .tsctlrc.yaml / .tsctlrc.yml
 * - .tsctlrc.js / .tsctlrc.cjs / .tsctlrc.mjs
 * - .tsctlrc.ts / .tsctlrc.cts / .tsctlrc.mts
 * - tsctl.config.js / tsctl.config.cjs / tsctl.config.mjs
 * - tsctl.config.ts / tsctl.config.cts / tsctl.config.mts
 * - tsctl.config.json
 * - tsctl.config.yaml / tsctl.config.yml
 * - typesense.config.js / typesense.config.cjs / typesense.config.mjs (legacy)
 * - typesense.config.ts / typesense.config.cts / typesense.config.mts (legacy)
 */
function createExplorer() {
  return cosmiconfig(MODULE_NAME, {
    searchPlaces: [
      // package.json
      "package.json",

      // RC files (JSON/YAML)
      `.${MODULE_NAME}rc`,
      `.${MODULE_NAME}rc.json`,
      `.${MODULE_NAME}rc.yaml`,
      `.${MODULE_NAME}rc.yml`,

      // RC files (JS)
      `.${MODULE_NAME}rc.js`,
      `.${MODULE_NAME}rc.cjs`,
      `.${MODULE_NAME}rc.mjs`,

      // RC files (TS)
      `.${MODULE_NAME}rc.ts`,
      `.${MODULE_NAME}rc.cts`,
      `.${MODULE_NAME}rc.mts`,

      // Config files (JS)
      `${MODULE_NAME}.config.js`,
      `${MODULE_NAME}.config.cjs`,
      `${MODULE_NAME}.config.mjs`,

      // Config files (TS)
      `${MODULE_NAME}.config.ts`,
      `${MODULE_NAME}.config.cts`,
      `${MODULE_NAME}.config.mts`,

      // Config files (JSON/YAML)
      `${MODULE_NAME}.config.json`,
      `${MODULE_NAME}.config.yaml`,
      `${MODULE_NAME}.config.yml`,

      // Legacy config files (for backwards compatibility)
      "typesense.config.js",
      "typesense.config.cjs",
      "typesense.config.mjs",
      "typesense.config.ts",
      "typesense.config.cts",
      "typesense.config.mts",
      "typesense.config.json",
      "typesense.config.yaml",
      "typesense.config.yml",
    ],
    loaders: {
      ".ts": typeScriptLoader,
      ".cts": typeScriptLoader,
      ".mts": typeScriptLoader,
      ".mjs": typeScriptLoader,
    },
  });
}

/**
 * Find the config file in the given directory or parent directories
 */
export async function findConfigFile(startDir: string = process.cwd()): Promise<string | null> {
  const explorer = createExplorer();
  const result = await explorer.search(startDir);
  return result?.filepath || null;
}

/**
 * Load and validate a config file
 *
 * @param configPath - Optional path to config file. If not provided, searches for config.
 * @returns Validated TypesenseConfig
 */
export async function loadConfig(configPath?: string): Promise<TypesenseConfig> {
  const explorer = createExplorer();

  let result;

  if (configPath) {
    // Load specific file
    const resolvedPath = resolve(configPath);
    result = await explorer.load(resolvedPath);
  } else {
    // Search for config
    result = await explorer.search();
  }

  if (!result || result.isEmpty) {
    throw new Error(
      "No config file found. Create one of the following:\n" +
      "  - tsctl.config.ts (recommended)\n" +
      "  - tsctl.config.js\n" +
      "  - tsctl.config.json\n" +
      "  - tsctl.config.yaml\n" +
      "  - .tsctlrc\n" +
      "  - \"tsctl\" property in package.json\n" +
      "\nOr specify a config file with --config"
    );
  }

  try {
    // Validate with Zod
    const validated = TypesenseConfigSchema.parse(result.config);
    return validated;
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      throw new Error(`Invalid config in ${result.filepath}:\n${error.message}`);
    }
    throw new Error(
      `Failed to parse config file: ${result.filepath}\n${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get the directory containing the config file
 */
export async function getConfigDir(configPath?: string): Promise<string> {
  const configFile = configPath ? resolve(configPath) : await findConfigFile();
  if (!configFile) {
    return process.cwd();
  }
  return dirname(configFile);
}
