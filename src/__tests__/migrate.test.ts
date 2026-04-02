import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { setupClient, cleanupTypesense } from "./setup.js";
import {
  generateVersionedName,
  extractBaseName,
  findCollectionVersions,
  planMigration,
  executeMigration,
} from "../migrate/index.js";
import { createCollection, getCollection } from "../resources/collection.js";
import { upsertAlias, getAlias } from "../resources/alias.js";
import type { CollectionConfig } from "../types/index.js";

describe("migrate", () => {
  beforeEach(async () => {
    setupClient();
    await cleanupTypesense();
  });

  afterEach(async () => {
    await cleanupTypesense();
  });

  describe("generateVersionedName", () => {
    test("appends timestamp to base name", () => {
      const name = generateVersionedName("products");
      expect(name).toMatch(/^products_\d{13}$/);
    });

    test("generates unique names on subsequent calls", async () => {
      const name1 = generateVersionedName("products");
      // Tiny delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 5));
      const name2 = generateVersionedName("products");
      expect(name1).not.toBe(name2);
    });
  });

  describe("extractBaseName", () => {
    test("extracts base name from versioned name", () => {
      expect(extractBaseName("products_1706486400000")).toBe("products");
    });

    test("returns original name if not versioned", () => {
      expect(extractBaseName("products")).toBe("products");
    });

    test("handles names with underscores", () => {
      expect(extractBaseName("my_products_1706486400000")).toBe("my_products");
    });
  });

  describe("findCollectionVersions", () => {
    test("finds all versions of a collection", async () => {
      await createCollection({
        name: "products",
        fields: [{ name: "title", type: "string" }],
      });
      await createCollection({
        name: "products_1706486400000",
        fields: [{ name: "title", type: "string" }],
      });
      await createCollection({
        name: "products_1706486500000",
        fields: [{ name: "title", type: "string" }],
      });
      await createCollection({
        name: "users",
        fields: [{ name: "name", type: "string" }],
      });

      const versions = await findCollectionVersions("products");
      expect(versions).toHaveLength(3);
      const names = versions.map((v) => v.name);
      expect(names).toContain("products");
      expect(names).toContain("products_1706486400000");
      expect(names).not.toContain("users");
    });

    test("returns empty array for non-existent base name", async () => {
      const versions = await findCollectionVersions("nonexistent");
      expect(versions).toHaveLength(0);
    });
  });

  describe("planMigration", () => {
    test("plans migration without existing alias", async () => {
      const config: CollectionConfig = {
        name: "products",
        fields: [{ name: "title", type: "string" }],
      };

      const plan = await planMigration("products_live", config);

      expect(plan.alias).toBe("products_live");
      expect(plan.currentCollection).toBeNull();
      expect(plan.newCollection).toMatch(/^products_\d{13}$/);
      expect(plan.steps).toHaveLength(2); // create + switch (no delete since no current)
      expect(plan.steps[0]!.action).toBe("create_collection");
      expect(plan.steps[1]!.action).toBe("switch_alias");
    });

    test("plans migration with existing alias", async () => {
      await createCollection({
        name: "products_old",
        fields: [{ name: "title", type: "string" }],
      });
      await upsertAlias({ name: "products_live", collection: "products_old" });

      const config: CollectionConfig = {
        name: "products",
        fields: [
          { name: "title", type: "string" },
          { name: "description", type: "string" },
        ],
      };

      const plan = await planMigration("products_live", config);

      expect(plan.currentCollection).toBe("products_old");
      expect(plan.steps).toHaveLength(3); // create + switch + delete
      expect(plan.steps[2]!.action).toBe("delete_old_collection");
    });
  });

  describe("executeMigration", () => {
    test("executes full migration", async () => {
      const config: CollectionConfig = {
        name: "products",
        fields: [{ name: "title", type: "string" }],
      };

      const plan = await planMigration("products_live", config);
      const result = await executeMigration(plan);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);

      // Verify new collection exists
      const collection = await getCollection(plan.newCollection);
      expect(collection).not.toBeNull();

      // Verify alias points to new collection
      const alias = await getAlias("products_live");
      expect(alias).not.toBeNull();
      expect(alias!.collection).toBe(plan.newCollection);
    });

    test("executes migration with skipDelete", async () => {
      await createCollection({
        name: "products_old",
        fields: [{ name: "title", type: "string" }],
      });
      await upsertAlias({ name: "products_live", collection: "products_old" });

      const config: CollectionConfig = {
        name: "products",
        fields: [{ name: "title", type: "string" }],
      };

      const plan = await planMigration("products_live", config);
      const result = await executeMigration(plan, { skipDelete: true });

      expect(result.success).toBe(true);

      // Old collection should still exist
      const oldCollection = await getCollection("products_old");
      expect(oldCollection).not.toBeNull();
    });

    test("calls onStep callback for each step", async () => {
      const config: CollectionConfig = {
        name: "products",
        fields: [{ name: "title", type: "string" }],
      };

      const plan = await planMigration("products_live", config);
      const steps: number[] = [];

      await executeMigration(plan, {
        onStep: (_step, index) => {
          steps.push(index);
        },
      });

      expect(steps).toEqual([0, 1]);
    });

    test("migration replaces old collection when not skipping delete", async () => {
      // Setup: existing collection and alias
      await createCollection({
        name: "products_old",
        fields: [{ name: "title", type: "string" }],
      });
      await upsertAlias({ name: "products_live", collection: "products_old" });

      const config: CollectionConfig = {
        name: "products",
        fields: [
          { name: "title", type: "string" },
          { name: "price", type: "float" },
        ],
      };

      const plan = await planMigration("products_live", config);
      const result = await executeMigration(plan);

      expect(result.success).toBe(true);

      // Old collection should be deleted
      const oldCollection = await getCollection("products_old");
      expect(oldCollection).toBeNull();

      // New collection should exist with new schema
      const newCollection = await getCollection(plan.newCollection);
      expect(newCollection).not.toBeNull();
      expect(newCollection!.fields).toHaveLength(2);
    });
  });
});
