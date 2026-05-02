/**
 * Tests for the `queryText` request parameter: length boundaries (the
 * documented 500-token cap), missing/empty/whitespace inputs, and the
 * empty-result-set shape the SDK returns when a query matches nothing.
 */

import { TwelveLabs, TwelvelabsApi } from "twelvelabs-js";
import { BadRequestError } from "twelvelabs-js/api/errors/BadRequestError";
import { Page } from "twelvelabs-js/core/pagination/Page";
import type { SearchWrapper } from "twelvelabs-js/wrapper/resources/SearchWrapper";

import {
  indexId,
  broadQuery,
  hasCredentials,
  describeIf,
} from "../helpers/env";
import { getClient } from "../helpers/client";

let client: TwelveLabs;

beforeAll(() => {
  if (hasCredentials) client = getClient();
});

describe("search.query queryText", () => {
  describeIf(hasCredentials)("happy path", () => {
    it("given filter that excludes every video when query runs returns empty Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: `{"duration": {"gte": 999999999}}`,
      });

      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
      expect(response.hasNextPage()).toBe(false);
    });

    it("given empty Page when iterated with for-await yields zero items", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: `{"duration": {"gte": 999999999}}`,
      });

      const collected: TwelvelabsApi.SearchItem[] = [];
      for await (const item of response) {
        collected.push(item);
      }
      expect(collected).toHaveLength(0);
    });
  });

  describeIf(hasCredentials)("boundary", () => {
    it("given 500-token query string when query runs returns a Page", async () => {
      const longQuery = Array.from({ length: 500 }, () => "word").join(" ");
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: longQuery,
        pageLimit: 1,
      });
      expect(response).toBeInstanceOf(Page);
    });
  });

  describeIf(hasCredentials)("validation rejection", () => {
    // Server enforces a hard 500-token cap on query_text and rejects past it
    // with parameter_invalid. The 500-token boundary test sits exactly on
    // that cap and is accepted; this one pushes past it.
    it("given >500-token query string when query runs throws BadRequestError", async () => {
      const hugeQuery = "word ".repeat(2500).trim();
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: hugeQuery,
        pageLimit: 1,
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    it("given neither queryText nor queryMediaUrl when query runs throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
      } as unknown as SearchWrapper.QueryRequest);
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    it("given queryText='' (empty string) when query runs throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: "",
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    it("given queryText='   ' (whitespace only) when query runs throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: "   ",
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });
  });
});
