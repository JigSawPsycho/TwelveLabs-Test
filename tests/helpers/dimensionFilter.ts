/**
 * Width and height filter blocks were textually 95% identical templates
 * with only the field name changing. This factory generates one set of
 * dimension-filter tests parametrized by the field, used twice in
 * `tests/search.query/filter.dimensions.test.ts`.
 */

import { TwelveLabs } from "twelvelabs-js";
import { BadRequestError } from "twelvelabs-js/api/errors/BadRequestError";
import { Page } from "twelvelabs-js/core/pagination/Page";

import { collectVideoIds } from "./pagination";

export type DimensionField = "width" | "height";

export interface DimensionBuckets {
  /** Video IDs whose dimension is ~400px (the 400 bucket). */
  px400: string[];
  /** Video IDs whose dimension is ~800px (the 800 bucket). */
  px800: string[];
}

interface FactoryArgs {
  client: () => TwelveLabs;
  indexId: string;
  broadQuery: string;
}

/**
 * Generates the full dimension-filter test surface for one field. Mirrors
 * the structure of `filter.duration.test.ts`: bucketed happy-path describes
 * (each scoped by `id` so the property filter is the only variable),
 * boundary describes for MAX/MIN_SAFE_INTEGER and negatives, and validation
 * rejection for type mismatches and bogus operators.
 */
export const dimensionFilterTests = (
  field: DimensionField,
  buckets: DimensionBuckets,
  ctx: FactoryArgs,
): void => {
  const allIds = [...buckets.px400, ...buckets.px800];
  const queryFilter = (extra: Record<string, unknown>) =>
    ctx.client().search.query({
      indexId: ctx.indexId,
      searchOptions: ["visual"],
      queryText: ctx.broadQuery,
      filter: JSON.stringify({ id: allIds, ...extra }),
      pageLimit: 50,
    });

  // Real uploads aren't always exactly the nominal pixel size, so the
  // bucket filters use a ±50px tolerance window around 400 and 800. This
  // keeps the assertion ("the 400-ish bucket lands in the 400-ish window
  // and not the 800-ish window") robust to small encoder/scaling drift.
  describe(`filter ${field} 350-450 (400 bucket, ±50 tolerance)`, () => {
    let ids: Set<string>;
    beforeAll(async () => {
      ids = await collectVideoIds(
        await queryFilter({ [field]: { gte: 350, lte: 450 } }),
      );
    });

    it("includes the 400x400 videos", () => {
      for (const id of buckets.px400) expect(ids).toContain(id);
    });

    it("excludes the 800x800 videos", () => {
      for (const id of buckets.px800) expect(ids).not.toContain(id);
    });
  });

  describe(`filter ${field} 750-850 (800 bucket, ±50 tolerance)`, () => {
    let ids: Set<string>;
    beforeAll(async () => {
      ids = await collectVideoIds(
        await queryFilter({ [field]: { gte: 750, lte: 850 } }),
      );
    });

    it("includes the 800x800 videos", () => {
      for (const id of buckets.px800) expect(ids).toContain(id);
    });

    it("excludes the 400x400 videos", () => {
      for (const id of buckets.px400) expect(ids).not.toContain(id);
    });
  });

  describe(`filter ${field}=99999 (zero matches)`, () => {
    let ids: Set<string>;
    beforeAll(async () => {
      ids = await collectVideoIds(await queryFilter({ [field]: 99999 }));
    });

    it("returns no videos", () => {
      expect(ids.size).toBe(0);
    });
  });

  // Range form covers both buckets at once. Range widened to 350-850 so
  // the ±50 tolerance around the 400 and 800 buckets both fall safely
  // inside.
  describe(`filter ${field} range {gte:350, lte:850} (covers both buckets, ±50 tolerance)`, () => {
    let ids: Set<string>;
    beforeAll(async () => {
      ids = await collectVideoIds(
        await queryFilter({ [field]: { gte: 350, lte: 850 } }),
      );
    });

    it("includes the 400x400 videos", () => {
      for (const id of buckets.px400) expect(ids).toContain(id);
    });

    it("includes the 800x800 videos", () => {
      for (const id of buckets.px800) expect(ids).toContain(id);
    });
  });

  describe(`${field} boundary values`, () => {
    const queryUnscoped = (extra: Record<string, unknown>) =>
      ctx.client().search.query({
        indexId: ctx.indexId,
        searchOptions: ["visual"],
        queryText: ctx.broadQuery,
        filter: JSON.stringify(extra),
      });

    // Passthrough boundary tests assert "filter is a no-op" by comparing
    // against a no-filter baseline computed once for this describe. Avoids
    // the fragile `data.length > 0` assertion, which fails for the wrong
    // reason on an index that happens to return zero results for broadQuery.
    let baselineLength: number;
    beforeAll(async () => {
      const baseline = await ctx.client().search.query({
        indexId: ctx.indexId,
        searchOptions: ["visual"],
        queryText: ctx.broadQuery,
      });
      baselineLength = baseline.data.length;
    });

    it(`filter ${field} gte=Number.MAX_SAFE_INTEGER returns an empty Page`, async () => {
      const response = await queryUnscoped({
        [field]: { gte: Number.MAX_SAFE_INTEGER },
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
    });

    it(`filter ${field} lte=Number.MAX_SAFE_INTEGER matches the no-filter baseline (passthrough)`, async () => {
      const response = await queryUnscoped({
        [field]: { lte: Number.MAX_SAFE_INTEGER },
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toHaveLength(baselineLength);
    });

    it(`filter ${field} gte=Number.MIN_SAFE_INTEGER matches the no-filter baseline (passthrough)`, async () => {
      const response = await queryUnscoped({
        [field]: { gte: Number.MIN_SAFE_INTEGER },
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toHaveLength(baselineLength);
    });

    it(`filter ${field} lte=Number.MIN_SAFE_INTEGER returns an empty Page`, async () => {
      const response = await queryUnscoped({
        [field]: { lte: Number.MIN_SAFE_INTEGER },
      });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
    });

    it(`filter ${field}=-1 (exact) returns an empty Page`, async () => {
      const response = await queryUnscoped({ [field]: -1 });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
    });

    it(`filter ${field} gte=-1 (negative operator value) matches the no-filter baseline (passthrough)`, async () => {
      const response = await queryUnscoped({ [field]: { gte: -1 } });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toHaveLength(baselineLength);
    });

    it(`filter ${field} lte=-1 (negative operator value) returns an empty Page`, async () => {
      const response = await queryUnscoped({ [field]: { lte: -1 } });
      expect(response).toBeInstanceOf(Page);
      expect(response.data).toEqual([]);
    });
  });

  describe(`${field} validation rejection`, () => {
    it(`filter with ${field} as a string value throws BadRequestError`, async () => {
      const promise = ctx.client().search.query({
        indexId: ctx.indexId,
        searchOptions: ["visual"],
        queryText: ctx.broadQuery,
        filter: JSON.stringify({ [field]: "wide" }),
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });

    it(`filter with bogus operator on ${field} throws BadRequestError`, async () => {
      const promise = ctx.client().search.query({
        indexId: ctx.indexId,
        searchOptions: ["visual"],
        queryText: ctx.broadQuery,
        filter: JSON.stringify({ [field]: { bogus_op: 400 } }),
      });
      await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    });
  });
};
