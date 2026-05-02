/**
 * Tests for the `filter` parameter on the `duration` field. Bucketed
 * happy-path tests scope the candidate pool with the `id` filter so the
 * property filter under test is the only variable.
 */

import { TwelveLabs } from "twelvelabs-js";
import { BadRequestError } from "twelvelabs-js/api/errors/BadRequestError";
import { Page } from "twelvelabs-js/core/pagination/Page";

import {
  indexId,
  broadQuery,
  fiveSecVideoIds,
  tenSecVideoIds,
  hasCredentials,
  hasDurationVideos,
  describeIf,
} from "../helpers/env";
import { getClient } from "../helpers/client";
import { collectVideoIds } from "../helpers/pagination";

let client: TwelveLabs;

beforeAll(() => {
  if (hasCredentials) client = getClient();
});

describe("search.query filter (duration)", () => {
  describeIf(hasDurationVideos)("happy path", () => {
    const allDurationIds = (): string[] => [
      ...(fiveSecVideoIds ?? []),
      ...(tenSecVideoIds ?? []),
    ];

    describe("filter duration<=7", () => {
      let ids: Set<string>;
      beforeAll(async () => {
        const response = await client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          filter: JSON.stringify({
            id: allDurationIds(),
            duration: { lte: 7 },
          }),
          pageLimit: 50,
        });
        ids = await collectVideoIds(response);
      });

      it("includes the 5-second videos", () => {
        for (const id of fiveSecVideoIds!) expect(ids).toContain(id);
      });

      it("excludes the 10-second videos", () => {
        for (const id of tenSecVideoIds!) expect(ids).not.toContain(id);
      });
    });

    describe("filter duration>=8", () => {
      let ids: Set<string>;
      beforeAll(async () => {
        const response = await client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          filter: JSON.stringify({
            id: allDurationIds(),
            duration: { gte: 8 },
          }),
          pageLimit: 50,
        });
        ids = await collectVideoIds(response);
      });

      it("includes the 10-second videos", () => {
        for (const id of tenSecVideoIds!) expect(ids).toContain(id);
      });

      it("excludes the 5-second videos", () => {
        for (const id of fiveSecVideoIds!) expect(ids).not.toContain(id);
      });
    });

    // Zero — bound is unsatisfiable for the candidate pool, so the filter
    // must produce no results. Combined with the id scope, this proves the
    // filter actually narrows rather than silently passing everything through.
    describe("filter duration>=999999 (zero matches)", () => {
      let ids: Set<string>;
      beforeAll(async () => {
        const response = await client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          filter: JSON.stringify({
            id: allDurationIds(),
            duration: { gte: 999999 },
          }),
          pageLimit: 50,
        });
        ids = await collectVideoIds(response);
      });

      it("returns no videos", () => {
        expect(ids.size).toBe(0);
      });
    });
  });

  describeIf(hasCredentials)("boundary", () => {
    // gte=MAX_SAFE_INTEGER is satisfied by no real video duration, so the
    // filter narrows the result set to nothing.
    it("filter duration gte=Number.MAX_SAFE_INTEGER returns an empty Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({
          duration: { gte: Number.MAX_SAFE_INTEGER },
        }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
    });

    // lte=MAX_SAFE_INTEGER is satisfied by every real duration, so the
    // filter degenerates to a passthrough and the search returns its normal
    // populated Page.
    it("filter duration lte=Number.MAX_SAFE_INTEGER returns a Page with one or more results", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({
          duration: { lte: Number.MAX_SAFE_INTEGER },
        }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data.length).toBeGreaterThan(0);
    });

    // gte=MIN_SAFE_INTEGER is satisfied by every real duration, so the
    // filter is also a passthrough.
    it("filter duration gte=Number.MIN_SAFE_INTEGER returns a Page with one or more results", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({
          duration: { gte: Number.MIN_SAFE_INTEGER },
        }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data.length).toBeGreaterThan(0);
    });

    // lte=MIN_SAFE_INTEGER is satisfied by no real duration, so the filter
    // narrows to nothing.
    it("filter duration lte=Number.MIN_SAFE_INTEGER returns an empty Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({
          duration: { lte: Number.MIN_SAFE_INTEGER },
        }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
    });

    // Negative duration as an exact-equality value is accepted by the server
    // and treated as a literal match against -1 (which no real video has),
    // so the result is an empty Page rather than a rejection.
    it("filter duration=-1 (exact) returns an empty Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ duration: -1 }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
    });

    // gte=-1 is satisfied by every non-negative duration, so the filter
    // matches every video; result is a populated Page.
    it("filter duration gte=-1 (negative operator value) returns a Page with one or more results", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ duration: { gte: -1 } }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data.length).toBeGreaterThan(0);
    });

    // lte=-1 is satisfied by no non-negative duration, so the filter matches
    // nothing; result is a Page with empty data.
    it("filter duration lte=-1 (negative operator value) returns an empty Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ duration: { lte: -1 } }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
    });

    // Inverted range is satisfiable by no real value, but the bounds
    // themselves are valid, so the server accepts the filter and the
    // result narrows to nothing rather than rejecting outright.
    it("filter duration with inverted range {gte:10, lte:5} returns an empty Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ duration: { gte: 10, lte: 5 } }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
    });
  });

  describeIf(hasCredentials)("validation rejection", () => {
    it("filter with duration as a string value throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ duration: "five" }),
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    it("given filter with invalid operator when query runs throws BadRequestError (search_filter_invalid)", async () => {
      await expect(
        client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          filter: `{"duration": {"bogus_op": 1}}`,
        }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });
  });
});
