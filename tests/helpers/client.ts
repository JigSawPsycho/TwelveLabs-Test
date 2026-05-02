import { TwelveLabs } from "twelvelabs-js";
import { apiKey } from "./env";

let _client: TwelveLabs | undefined;

/**
 * Lazy singleton TwelveLabs client. Each test file imports this and calls
 * getClient() inside a describeIf(hasCredentials) block, so the constructor
 * never runs without credentials.
 */
export const getClient = (): TwelveLabs => {
  if (!_client) {
    _client = new TwelveLabs({ apiKey: apiKey! });
  }
  return _client;
};
