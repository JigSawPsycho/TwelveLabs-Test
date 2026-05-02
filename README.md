# TwelveLabs-Test

Integration test suite for `client.search.query` from the
[`twelvelabs-js`](https://www.npmjs.com/package/twelvelabs-js) SDK,
written in TypeScript with Jest. Tests are organized using the **ZOMBIES**
heuristic (Zero, One, Many, Boundaries, Interfaces, Exceptions, Simple
scenarios).

## Setup

```sh
npm install
```

## Configure credentials

Edit `.env` and set:

| Variable                 | Required | Notes                                                          |
| ------------------------ | -------- | -------------------------------------------------------------- |
| `TWELVELABS_API_KEY`     | yes      | API key for your TwelveLabs account.                           |
| `TWELVELABS_INDEX_ID`    | yes      | Existing index (Marengo engine) with at least one video indexed. |
| `TWELVELABS_QUERY_TEXT`  | no       | Text query likely to return results. Defaults to `person`.     |
| `TWELVELABS_IMAGE_URL`   | no       | Public image URL; image-search tests skip if absent.           |

If `TWELVELABS_API_KEY` or `TWELVELABS_INDEX_ID` is missing, the integration
tests skip with a console warning. The compile-time guard tests still run.

## Run

```sh
npm test               # all tests, serial, hits the real API
npm run test:coverage  # with coverage
npm run typecheck      # tsc --noEmit
```

Tests run with `--runInBand` so requests are serial; the search endpoint is
rate-limited.
