import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { setupClient, cleanupTypesense } from "./setup.js";
import {
  createApiKey,
  getApiKey,
  getApiKeyById,
  listApiKeys,
  deleteApiKey,
  deleteApiKeyByDescription,
  apiKeyConfigsEqual,
} from "../resources/apikey.js";

describe("API keys (integration)", () => {
  beforeEach(async () => {
    setupClient();
    await cleanupTypesense();
  });

  afterEach(async () => {
    await cleanupTypesense();
  });

  test("creates search-only key", async () => {
    const result = await createApiKey({
      description: "Search-only key for frontend",
      actions: ["documents:search"],
      collections: ["products"],
    });

    expect(result.id).toBeGreaterThan(0);
    expect(result.value).toBeTruthy();
    expect(result.value.length).toBeGreaterThan(10);
  });

  test("creates admin key", async () => {
    const result = await createApiKey({
      description: "Admin key",
      actions: ["*"],
      collections: ["*"],
    });

    expect(result.id).toBeGreaterThan(0);
  });

  test("creates key with custom value", async () => {
    const result = await createApiKey({
      description: "Custom value key",
      actions: ["documents:search"],
      collections: ["*"],
      value: "my-custom-api-key-value-12345678",
    });

    expect(result.value).toBe("my-custom-api-key-value-12345678");
  });

  test("creates key with expiration", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 86400; // 24h from now
    const result = await createApiKey({
      description: "Expiring key",
      actions: ["documents:search"],
      collections: ["*"],
      expires_at: expiresAt,
    });

    const retrieved = await getApiKey("Expiring key");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.expires_at).toBe(expiresAt);
  });

  test("getApiKeyById retrieves key", async () => {
    const created = await createApiKey({
      description: "Test key by ID",
      actions: ["documents:search"],
      collections: ["*"],
    });

    const retrieved = await getApiKeyById(created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(created.id);
    expect(retrieved!.description).toBe("Test key by ID");
  });

  test("getApiKeyById returns null for non-existent", async () => {
    const result = await getApiKeyById(99999);
    expect(result).toBeNull();
  });

  test("listApiKeys returns keys with descriptions", async () => {
    await createApiKey({
      description: "Key A",
      actions: ["documents:search"],
      collections: ["*"],
    });
    await createApiKey({
      description: "Key B",
      actions: ["*"],
      collections: ["*"],
    });

    const keys = await listApiKeys();
    const descriptions = keys.map((k) => k.description);
    expect(descriptions).toContain("Key A");
    expect(descriptions).toContain("Key B");
  });

  test("deleteApiKey removes by ID", async () => {
    const created = await createApiKey({
      description: "To delete by ID",
      actions: ["*"],
      collections: ["*"],
    });

    await deleteApiKey(created.id);
    const result = await getApiKeyById(created.id);
    expect(result).toBeNull();
  });

  test("deleteApiKeyByDescription removes by description", async () => {
    await createApiKey({
      description: "To delete by desc",
      actions: ["*"],
      collections: ["*"],
    });

    await deleteApiKeyByDescription("To delete by desc");
    const result = await getApiKey("To delete by desc");
    expect(result).toBeNull();
  });

  test("deleteApiKeyByDescription does nothing for non-existent", async () => {
    // Should not throw
    await deleteApiKeyByDescription("nonexistent");
  });

  test("apiKeyConfigsEqual handles set-like comparison", () => {
    expect(
      apiKeyConfigsEqual(
        {
          description: "key",
          actions: ["documents:search", "documents:get"],
          collections: ["products", "users"],
        },
        {
          description: "key",
          actions: ["documents:get", "documents:search"],
          collections: ["users", "products"],
        }
      )
    ).toBe(true);
  });

  test("apiKeyConfigsEqual detects action differences", () => {
    expect(
      apiKeyConfigsEqual(
        {
          description: "key",
          actions: ["documents:search"],
          collections: ["*"],
        },
        {
          description: "key",
          actions: ["documents:search", "documents:get"],
          collections: ["*"],
        }
      )
    ).toBe(false);
  });

  test("apiKeyConfigsEqual detects collection differences", () => {
    expect(
      apiKeyConfigsEqual(
        {
          description: "key",
          actions: ["*"],
          collections: ["products"],
        },
        {
          description: "key",
          actions: ["*"],
          collections: ["products", "users"],
        }
      )
    ).toBe(false);
  });

  test("apiKeyConfigsEqual considers autodelete", () => {
    expect(
      apiKeyConfigsEqual(
        {
          description: "key",
          actions: ["*"],
          collections: ["*"],
          autodelete: true,
        },
        {
          description: "key",
          actions: ["*"],
          collections: ["*"],
          autodelete: false,
        }
      )
    ).toBe(false);
  });

  test("multiple keys with same actions but different descriptions", async () => {
    await createApiKey({
      description: "Frontend search",
      actions: ["documents:search"],
      collections: ["products"],
    });
    await createApiKey({
      description: "Backend search",
      actions: ["documents:search"],
      collections: ["products"],
    });

    const frontend = await getApiKey("Frontend search");
    const backend = await getApiKey("Backend search");
    expect(frontend).not.toBeNull();
    expect(backend).not.toBeNull();
    expect(frontend!.id).not.toBe(backend!.id);
  });
});
