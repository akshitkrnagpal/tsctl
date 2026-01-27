import { getClient } from "../client/index.js";
import type { AnalyticsRuleConfig } from "../types/index.js";

/**
 * Get an analytics rule from Typesense
 */
export async function getAnalyticsRule(
  name: string
): Promise<AnalyticsRuleConfig | null> {
  const client = getClient();

  try {
    const data = await client.analytics.rules(name).retrieve();

    return {
      name: data.name,
      type: data.type as AnalyticsRuleConfig["type"],
      collection: data.collection,
      event_type: data.event_type as AnalyticsRuleConfig["event_type"],
      rule_tag: data.rule_tag,
      params: data.params,
    };
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "httpStatus" in error &&
      (error.httpStatus === 404 || error.httpStatus === 400)
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * List all analytics rules from Typesense
 */
export async function listAnalyticsRules(): Promise<AnalyticsRuleConfig[]> {
  const client = getClient();

  try {
    const response = await client.analytics.rules().retrieve();
    const rules = response.rules || [];

    return rules.map((rule) => {
      const config: AnalyticsRuleConfig = {
        name: rule.name,
        type: rule.type as AnalyticsRuleConfig["type"],
        collection: rule.collection,
        event_type: rule.event_type as AnalyticsRuleConfig["event_type"],
      };
      if (rule.rule_tag) config.rule_tag = rule.rule_tag;
      if (rule.params) config.params = rule.params;
      return config;
    });
  } catch (error: unknown) {
    // If analytics feature isn't available, return empty array
    if (
      error &&
      typeof error === "object" &&
      "httpStatus" in error &&
      (error.httpStatus === 404 || error.httpStatus === 400)
    ) {
      return [];
    }
    throw error;
  }
}

/**
 * Create an analytics rule in Typesense
 */
export async function createAnalyticsRule(
  config: AnalyticsRuleConfig
): Promise<void> {
  const client = getClient();

  await client.analytics.rules().upsert(config.name, {
    type: config.type,
    collection: config.collection,
    event_type: config.event_type,
    rule_tag: config.rule_tag,
    params: config.params,
  });
}

/**
 * Update an analytics rule in Typesense
 */
export async function updateAnalyticsRule(
  config: AnalyticsRuleConfig
): Promise<void> {
  const client = getClient();

  await client.analytics.rules().upsert(config.name, {
    type: config.type,
    collection: config.collection,
    event_type: config.event_type,
    rule_tag: config.rule_tag,
    params: config.params,
  });
}

/**
 * Delete an analytics rule from Typesense
 */
export async function deleteAnalyticsRule(name: string): Promise<void> {
  const client = getClient();
  await client.analytics.rules(name).delete();
}

/**
 * Compare two analytics rule configs for equality
 */
export function analyticsRuleConfigsEqual(
  a: AnalyticsRuleConfig,
  b: AnalyticsRuleConfig
): boolean {
  // Normalize by removing undefined values
  const normalize = (config: AnalyticsRuleConfig) => {
    const result: Record<string, unknown> = {
      name: config.name,
      type: config.type,
      collection: config.collection,
      event_type: config.event_type,
    };
    if (config.rule_tag !== undefined) result.rule_tag = config.rule_tag;
    if (config.params !== undefined) result.params = config.params;
    return result;
  };

  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}
