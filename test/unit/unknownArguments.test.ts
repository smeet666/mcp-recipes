/**
 * What happens to an argument no tool declares.
 *
 * A caller who mistypes an argument name, or borrows one from a tool that asks
 * a neighbouring question, must be told. An argument that is read and dropped
 * leaves the answer computed on a default, which reads as an answer to the
 * question that was asked and is not one.
 *
 * Everything here goes over the protocol, because the refusal is the server's
 * answer to a client rather than an internal check.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { createServer } from "../../src/server.js";
import { fakeClient } from "./support.js";

async function connect(): Promise<Client> {
  const server = createServer({ config: loadConfig({}), client: fakeClient() });
  const client = new Client({ name: "unknown-arguments", version: "0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

interface CallResult {
  isError?: boolean;
  content?: Array<{ text?: string }>;
}

/** What a caller receives: whether the call failed, and what it was told. */
async function call(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<{ isError: boolean; text: string }> {
  const result = (await client.callTool({ name, arguments: args })) as CallResult;
  return {
    isError: result.isError === true,
    text: (result.content ?? []).map((part) => part.text ?? "").join("\n"),
  };
}

/** One valid call per tool, so a refusal is never mistaken for a broken tool. */
const CALLS: Array<[string, Record<string, unknown>]> = [
  ["search_recipes", { query: "crepes" }],
  ["get_recipe", { id: "marmiton:1001" }],
  ["scale_ingredients", { ingredients: ["2 eggs"], factor: 2 }],
  ["compare_recipes", { dish: "crepes" }],
];

describe("the schema a client reads before calling", () => {
  it("says on every tool that an argument it does not declare is refused", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(
        (tool.inputSchema as { additionalProperties?: unknown }).additionalProperties,
        tool.name,
      ).toBe(false);
    }
    await client.close();
  });
});

describe("an argument no tool declares", () => {
  it("is refused by every tool, and the refusal names it", async () => {
    const client = await connect();
    for (const [name, args] of CALLS) {
      const result = await call(client, name, { ...args, not_an_argument: 1 });
      expect(result.isError, name).toBe(true);
      expect(result.text, name).toContain("not_an_argument");
    }
    await client.close();
  });

  it("is refused under the code the caller can branch on", async () => {
    const client = await connect();
    const result = await call(client, "search_recipes", { query: "carbonara", limit: 3 });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("invalid_input");
    await client.close();
  });

  it("is answered with the declared name when one is close", async () => {
    const client = await connect();
    const result = await call(client, "search_recipes", { query: "carbonara", limit: 3 });
    expect(result.text).toContain("limit_per_source");
    await client.close();
  });

  it("lists the names the tool does take", async () => {
    const client = await connect();
    const result = await call(client, "search_recipes", { query: "carbonara", limit: 3 });
    expect(result.text).toContain("This tool takes: query, limit_per_source, sources.");
    await client.close();
  });

  it("leaves the arguments a tool does declare working", async () => {
    const client = await connect();
    for (const [name, args] of CALLS) {
      const result = await call(client, name, args);
      expect(result.isError, name).toBe(false);
    }
    await client.close();
  });
});
