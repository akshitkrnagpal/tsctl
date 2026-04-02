import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { setupClient, cleanupTypesense } from "./setup.js";
import { getTypesenseVersion } from "./helpers.js";
import { buildPlan, buildNewState } from "../plan/index.js";
import { createCollection } from "../resources/collection.js";
import { upsertAlias } from "../resources/alias.js";
import { upsertSynonym } from "../resources/synonym.js";
import { upsertOverride } from "../resources/override.js";
import { saveState } from "../state/index.js";
import type { TypesenseConfig, State } from "../types/index.js";

describe("plan", () => {
  beforeEach(async () => {
    setupClient();
    await cleanupTypesense();
  });

  afterEach(async () => {
    await cleanupTypesense();
  });

  describe("buildPlan", () => {
    test("plans creation for new collection", async () => {
      const config: TypesenseConfig = {
        collections: [
          {
            name: "products",
            fields: [{ name: "title", type: "string" }],
          },
        ],
      };

      const plan = await buildPlan(config);
      expect(plan.hasChanges).toBe(true);
      expect(plan.summary.create).toBe(1);
      expect(plan.changes[0]!.action).toBe("create");
      expect(plan.changes[0]!.identifier.name).toBe("products");
    });

    test("plans no-change for existing matching collection", async () => {
      const collectionConfig = {
        name: "products",
        fields: [{ name: "title", type: "string" }],
      };

      await createCollection(collectionConfig);

      const config: TypesenseConfig = {
        collections: [collectionConfig],
      };

      const plan = await buildPlan(config);
      expect(plan.hasChanges).toBe(false);
      expect(plan.summary.noChange).toBe(1);
    });

    test("plans update for modified collection", async () => {
      await createCollection({
        name: "products",
        fields: [{ name: "title", type: "string" }],
      });

      const config: TypesenseConfig = {
        collections: [
          {
            name: "products",
            fields: [
              { name: "title", type: "string", facet: true },
            ],
          },
        ],
      };

      const plan = await buildPlan(config);
      expect(plan.hasChanges).toBe(true);
      expect(plan.summary.update).toBe(1);
    });

    test("plans deletion for resource in state but not in config", async () => {
      await createCollection({
        name: "products",
        fields: [{ name: "title", type: "string" }],
      });

      // Save state with the collection
      const state: State = {
        version: "1.0",
        resources: [
          {
            identifier: { type: "collection", name: "products" },
            config: { name: "products", fields: [{ name: "title", type: "string" }] },
            checksum: "abc",
            lastUpdated: new Date().toISOString(),
          },
        ],
      };
      await saveState(state);

      // Empty config = should plan deletion
      const plan = await buildPlan({});
      expect(plan.hasChanges).toBe(true);
      expect(plan.summary.delete).toBe(1);
    });

    test("plans creation for new alias", async () => {
      await createCollection({
        name: "products",
        fields: [{ name: "title", type: "string" }],
      });

      const config: TypesenseConfig = {
        collections: [
          { name: "products", fields: [{ name: "title", type: "string" }] },
        ],
        aliases: [{ name: "products_live", collection: "products" }],
      };

      const plan = await buildPlan(config);
      const aliasChange = plan.changes.find(
        (c) => c.identifier.type === "alias"
      );
      expect(aliasChange).toBeDefined();
      expect(aliasChange!.action).toBe("create");
    });

    test("plans no-change for existing alias", async () => {
      await createCollection({
        name: "products",
        fields: [{ name: "title", type: "string" }],
      });
      await upsertAlias({ name: "products_live", collection: "products" });

      const config: TypesenseConfig = {
        collections: [
          { name: "products", fields: [{ name: "title", type: "string" }] },
        ],
        aliases: [{ name: "products_live", collection: "products" }],
      };

      const plan = await buildPlan(config);
      const aliasChange = plan.changes.find(
        (c) => c.identifier.type === "alias"
      );
      expect(aliasChange!.action).toBe("no-change");
    });

    test("plans creation for new synonym (pre-v30)", async () => {
      const version = await getTypesenseVersion();
      if (version >= 30) return;
      await createCollection({
        name: "products",
        fields: [{ name: "title", type: "string" }],
      });

      const config: TypesenseConfig = {
        collections: [
          { name: "products", fields: [{ name: "title", type: "string" }] },
        ],
        synonyms: [
          { id: "phone-syn", collection: "products", synonyms: ["phone", "mobile"] },
        ],
      };

      const plan = await buildPlan(config);
      const synChange = plan.changes.find(
        (c) => c.identifier.type === "synonym"
      );
      expect(synChange).toBeDefined();
      expect(synChange!.action).toBe("create");
    });

    test("plans creation for new override (pre-v30)", async () => {
      const version = await getTypesenseVersion();
      if (version >= 30) return;
      await createCollection({
        name: "products",
        fields: [{ name: "title", type: "string" }],
      });

      const config: TypesenseConfig = {
        collections: [
          { name: "products", fields: [{ name: "title", type: "string" }] },
        ],
        overrides: [
          {
            id: "pin-featured",
            collection: "products",
            rule: { query: "featured", match: "exact" },
            includes: [{ id: "product-1", position: 1 }],
          },
        ],
      };

      const plan = await buildPlan(config);
      const ovChange = plan.changes.find(
        (c) => c.identifier.type === "override"
      );
      expect(ovChange).toBeDefined();
      expect(ovChange!.action).toBe("create");
    });

    test("plans creation for new API key", async () => {
      const config: TypesenseConfig = {
        apiKeys: [
          {
            description: "Search key",
            actions: ["documents:search"],
            collections: ["products"],
          },
        ],
      };

      const plan = await buildPlan(config);
      const keyChange = plan.changes.find(
        (c) => c.identifier.type === "apiKey"
      );
      expect(keyChange).toBeDefined();
      expect(keyChange!.action).toBe("create");
    });

    test("generates correct summary counts", async () => {
      await createCollection({
        name: "existing",
        fields: [{ name: "title", type: "string" }],
      });

      // Save state with an old resource that won't be in config
      const state: State = {
        version: "1.0",
        resources: [
          {
            identifier: { type: "collection", name: "old" },
            config: { name: "old", fields: [{ name: "x", type: "string" }] },
            checksum: "abc",
            lastUpdated: "",
          },
        ],
      };
      await saveState(state);

      const config: TypesenseConfig = {
        collections: [
          { name: "existing", fields: [{ name: "title", type: "string" }] },
          { name: "new-one", fields: [{ name: "y", type: "string" }] },
        ],
      };

      const plan = await buildPlan(config);
      expect(plan.summary.noChange).toBe(1); // existing
      expect(plan.summary.create).toBe(1); // new-one
      expect(plan.summary.delete).toBe(1); // old
    });

    test("plan with empty config and empty state has no changes", async () => {
      const plan = await buildPlan({});
      expect(plan.hasChanges).toBe(false);
      expect(plan.summary.create).toBe(0);
      expect(plan.summary.update).toBe(0);
      expect(plan.summary.delete).toBe(0);
    });
  });

  describe("buildNewState", () => {
    test("builds state from config", () => {
      const config: TypesenseConfig = {
        collections: [
          { name: "products", fields: [{ name: "title", type: "string" }] },
        ],
        aliases: [{ name: "products_live", collection: "products" }],
      };

      const currentState: State = { version: "1.0", resources: [] };
      const newState = buildNewState(currentState, config);

      expect(newState.resources).toHaveLength(2);
      expect(newState.version).toBe("1.0");

      const collectionResource = newState.resources.find(
        (r) => r.identifier.type === "collection"
      );
      expect(collectionResource).toBeDefined();
      expect(collectionResource!.identifier.name).toBe("products");
      expect(collectionResource!.checksum).toBeDefined();

      const aliasResource = newState.resources.find(
        (r) => r.identifier.type === "alias"
      );
      expect(aliasResource).toBeDefined();
      expect(aliasResource!.identifier.name).toBe("products_live");
    });

    test("builds state with all resource types", () => {
      const config: TypesenseConfig = {
        collections: [
          { name: "products", fields: [{ name: "title", type: "string" }] },
        ],
        aliases: [{ name: "products_live", collection: "products" }],
        synonyms: [
          { id: "syn1", collection: "products", synonyms: ["a", "b"] },
        ],
        overrides: [
          {
            id: "ov1",
            collection: "products",
            rule: { query: "x", match: "exact" },
          },
        ],
        apiKeys: [
          { description: "key1", actions: ["*"], collections: ["*"] },
        ],
      };

      const currentState: State = { version: "1.0", resources: [] };
      const newState = buildNewState(currentState, config);

      expect(newState.resources).toHaveLength(5);
      const types = newState.resources.map((r) => r.identifier.type);
      expect(types).toContain("collection");
      expect(types).toContain("alias");
      expect(types).toContain("synonym");
      expect(types).toContain("override");
      expect(types).toContain("apiKey");
    });

    test("preserves version from current state", () => {
      const currentState: State = { version: "2.0", resources: [] };
      const newState = buildNewState(currentState, {});
      expect(newState.version).toBe("2.0");
    });

    test("builds empty state from empty config", () => {
      const currentState: State = { version: "1.0", resources: [] };
      const newState = buildNewState(currentState, {});
      expect(newState.resources).toHaveLength(0);
    });
  });
});
