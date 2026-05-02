# TwelveLabs-Test

Integration test suite for `client.search.query` from the
[`twelvelabs-js`](https://www.npmjs.com/package/twelvelabs-js) SDK,
written in TypeScript with Jest. Tests hit the real API (no mocks) and
were originally organized using the **ZOMBIES** heuristic (Zero, One,
Many, Boundaries, Interfaces, Exceptions, Simple scenarios). They have
since been split into per-parameter files under `tests/search.query/`.

## Approach

- **Integration-first.** Every test hits the real TwelveLabs API. Mocking
  the SDK would only re-validate the SDK's own type checks; the
  assignment asks for SDK *functionality* coverage, which only real
  responses prove.
- **Per-parameter file split.** One `*.test.ts` per `search.query` request
  parameter (`queryText`, `pageLimit`, `operator`, `groupBy`,
  `searchOptions`, `transcriptionOptions`, `requestOptions`, plus
  `filter.<field>` files). A failing assertion points at the exact knob.
- **ZOMBIES heuristic** drives test selection inside each file. Standard
  describe layout: `happy path`, `boundary`, `validation rejection`.
- **Graceful skip via `describeIf`.** Only `TWELVELABS_API_KEY` and
  `TWELVELABS_INDEX_ID` are mandatory; every fixture-dependent group
  skips cleanly without those fixtures (color tests, dimension tests,
  duration tests, filename test, image-search tests).
- **Error class taxonomy preserved.** `BadRequestError` (HTTP 400),
  `JsonError` (SDK enum/serializer rejection — never sent), and
  `TwelvelabsApiError` (everything else, including 401/403/404/429) are
  asserted explicitly. Collapsing all to "throws" would hide regressions
  where the SDK starts returning a different class.

## Scope decisions

The `search.query` parameter surface is large. Choices made for this
24-hour window:

| Parameter                | Coverage                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `queryText`              | length boundary (500-token cap), empty/whitespace, missing                                              |
| `queryMediaType` / `Url` | image happy path, image+text, missing URL, 404 URL, non-URL, non-image content, invalid enum            |
| `searchOptions`          | missing, empty array, duplicates, unknown enum                                                           |
| `transcriptionOptions`   | invalid enum (happy paths exercised in `contract` and `operator`)                                        |
| `groupBy`                | `video`, `clip`, invalid enum                                                                             |
| `operator`               | AND vs OR semantic divergence on real fixtures, default behavior, invalid enum                            |
| `pageLimit`              | 1 / 10 / 50 / -1 / 51, multi-page iteration, for-await across pages                                       |
| `filter` (duration)      | bucketed happy path, MAX/MIN_SAFE_INTEGER, negatives, inverted range, type & operator rejection           |
| `filter` (width/height)  | factory-generated mirror of `duration` coverage                                                           |
| `filter` (filename)      | exact match, miss, 10k-char string, type & operator rejection                                            |
| `filter` (id)            | non-array, empty, non-string entries, malformed format, 1k-entry array                                   |
| `filter` (shape)         | null, malformed JSON, JSON array/scalar, unknown top-level key                                           |
| `requestOptions`         | timeout, abortSignal pre-aborted, sub-millisecond timeout                                                |
| `search.retrieve`        | invalid token, empty token, null token (happy path implicit via pagination tests in `pageLimit.test.ts`) |

`sortOption` is not exercised separately — `search.query` does not accept
it as a documented parameter (results are score-ordered by default).

## Layout

```
assets/                      sample .mp4 fixtures used to seed the test index
scripts/
  upload.js                  upload a single video and poll until indexed
  setup.js                   bulk-upload every assets/*.mp4 to an empty index
tests/
  helpers/
    client.ts                shared TwelveLabs client
    env.ts                   env var loader + describeIf gating
    pagination.ts            pagination helpers
    dimensionFilter.ts       dimension filter helpers
  search.query/
    auth.test.ts             auth / failure scenarios
    contract.test.ts         compile-time + response shape guards
    queryText.test.ts
    queryMedia.test.ts       image-search (skips without TWELVELABS_IMAGE_URL)
    pageLimit.test.ts
    operator.test.ts
    searchOptions.test.ts
    groupBy.test.ts
    transcriptionOptions.test.ts
    requestOptions.test.ts
    retrieve.test.ts
    filter.dimensions.test.ts
    filter.duration.test.ts
    filter.filename.test.ts
    filter.id.test.ts
    filter.shape.test.ts
.github/workflows/test.yml   CI: typecheck + tests on PRs and pushes to main
```

## Versions

| Package                     | Version    |
| --------------------------- | ---------- |
| `twelvelabs-js`             | ^1.2.3     |
| `typescript`                | ^6.0.3     |
| `jest`                      | ^30.3.0    |
| `ts-jest`                   | ^29.4.9    |
| `@types/jest`               | ^30.0.0    |
| `@types/node`               | ^25.6.0    |
| `dotenv`                    | ^17.4.2    |
| Node.js (CI)                | 20         |

## Setup

```sh
npm install
```

### Seed an index

The filter tests need specific fixture videos already indexed (color,
duration, dimensions, filename). To populate a fresh, empty index from
the bundled `assets/`:

```sh
npm run setup -- <indexId> <apiKey>
# refuses if the index is non-empty; pass --force to override
npm run setup -- <indexId> <apiKey> --force
```

Single-file upload:

```sh
npm run upload -- <filePath> <indexId> <apiKey>
```

After uploading, capture the returned `videoId`s and put them in `.env`
(see below) so the filter test groups don't skip.

### Fixture videos

`assets/` ships ten `.mp4` files. Map of file → consumer → purpose:

| File                | Used by                     | Purpose                                                                       |
| ------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| `red-only.mp4`      | `operator.test.ts`          | Solid red, voice says "red"; should rank as top result for `red` visual query |
| `blue-only.mp4`     | `operator.test.ts`          | Solid blue, voice says "blue"                                                  |
| `green-only.mp4`    | `operator.test.ts`          | Solid green, voice says "green"                                                |
| `true-blue.mp4`     | (spare) optional second blue| Extra blue fixture for ranking sanity; not directly required                   |
| `rgb-test.mp4`      | `operator.test.ts`          | R+G+B visual content, **no audio track** — proves AND requires transcript     |
| `5secvid.mp4`       | `filter.duration.test.ts`   | ~5-second duration bucket                                                      |
| `10secvid.mp4`      | `filter.duration.test.ts`   | ~10-second duration bucket                                                     |
| `400x400vid.mp4`    | `filter.dimensions.test.ts` | 400×400 dimension bucket                                                       |
| `800x800vid.mp4`    | `filter.dimensions.test.ts` | 800×800 dimension bucket                                                       |
| `test-filename.mp4` | `filter.filename.test.ts`   | Exact-filename match target                                                    |

Capture each `videoId` printed by `npm run setup` and populate the
matching `.env` entry. See `.env.example`.

## Configure credentials

Edit `.env`:

| Variable                   | Required | Notes                                                            |
| -------------------------- | -------- | ---------------------------------------------------------------- |
| `TWELVELABS_API_KEY`       | yes      | API key for your TwelveLabs account.                             |
| `TWELVELABS_INDEX_ID`      | yes      | Existing index (Marengo engine) with at least one video indexed. |
| `TWELVELABS_QUERY_TEXT`    | no       | Text query likely to return results. Defaults to `number`.       |
| `TWELVELABS_IMAGE_URL`     | no       | Public image URL; image-search tests skip if absent.             |
| `RED_VIDEO_ID`             | no       | Color filter fixtures. All four needed to enable color tests.    |
| `BLUE_VIDEO_ID`            | no       |                                                                  |
| `GREEN_VIDEO_ID`           | no       |                                                                  |
| `RGB_VIDEO_ID`             | no       |                                                                  |
| `5_SEC_VID_IDS`            | no       | Comma-separated. Duration tests need both 5s and 10s sets.       |
| `10_SEC_VID_IDS`           | no       |                                                                  |
| `400X400PX_VID_IDS`        | no       | Comma-separated. Dimension tests need both 400 and 800 sets.     |
| `800X800PX_VID_IDS`        | no       |                                                                  |
| `TESTNAME_FILENAME`        | no       | Filename filter test pair.                                       |
| `TESTNAME_FILENAME_VID_ID` | no       |                                                                  |

Test groups skip cleanly via `describeIf` when their fixtures are
missing; only the API key + index id are mandatory. Compile-time guard
tests run regardless.

## Assumptions

- The configured `TWELVELABS_INDEX_ID` is a **Marengo-engine** index with
  at least one indexed video. Pegasus indexes will fail every visual test
  with `index_not_supported_for_search`.
- `TWELVELABS_QUERY_TEXT` (default: `"number"`) returns at least one
  result against the configured index. Boundary tests that assert
  "passthrough filter == baseline result count" still pass on a zero-
  result baseline, but carry less signal.
- The configured API key has not been rate-limited. The suite issues
  ~80 real API calls per run; on a constrained tier, `--runInBand` plus
  request-level retries (see `requestOptions`) may not be enough — a
  higher-quota key is the simplest fix.
- Real uploads of "400×400" or "800×800" videos are not always exact-
  pixel due to encoder rescaling drift. Dimension assertions use ±50px
  tolerance windows.

## Not covered

Explicit non-goals:

- **Rate-limit behavior (429 / `TooManyRequestsError`).** Hammering the
  API to provoke 429 is anti-social; not exercised. The class still
  surfaces through the broader `TwelvelabsApiError` assertions.
- **Pegasus engine indexes.** `search.query` requires Marengo; out of
  scope.
- **Audio-only search.** `queryMediaType` is `enum_(["image"])`; audio
  is rejected client-side and pinned in `queryMedia.test.ts`.
- **Score-ordering invariant** (scores non-increasing within a Page).
  Top-result identity is asserted in `operator.test.ts`; full-page
  monotonic ordering is not pinned.
- **Concurrency / parallel-query stress.** Tests run `--runInBand`
  intentionally so the rate-limited search endpoint is not bombarded.
- **`user_metadata.*` field-level filtering.** `includeUserMetadata:
  true` is exercised in `contract.test.ts`; specific filters on
  `user_metadata.*` keys are not.

## Run

```sh
npm test               # all tests, serial, hits the real API
npm run test:coverage  # with coverage
npm run typecheck      # tsc --noEmit
```

Tests run with `--runInBand` because the search endpoint is rate-limited.

## CI

`.github/workflows/test.yml` runs typecheck + tests on PRs and pushes to
`main`. `TWELVELABS_API_KEY` is a repo **secret**; everything else is a
repo **variable**. The workflow writes `.env` at runtime — needed
because GitHub Actions disallows env var names starting with a digit
(`5_SEC_VID_IDS`, `10_SEC_VID_IDS`, `400X400PX_VID_IDS`,
`800X800PX_VID_IDS`), so they are mapped from `FIVE_SEC_VID_IDS` /
`TEN_SEC_VID_IDS` / `PX400_VID_IDS` / `PX800_VID_IDS` vars into the
correct keys in the generated `.env`.
