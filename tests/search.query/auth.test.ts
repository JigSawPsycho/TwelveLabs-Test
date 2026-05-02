/**
 * Tests for apiKey handling. The SDK does not declare an Unauthorized
 * error class — every non-400/429 status (including 401/403) surfaces as
 * the base TwelvelabsApiError. Construction itself does not validate the
 * key (it only rejects empty/missing), so the failure surfaces on the
 * first request.
 */

import { TwelveLabs } from "twelvelabs-js";
import { TwelvelabsApiError } from "twelvelabs-js/errors/TwelvelabsApiError";

import {
  indexId,
  broadQuery,
  hasCredentials,
  describeIf,
} from "../helpers/env";

describe("search.query auth", () => {
  describeIf(hasCredentials)("validation rejection", () => {
    const callWithKey = (key: string) =>
      new TwelveLabs({ apiKey: key }).search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        pageLimit: 1,
      });

    it("given an invalid apiKey when query runs throws TwelvelabsApiError", async () => {
      await expect(
        callWithKey("tlk_invalid_key_for_test_xxxxxxxxxxxx"),
      ).rejects.toBeInstanceOf(TwelvelabsApiError);
    });

    // Empty apiKey is rejected by the wrapper constructor synchronously,
    // before any request can be issued, so the failure surfaces as a plain
    // Error from the constructor rather than an async TwelvelabsApiError.
    it("given an empty apiKey the TwelveLabs constructor throws synchronously", () => {
      expect(() => new TwelveLabs({ apiKey: "" })).toThrow(/Provide `apiKey`/);
    });

    it("given a malformed apiKey (no tlk_ prefix) when query runs throws TwelvelabsApiError", async () => {
      await expect(
        callWithKey("not-an-api-key-at-all"),
      ).rejects.toBeInstanceOf(TwelvelabsApiError);
    });
  });
});
