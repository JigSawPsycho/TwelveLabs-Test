/**
 * Response-contract tests for `client.search.query`. Pins the shape of the
 * Page object, the SDK function surface, the documented "all options
 * together" call, the documented text-search example, and required-input
 * validation that doesn't fit a single parameter (missing indexId,
 * nonexistent index ID).
 */

import { TwelveLabs } from "twelvelabs-js";
import { BadRequestError } from "twelvelabs-js/api/errors/BadRequestError";
import { TwelvelabsApiError } from "twelvelabs-js/errors/TwelvelabsApiError";
import { Page } from "twelvelabs-js/core/pagination/Page";
import type { SearchWrapper } from "twelvelabs-js/wrapper/resources/SearchWrapper";

import {
  indexId,
  broadQuery,
  hasCredentials,
  describeIf,
} from "../helpers/env";
import { getClient } from "../helpers/client";
import { NONEXISTENT_VIDEO_ID } from "../helpers/pagination";

let client: TwelveLabs;

beforeAll(() => {
  if (hasCredentials) client = getClient();
});

describe("search.query contract", () => {
  describeIf(hasCredentials)("happy path", () => {
    it("given a successful query when response inspected exposes Page with AsyncIterable contract", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        pageLimit: 1,
      });

      expect(response).toBeInstanceOf(Page);
      expect(typeof response[Symbol.asyncIterator]).toBe("function");
      expect(typeof response.hasNextPage).toBe("function");
      expect(typeof response.getNextPage).toBe("function");
      expect(Array.isArray(response.data)).toBe(true);
    });

    it("given a TwelveLabs client when inspected exposes search.query function", () => {
      expect(client.search).toBeDefined();
      expect(typeof client.search.query).toBe("function");
    });

    it("given every documented option parameter together with transcriptionOptions=[lexical] when query runs returns result Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual", "transcription"],
        queryText: broadQuery,
        transcriptionOptions: ["lexical"],
        groupBy: "clip",
        operator: "or",
        pageLimit: 5,
        filter: "{}",
        includeUserMetadata: true,
      });
      expect(response).toBeInstanceOf(Page);
    });

    it("given every documented option parameter together with transcriptionOptions=[semantic] when query runs returns result Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual", "transcription"],
        queryText: broadQuery,
        transcriptionOptions: ["semantic"],
        groupBy: "clip",
        operator: "or",
        pageLimit: 5,
        filter: "{}",
        includeUserMetadata: true,
      });
      expect(response).toBeInstanceOf(Page);
    });

    it("given documented text-search example params when query runs returns Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual", "transcription"],
        queryText: broadQuery,
        groupBy: "video",
        operator: "or",
        pageLimit: 5,
      });
      expect(response).toBeInstanceOf(Page);
    });
  });

  describeIf(hasCredentials)("validation rejection", () => {
    it("given missing indexId when query runs throws BadRequestError", async () => {
      const promise = client.search.query({
        searchOptions: ["visual"],
        queryText: broadQuery,
      } as unknown as SearchWrapper.QueryRequest);
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    it("given nonexistent index ID when query runs throws TwelvelabsApiError", async () => {
      const promise = client.search.query({
        indexId: NONEXISTENT_VIDEO_ID,
        searchOptions: ["visual"],
        queryText: broadQuery,
      });
      await expect(promise).rejects.toBeInstanceOf(TwelvelabsApiError);
    });

    // Documented under the `index_not_supported_for_search` error code.
    // Same call shape as the previous test — kept as a separate `it` so a
    // future SDK change that distinguishes index-not-found from
    // index-not-supported can split this without ambiguity.
    it("given nonexistent or non-Marengo index when query runs throws TwelvelabsApiError (index_not_supported_for_search)", async () => {
      const promise = client.search.query({
        indexId: NONEXISTENT_VIDEO_ID,
        searchOptions: ["visual"],
        queryText: broadQuery,
      });
      await expect(promise).rejects.toBeInstanceOf(TwelvelabsApiError);
    });
  });
});
