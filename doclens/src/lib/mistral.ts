import "server-only";

import { Mistral } from "@mistralai/mistralai";

import { env } from "./env";

let client: Mistral | undefined;

/** Lazily constructed so importing this module doesn't require a key at build time. */
export function mistral(): Mistral {
  client ??= new Mistral({ apiKey: env.apiKey });
  return client;
}
