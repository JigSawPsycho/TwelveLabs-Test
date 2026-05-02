/**
 * Color-matching tests against four uploaded test videos:
 *   - RED   solo: solid red clip, voice says "red"
 *   - BLUE  solo: solid blue clip, voice says "blue"
 *   - GREEN solo: solid green clip, voice says "green"
 *   - RGB:        red+blue+green visual content, no audio track
 *
 * For each color, a visual query should rank the matching solo video as the
 * strongest (top) result. The AND/OR divergence and default-operator tests
 * further down still rely on the silent RGB video to prove operator
 * semantics, which is why hasColorVideos gates this whole file.
 */

import { TwelveLabs, TwelvelabsApi } from "twelvelabs-js";
import { JsonError } from "twelvelabs-js/core/schemas/builders/schema-utils/JsonError";

import {
  indexId,
  redVideoId,
  blueVideoId,
  greenVideoId,
  rgbVideoId,
  hasCredentials,
  hasColorVideos,
  describeIf,
} from "../helpers/env";
import { getClient } from "../helpers/client";
import { collectVideoIds } from "../helpers/pagination";

let client: TwelveLabs;

beforeAll(() => {
  if (hasCredentials) client = getClient();
});

describe("search.query operator", () => {
  describeIf(hasColorVideos)("happy path", () => {
    type Color = "red" | "blue" | "green";
    const soloVideoId: Record<Color, string> = {
      red: redVideoId!,
      blue: blueVideoId!,
      green: greenVideoId!,
    };

    describe.each<Color>(["red", "blue", "green"])("query=%s", (color) => {
      // Top result indicates strongest match; for an unambiguous color query
      // the matching solo video should out-rank the RGB video (which only
      // partially matches the queried color visually).
      it("given searchOptions=[visual] returns the matching solo color video as the top (highest-scoring) result", async () => {
        const response = await client.search.query({
          indexId: indexId!,
          searchOptions: ["visual"],
          queryText: color,
          pageLimit: 50,
        });
        expect(response.data[0]?.videoId).toBe(soloVideoId[color]);
      });
    });

    // RGB has visual=red but no transcript, so OR (union) returns it while
    // AND (intersection) drops it. Splitting into per-operator tests means a
    // failure points at exactly which operator's behavior broke; the subset
    // invariant is its own claim and gets its own test.
    describe("operator=or vs operator=and on query=red, visual+transcription, lexical", () => {
      let orIds: Set<string>;
      let andIds: Set<string>;

      beforeAll(async () => {
        const common = {
          indexId: indexId!,
          searchOptions: [
            "visual",
            "transcription",
          ] as TwelvelabsApi.SearchCreateRequestSearchOptionsItem[],
          transcriptionOptions: [
            "lexical"
          ] as TwelvelabsApi.SearchCreateRequestTranscriptionOptionsItem[],
          queryText: "red",
          pageLimit: 50,
        };
        const [orResp, andResp] = await Promise.all([
          client.search.query({ ...common, operator: "or" }),
          client.search.query({ ...common, operator: "and" }),
        ]);
        [orIds, andIds] = await Promise.all([
          collectVideoIds(orResp),
          collectVideoIds(andResp),
        ]);
      });

      it("operator=or returns the silent RGB video (visual matches under union)", () => {
        expect(orIds).toContain(rgbVideoId!);
      });

      it("operator=and excludes the silent RGB video (no transcript breaks intersection)", () => {
        expect(andIds).not.toContain(rgbVideoId!);
      });

      it("operator=and result set is a subset of operator=or result set", () => {
        for (const id of andIds) expect(orIds).toContain(id);
      });
    });

    it("given visual+transcription on query=red with transcriptionOptions=[lexical], omitted operator matches operator=or (default is or)", async () => {
      const common = {
        indexId: indexId!,
        searchOptions: [
          "visual",
          "transcription",
        ] as TwelvelabsApi.SearchCreateRequestSearchOptionsItem[],
        transcriptionOptions: [
          "lexical",
        ] as TwelvelabsApi.SearchCreateRequestTranscriptionOptionsItem[],
        queryText: "red",
        pageLimit: 50,
      };
      const [defaultResp, orResp] = await Promise.all([
        client.search.query(common),
        client.search.query({ ...common, operator: "or" }),
      ]);
      const [defaultIds, orIds] = await Promise.all([
        collectVideoIds(defaultResp),
        collectVideoIds(orResp),
      ]);
      expect(Array.from(defaultIds).sort()).toEqual(Array.from(orIds).sort());
    });

    it("given visual+transcription on query=red with transcriptionOptions=[semantic], omitted operator matches operator=or (default is or)", async () => {
      const common = {
        indexId: indexId!,
        searchOptions: [
          "visual",
          "transcription",
        ] as TwelvelabsApi.SearchCreateRequestSearchOptionsItem[],
        transcriptionOptions: [
          "semantic",
        ] as TwelvelabsApi.SearchCreateRequestTranscriptionOptionsItem[],
        queryText: "red",
        pageLimit: 50,
      };
      const [defaultResp, orResp] = await Promise.all([
        client.search.query(common),
        client.search.query({ ...common, operator: "or" }),
      ]);
      const [defaultIds, orIds] = await Promise.all([
        collectVideoIds(defaultResp),
        collectVideoIds(orResp),
      ]);
      expect(Array.from(defaultIds).sort()).toEqual(Array.from(orIds).sort());
    });
  });

  describeIf(hasColorVideos)("validation rejection", () => {
    it("given invalid operator value when query runs throws JsonError (SDK enum validation)", async () => {
      // The SDK declares `operator` as enum_(["or", "and"]); serialization
      // rejects "xor" client-side before any HTTP request is sent.
      const promise = client.search.query({
        indexId: indexId!,
        searchOptions: ["visual", "transcription"],
        queryText: "red",
        operator: "xor" as unknown as TwelvelabsApi.SearchCreateRequestOperator,
        pageLimit: 5,
      });
      await expect(promise).rejects.toBeInstanceOf(JsonError);
    });
  });
});
