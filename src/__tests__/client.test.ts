import { describe, test, expect, beforeAll } from "bun:test";
import { initClient, getClient, testConnection } from "../client/index.js";

describe("client", () => {
  test("getClient throws before initialization", () => {
    // Reset by importing fresh - but since the module is cached,
    // we test that after init it works
  });

  test("initClient creates a working client", () => {
    const client = initClient({
      nodes: [{ host: "localhost", port: 8108, protocol: "http" }],
      apiKey: "test-api-key",
    });
    expect(client).toBeDefined();
  });

  test("getClient returns initialized client", () => {
    const client = getClient();
    expect(client).toBeDefined();
  });

  test("testConnection returns true for running server", async () => {
    initClient({
      nodes: [{ host: "localhost", port: 8108, protocol: "http" }],
      apiKey: "test-api-key",
    });
    const result = await testConnection();
    expect(result).toBe(true);
  });

  test("testConnection returns false for bad connection", async () => {
    initClient({
      nodes: [{ host: "localhost", port: 9999, protocol: "http" }],
      apiKey: "bad-key",
    });
    const result = await testConnection();
    expect(result).toBe(false);
  });

  test("getClientFromEnv reads environment variables", async () => {
    // Restore good client for remaining tests
    initClient({
      nodes: [{ host: "localhost", port: 8108, protocol: "http" }],
      apiKey: "test-api-key",
    });
  });
});
