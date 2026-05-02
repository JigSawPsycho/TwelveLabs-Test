/**
 * Tests for the `groupBy` request parameter (enum_(["video", "clip"])).
 */

import { TwelveLabs, TwelvelabsApi } from "twelvelabs-js";
import { JsonError } from "twelvelabs-js/core/schemas/builders/schema-utils/JsonError";
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

describe("search.query groupBy", () => {
  describeIf(hasCredentials)("happy path", () => {
    it("given groupBy=video when query runs each grouped item exposes an identifier string", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        groupBy: "video",
        pageLimit: 5,
      });

      expect(response).toBeInstanceOf(Page);
      for (const item of response.data) {
        expect(item.id ?? item.videoId).toEqual(expect.any(String));
      }
    });

    it("given groupBy=video when query runs each grouped item with a clips field carries an array", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        groupBy: "video",
        pageLimit: 5,
      });

      for (const item of response.data) {
        if (item.clips !== undefined) {
          expect(Array.isArray(item.clips)).toBe(true);
        }
      }
    });
  });

  describeIf(hasCredentials)("validation rejection", () => {
    it("given groupBy='foo' (invalid enum) when query runs throws JsonError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        groupBy:
          "foo" as unknown as TwelvelabsApi.SearchCreateRequestGroupBy,
      });
      await expect(promise).rejects.toBeInstanceOf(JsonError);
    });
  });
});
