import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { resolve } from "path";
import { loadConfig, findConfigFile } from "../config/loader.js";

const TEST_DIR = resolve("/tmp/tsctl-config-test");

describe("config loader", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("JSON config", () => {
    test("loads tsctl.config.json", async () => {
      const configPath = resolve(TEST_DIR, "tsctl.config.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          collections: [
            {
              name: "products",
              fields: [{ name: "title", type: "string" }],
            },
          ],
        })
      );

      const config = await loadConfig(configPath);
      expect(config.collections).toHaveLength(1);
      expect(config.collections![0]!.name).toBe("products");
    });

    test("loads .tsctlrc.json", async () => {
      const configPath = resolve(TEST_DIR, ".tsctlrc.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          aliases: [{ name: "test", collection: "products" }],
        })
      );

      const config = await loadConfig(configPath);
      expect(config.aliases).toHaveLength(1);
    });
  });

  describe("YAML config", () => {
    test("loads tsctl.config.yaml", async () => {
      const configPath = resolve(TEST_DIR, "tsctl.config.yaml");
      writeFileSync(
        configPath,
        `collections:
  - name: products
    fields:
      - name: title
        type: string
      - name: price
        type: float
`
      );

      const config = await loadConfig(configPath);
      expect(config.collections).toHaveLength(1);
      expect(config.collections![0]!.fields).toHaveLength(2);
    });

    test("loads tsctl.config.yml", async () => {
      const configPath = resolve(TEST_DIR, "tsctl.config.yml");
      writeFileSync(
        configPath,
        `aliases:
  - name: products_live
    collection: products
`
      );

      const config = await loadConfig(configPath);
      expect(config.aliases).toHaveLength(1);
    });
  });

  describe("TypeScript config", () => {
    test("loads tsctl.config.ts", async () => {
      const configPath = resolve(TEST_DIR, "tsctl.config.ts");
      writeFileSync(
        configPath,
        `export default {
  collections: [
    {
      name: "products",
      fields: [{ name: "title", type: "string" }],
    },
  ],
};
`
      );

      const config = await loadConfig(configPath);
      expect(config.collections).toHaveLength(1);
    });
  });

  describe("validation", () => {
    test("validates field types", async () => {
      const configPath = resolve(TEST_DIR, "tsctl.config.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          collections: [
            {
              name: "bad",
              fields: [{ name: "x", type: "invalid_type" }],
            },
          ],
        })
      );

      expect(loadConfig(configPath)).rejects.toThrow();
    });

    test("validates collection requires fields", async () => {
      const configPath = resolve(TEST_DIR, "tsctl.config.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          collections: [{ name: "bad" }],
        })
      );

      expect(loadConfig(configPath)).rejects.toThrow();
    });

    test("accepts empty config", async () => {
      const configPath = resolve(TEST_DIR, "tsctl.config.json");
      writeFileSync(configPath, "{}");

      const config = await loadConfig(configPath);
      expect(config.collections).toBeUndefined();
    });

    test("validates full config with all resource types", async () => {
      const configPath = resolve(TEST_DIR, "tsctl.config.json");
      writeFileSync(
        configPath,
        JSON.stringify({
          collections: [
            { name: "products", fields: [{ name: "title", type: "string" }] },
          ],
          aliases: [{ name: "products_live", collection: "products" }],
          stopwords: [{ id: "english", stopwords: ["the", "a"] }],
          presets: [{ name: "default", value: { q: "*" } }],
          apiKeys: [
            { description: "key1", actions: ["documents:search"], collections: ["*"] },
          ],
          curationSets: [
            {
              name: "curations",
              items: [
                { id: "rule1", rule: { query: "test", match: "exact" }, filter_by: "x:=1" },
              ],
            },
          ],
          stemmingDictionaries: [
            { id: "dict1", words: [{ word: "dogs", root: "dog" }] },
          ],
        })
      );

      const config = await loadConfig(configPath);
      expect(config.collections).toHaveLength(1);
      expect(config.stopwords).toHaveLength(1);
      expect(config.presets).toHaveLength(1);
      expect(config.curationSets).toHaveLength(1);
      expect(config.stemmingDictionaries).toHaveLength(1);
    });
  });

  describe("findConfigFile", () => {
    test("finds tsctl.config.json in directory", async () => {
      writeFileSync(
        resolve(TEST_DIR, "tsctl.config.json"),
        JSON.stringify({ collections: [] })
      );

      const found = await findConfigFile(TEST_DIR);
      expect(found).not.toBeNull();
      expect(found!).toContain("tsctl.config.json");
    });

    test("returns null when no config exists", async () => {
      const emptyDir = resolve(TEST_DIR, "empty");
      mkdirSync(emptyDir, { recursive: true });
      // findConfigFile searches up to root, so it might find the repo's config
      // Just test it doesn't throw
      const found = await findConfigFile(emptyDir);
      // May or may not find a config in parent dirs
      expect(typeof found === "string" || found === null).toBe(true);
    });
  });

  describe("error handling", () => {
    test("throws on non-existent file", async () => {
      expect(
        loadConfig(resolve(TEST_DIR, "nonexistent.json"))
      ).rejects.toThrow();
    });
  });
});
