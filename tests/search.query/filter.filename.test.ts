/**
 * Tests for the `filter` parameter on the `filename` field. Only supports
 * exact-equality matching (no range operators).
 */

import { TwelveLabs } from "twelvelabs-js";
import { BadRequestError } from "twelvelabs-js/api/errors/BadRequestError";
import { Page } from "twelvelabs-js/core/pagination/Page";

import {
  indexId,
  broadQuery,
  testnameFilename,
  testnameFilenameVideoId,
  hasCredentials,
  hasFilenameVideo,
  describeIf,
} from "../helpers/env";
import { getClient } from "../helpers/client";
import { collectVideoIds } from "../helpers/pagination";

let client: TwelveLabs;

beforeAll(() => {
  if (hasCredentials) client = getClient();
});

describe("search.query filter (filename)", () => {
  describeIf(hasFilenameVideo)("happy path", () => {
    it("filter filename=<configured> returns the video with that exact filename", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ filename: testnameFilename }),
        pageLimit: 50,
      });
      const ids = await collectVideoIds(response);
      expect(ids).toContain(testnameFilenameVideoId!);
    });

    // Zero — a filename that no uploaded video has must produce an empty
    // result set, proving the filter actually matches and isn't being ignored.
    it("filter filename=<nonexistent> returns no videos (zero matches)", async () => {
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({
          filename: "__nonexistent_filename_for_test__.mp4",
        }),
        pageLimit: 50,
      });
      const ids = await collectVideoIds(response);
      expect(ids.size).toBe(0);
    });
  });

  describeIf(hasCredentials)("boundary", () => {
    // No real filename will be this long, so the server returns an empty
    // result rather than rejecting the filter outright.
    it("filter filename with a >10,000-char string returns an empty Page", async () => {
      const hugeFilename = "x".repeat(10_001);
      const response = await client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ filename: hugeFilename }),
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
    });
  });

  describeIf(hasCredentials)("validation rejection", () => {
    it("filter with filename as a number throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ filename: 123 }),
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    // filename only supports exact-equality matches, so a range operator on
    // it is rejected as an unsupported operator combination.
    it("filter with range operator on filename {filename: {gte: 'x'}} throws BadRequestError", async () => {
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual"],
        queryText: broadQuery,
        filter: JSON.stringify({ filename: { gte: "x" } }),
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });
  });
});
