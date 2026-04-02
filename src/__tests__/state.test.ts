import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { setupClient, cleanupTypesense } from "./setup.js";
import {
  ensureStateCollection,
  loadState,
  saveState,
  computeChecksum,
  formatResourceId,
  parseResourceId,
  findResource,
  upsertResource,
  removeResource,
} from "../state/index.js";
import type { State, ManagedResource, ResourceIdentifier } from "../types/index.js";

describe("state", () => {
  beforeEach(async () => {
    setupClient();
    await cleanupTypesense();
  });

  afterEach(async () => {
    await cleanupTypesense();
  });

  describe("ensureStateCollection", () => {
    test("creates state collection if it doesn't exist", async () => {
      await ensureStateCollection();
      const client = (await import("../client/index.js")).getClient();
      const collection = await client.collections("_tsctl_state").retrieve();
      expect(collection.name).toBe("_tsctl_state");
    });

    test("does not fail if state collection already exists", async () => {
      await ensureStateCollection();
      await ensureStateCollection(); // second call should not throw
    });
  });

  describe("loadState / saveState", () => {
    test("returns empty state when no state exists", async () => {
      const state = await loadState();
      expect(state.version).toBe("1.0");
      expect(state.resources).toEqual([]);
    });

    test("saves and loads state", async () => {
      const state: State = {
        version: "1.0",
        resources: [
          {
            identifier: { type: "collection", name: "products" },
            config: { name: "products", fields: [{ name: "title", type: "string" }] },
            checksum: "abc123",
            lastUpdated: new Date().toISOString(),
          },
        ],
      };

      await saveState(state);
      const loaded = await loadState();

      expect(loaded.version).toBe("1.0");
      expect(loaded.resources).toHaveLength(1);
      expect(loaded.resources[0]!.identifier.name).toBe("products");
    });

    test("overwrites previous state on save", async () => {
      const state1: State = {
        version: "1.0",
        resources: [
          {
            identifier: { type: "collection", name: "old" },
            config: { name: "old", fields: [{ name: "x", type: "string" }] },
            checksum: "aaa",
            lastUpdated: new Date().toISOString(),
          },
        ],
      };

      const state2: State = {
        version: "1.0",
        resources: [
          {
            identifier: { type: "collection", name: "new" },
            config: { name: "new", fields: [{ name: "y", type: "string" }] },
            checksum: "bbb",
            lastUpdated: new Date().toISOString(),
          },
        ],
      };

      await saveState(state1);
      await saveState(state2);
      const loaded = await loadState();

      expect(loaded.resources).toHaveLength(1);
      expect(loaded.resources[0]!.identifier.name).toBe("new");
    });
  });

  describe("computeChecksum", () => {
    test("returns consistent checksum for same config", () => {
      const config = { name: "products", fields: [{ name: "title", type: "string" as const }] };
      const checksum1 = computeChecksum(config);
      const checksum2 = computeChecksum(config);
      expect(checksum1).toBe(checksum2);
    });

    test("returns different checksum for different configs", () => {
      const config1 = { name: "a", fields: [{ name: "x", type: "string" as const }] };
      const config2 = { name: "b", fields: [{ name: "y", type: "string" as const }] };
      expect(computeChecksum(config1)).not.toBe(computeChecksum(config2));
    });

    test("returns 16-character hex string", () => {
      const checksum = computeChecksum({ name: "test", collection: "x" });
      expect(checksum).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe("formatResourceId / parseResourceId", () => {
    test("formats collection identifier", () => {
      expect(formatResourceId({ type: "collection", name: "products" })).toBe(
        "collection.products"
      );
    });

    test("formats scoped identifier", () => {
      expect(
        formatResourceId({ type: "synonym", name: "syn1", collection: "products" })
      ).toBe("synonym.products.syn1");
    });

    test("parses simple identifier", () => {
      const id = parseResourceId("collection.products");
      expect(id.type).toBe("collection");
      expect(id.name).toBe("products");
      expect(id.collection).toBeUndefined();
    });

    test("parses scoped identifier", () => {
      const id = parseResourceId("synonym.products.syn1");
      expect(id.type).toBe("synonym");
      expect(id.collection).toBe("products");
      expect(id.name).toBe("syn1");
    });

    test("roundtrips correctly", () => {
      const identifier: ResourceIdentifier = {
        type: "override",
        name: "ov1",
        collection: "products",
      };
      const formatted = formatResourceId(identifier);
      const parsed = parseResourceId(formatted);
      expect(parsed).toEqual(identifier);
    });
  });

  describe("findResource", () => {
    test("finds existing resource", () => {
      const state: State = {
        version: "1.0",
        resources: [
          {
            identifier: { type: "collection", name: "products" },
            config: { name: "products", fields: [] },
            checksum: "abc",
            lastUpdated: "",
          },
        ],
      };
      const found = findResource(state, { type: "collection", name: "products" });
      expect(found).toBeDefined();
      expect(found!.identifier.name).toBe("products");
    });

    test("returns undefined for missing resource", () => {
      const state: State = { version: "1.0", resources: [] };
      const found = findResource(state, { type: "collection", name: "missing" });
      expect(found).toBeUndefined();
    });

    test("matches by collection scope", () => {
      const state: State = {
        version: "1.0",
        resources: [
          {
            identifier: { type: "synonym", name: "syn1", collection: "products" },
            config: { id: "syn1", collection: "products", synonyms: ["a", "b"] },
            checksum: "abc",
            lastUpdated: "",
          },
          {
            identifier: { type: "synonym", name: "syn1", collection: "users" },
            config: { id: "syn1", collection: "users", synonyms: ["c", "d"] },
            checksum: "def",
            lastUpdated: "",
          },
        ],
      };

      const found = findResource(state, {
        type: "synonym",
        name: "syn1",
        collection: "products",
      });
      expect(found).toBeDefined();
      expect((found!.config as any).collection).toBe("products");
    });
  });

  describe("upsertResource", () => {
    test("adds new resource", () => {
      const state: State = { version: "1.0", resources: [] };
      const resource: ManagedResource = {
        identifier: { type: "collection", name: "products" },
        config: { name: "products", fields: [] },
        checksum: "abc",
        lastUpdated: "",
      };
      const newState = upsertResource(state, resource);
      expect(newState.resources).toHaveLength(1);
    });

    test("updates existing resource", () => {
      const state: State = {
        version: "1.0",
        resources: [
          {
            identifier: { type: "collection", name: "products" },
            config: { name: "products", fields: [] },
            checksum: "old",
            lastUpdated: "",
          },
        ],
      };
      const resource: ManagedResource = {
        identifier: { type: "collection", name: "products" },
        config: { name: "products", fields: [{ name: "title", type: "string" }] },
        checksum: "new",
        lastUpdated: "",
      };
      const newState = upsertResource(state, resource);
      expect(newState.resources).toHaveLength(1);
      expect(newState.resources[0]!.checksum).toBe("new");
    });

    test("does not mutate original state", () => {
      const state: State = { version: "1.0", resources: [] };
      const resource: ManagedResource = {
        identifier: { type: "collection", name: "products" },
        config: { name: "products", fields: [] },
        checksum: "abc",
        lastUpdated: "",
      };
      upsertResource(state, resource);
      expect(state.resources).toHaveLength(0);
    });
  });

  describe("removeResource", () => {
    test("removes existing resource", () => {
      const state: State = {
        version: "1.0",
        resources: [
          {
            identifier: { type: "collection", name: "products" },
            config: { name: "products", fields: [] },
            checksum: "abc",
            lastUpdated: "",
          },
        ],
      };
      const newState = removeResource(state, { type: "collection", name: "products" });
      expect(newState.resources).toHaveLength(0);
    });

    test("does nothing for non-existent resource", () => {
      const state: State = {
        version: "1.0",
        resources: [
          {
            identifier: { type: "collection", name: "products" },
            config: { name: "products", fields: [] },
            checksum: "abc",
            lastUpdated: "",
          },
        ],
      };
      const newState = removeResource(state, { type: "collection", name: "missing" });
      expect(newState.resources).toHaveLength(1);
    });

    test("does not mutate original state", () => {
      const state: State = {
        version: "1.0",
        resources: [
          {
            identifier: { type: "collection", name: "products" },
            config: { name: "products", fields: [] },
            checksum: "abc",
            lastUpdated: "",
          },
        ],
      };
      removeResource(state, { type: "collection", name: "products" });
      expect(state.resources).toHaveLength(1);
    });
  });
});
