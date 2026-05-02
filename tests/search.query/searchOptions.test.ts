/**
 * Tests for the `searchOptions` request parameter shape: the SDK enum,
 * missing/empty/duplicate arrays.
 */

import { TwelveLabs } from "twelvelabs-js";
import { BadRequestError } from "twelvelabs-js/api/errors/BadRequestError";
import { JsonError } from "twelvelabs-js/core/schemas/builders/schema-utils/JsonError";
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

describe("search.query searchOptions", () => {
  describeIf(hasCredentials)("happy path", () => {
    // Duplicates are still valid enum values; the SDK serializer does not
    // dedupe before sending. Server tolerates the repeat and returns a normal
    // Page rather than rejecting the request.
    it("given duplicate searchOptions=['visual','visual'] when query runs returns a Page", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual", "visual"],
        queryText: broadQuery,
        pageLimit: 1,
      });
      expect(response).toBeInstanceOf(Page);
    });
  });

  describeIf(hasCredentials)("validation rejection", () => {
    it("given missing searchOptions when query runs throws TypeError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        queryText: broadQuery,
      } as unknown as SearchWrapper.QueryRequest);
      await expect(promise).rejects.toBeInstanceOf(TypeError);
    });

    // SDK iterates searchOptions unconditionally, so an empty array sends zero
    // search_options form fields. Server then rejects the request as missing
    // a required parameter.
    it("given searchOptions=[] (empty array) when query runs throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: [],
        queryText: broadQuery,
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    it("given unsupported search option when query runs throws JsonError (SDK enum validation)", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["telepathy" as unknown as "visual"],
        queryText: broadQuery,
      });
      await expect(promise).rejects.toBeInstanceOf(JsonError);
    });

    it("given unknown search option when query runs throws JsonError before request (search_option_not_supported)", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["telepathy" as unknown as "visual"],
        queryText: broadQuery,
      });
      await expect(promise).rejects.toBeInstanceOf(JsonError);
    });
  });
});
