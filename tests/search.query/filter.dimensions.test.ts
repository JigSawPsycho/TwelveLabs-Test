/**
 * Tests for the `filter` parameter on dimension fields (`width`, `height`).
 * Generated via `dimensionFilterTests` so width and height share one
 * template — adding a new dimension test means editing the factory once,
 * not in two places.
 */

import { TwelveLabs } from "twelvelabs-js";

import {
  indexId,
  broadQuery,
  px400VideoIds,
  px800VideoIds,
  hasCredentials,
  hasDimensionVideos,
  describeIf,
} from "../helpers/env";
import { getClient } from "../helpers/client";
import { dimensionFilterTests } from "../helpers/dimensionFilter";

let client: TwelveLabs;

beforeAll(() => {
  if (hasCredentials) client = getClient();
});

describe("search.query filter (dimensions)", () => {
  describeIf(hasDimensionVideos)("filter parameter: width", () => {
    dimensionFilterTests(
      "width",
      { px400: px400VideoIds ?? [], px800: px800VideoIds ?? [] },
      {
        client: () => client,
        indexId: indexId!,
        broadQuery,
      },
    );
  });

  describeIf(hasDimensionVideos)("filter parameter: height", () => {
    dimensionFilterTests(
      "height",
      { px400: px400VideoIds ?? [], px800: px800VideoIds ?? [] },
      {
        client: () => client,
        indexId: indexId!,
        broadQuery,
      },
    );
  });
});
