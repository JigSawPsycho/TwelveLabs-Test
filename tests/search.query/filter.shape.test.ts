/**
 * Tests for the `filter` parameter as a string shape (independent of any
 * specific field). Covers null handling, malformed/non-object JSON, and
 * unknown top-level keys.
 */

import { TwelveLabs } from "twelvelabs-js";
import { BadRequestError } from "twelvelabs-js/api/errors/BadRequestError";
import { Page } from "twelvelabs-js/core/pagination/Page";

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

describe("search.query filter (shape)", () => {
  describeIf(hasCredentials)("happy path", () => {
    // SDK signature is `filter?: string`; passing null is a TS error in strict
    // mode, so we cast through. Empirically the runtime treats null as "no
    // filter" rather than rejecting it: the call resolves to a normal Page
    // instead of throwing. Pinned here so a future SDK change that starts
    // rejecting null becomes a visible test failure.
    it("filter=null when query runs returns a Page (treated as no filter)", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: null as unknown as string,
        pageLimit: 1,
      });
      expect(response).toBeInstanceOf(Page);
    });

    // Server silently ignores unknown top-level filter keys rather than
    // rejecting the request. Pinned here so a future tightening (the server
    // starting to reject unknowns) shows up as a test failure.
    it("filter with unknown top-level key {bogus_field: 5} returns a Page (server ignores unknown keys)", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ bogus_field: 5 }),
      });
      expect(response).toBeInstanceOf(Page);
    });
  });

  describeIf(hasCredentials)("validation rejection", () => {
    it("given malformed filter when query runs throws BadRequestError", async () => {
      await expect(
        client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: broadQuery,
          filter: "{not-json",
        }),
      ).rejects.toBeInstanceOf(BadRequestError);
    });

    it("filter as a JSON array (not an object) throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify([{ duration: 5 }]),
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    it("filter as a JSON scalar (not an object) throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify(42),
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });
  });
});
