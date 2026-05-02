# TwelveLabs-Test

## English

Integration test suite for `client.search.query` from the
[`twelvelabs-js`](https://www.npmjs.com/package/twelvelabs-js) SDK,
written in TypeScript with Jest. Tests hit the real API (no mocks) and
were originally organized using the **ZOMBIES** heuristic (Zero, One,
Many, Boundaries, Interfaces, Exceptions, Simple scenarios). They have
since been split into per-parameter files under `tests/search.query/`.

### Approach

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
  duration tests, filename test).
- **Error class taxonomy preserved.** `BadRequestError` (HTTP 400),
  `JsonError` (SDK enum/serializer rejection — never sent), and
  `TwelvelabsApiError` (everything else, including 401/403/404/429) are
  asserted explicitly. Collapsing all to "throws" would hide regressions
  where the SDK starts returning a different class.

### Scope decisions

The `search.query` parameter surface is large. Choices made for this
24-hour window:

| Parameter                | Coverage                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `queryText`              | length boundary (500-token cap), empty/whitespace, missing                                              |
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

### Layout

```
assets/                      sample .mp4 fixtures used to seed the test index
scripts/
  upload.js                  upload a single video and poll until indexed
  setup.js                   bulk-upload every assets/*.mp4 to an empty index
  teardown.js                delete an index and every video inside it
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

### Versions

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

### Setup

```sh
npm install
```

#### Seed an index

The filter tests need specific fixture videos already indexed (color,
duration, dimensions, filename). To populate a fresh, empty index from
the bundled `assets/`:

```sh
# upload to an existing empty index
npm run setup -- <indexId> <apiKey>
# refuses if the index is non-empty; pass --force to override
npm run setup -- <indexId> <apiKey> --force

# or create a fresh index and upload to it (no <indexId> needed)
npm run setup -- <apiKey> --create-new-index
# optional custom name (default: test-autogenerate-<timestamp>)
npm run setup -- <apiKey> --create-new-index --index-name=my-test
```

The `--create-new-index` flag provisions a Marengo + Pegasus index with
`visual` and `audio` modalities enabled (transcripts are auto-generated
from audio and searchable via `searchOptions: ["transcription"]` — there
is no separate transcript modality at index-create time).

After uploads finish, `setup` writes a `.env` file with the API key,
index id, and every uploaded `videoId` mapped to its matching env var
(filename → variable mapping is hardcoded in `scripts/setup.js`). If
`.env` already exists, the file is written to `.env.generated` instead;
pass `--force` to overwrite `.env` directly.

Single-file upload:

```sh
npm run upload -- <filePath> <indexId> <apiKey>
```

#### Fixture videos

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

`npm run setup` writes `.env` automatically with each `videoId` mapped
to its matching variable. Filename → env var mapping:

| File                | Env var                    |
| ------------------- | -------------------------- |
| `red-only.mp4`      | `RED_VIDEO_ID`             |
| `blue-only.mp4`     | `BLUE_VIDEO_ID`            |
| `green-only.mp4`    | `GREEN_VIDEO_ID`           |
| `rgb-test.mp4`      | `RGB_VIDEO_ID`             |
| `5secvid.mp4`       | `5_SEC_VID_IDS`            |
| `10secvid.mp4`      | `10_SEC_VID_IDS`           |
| `400x400vid.mp4`    | `400X400PX_VID_IDS`        |
| `800x800vid.mp4`    | `800X800PX_VID_IDS`        |
| `test-filename.mp4` | `TESTNAME_FILENAME_VID_ID` (and `TESTNAME_FILENAME=test-filename.mp4`) |

For manual edits, see `.env.example`.

### Configure credentials

Edit `.env`:

| Variable                   | Required | Notes                                                            |
| -------------------------- | -------- | ---------------------------------------------------------------- |
| `TWELVELABS_API_KEY`       | yes      | API key for your TwelveLabs account.                             |
| `TWELVELABS_INDEX_ID`      | yes      | Existing index (Marengo engine) with at least one video indexed. |
| `TWELVELABS_QUERY_TEXT`    | no       | Text query likely to return results. Defaults to `number`.       |
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

### Assumptions

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

### Not covered

Explicit non-goals:

- **Rate-limit behavior (429 / `TooManyRequestsError`).** Hammering the
  API to provoke 429 is anti-social; not exercised. The class still
  surfaces through the broader `TwelvelabsApiError` assertions.
- **Pegasus engine indexes.** `search.query` requires Marengo; out of
  scope.
- **Image-search (`queryMediaType` / `queryMediaUrl`).** Documented
  image-URL search path is not exercised in this suite.
- **Score-ordering invariant** (scores non-increasing within a Page).
  Top-result identity is asserted in `operator.test.ts`; full-page
  monotonic ordering is not pinned.
- **Concurrency / parallel-query stress.** Tests run `--runInBand`
  intentionally so the rate-limited search endpoint is not bombarded.
- **`user_metadata.*` field-level filtering.** `includeUserMetadata:
  true` is exercised in `contract.test.ts`; specific filters on
  `user_metadata.*` keys are not.

### Run

```sh
npm test               # all tests, serial, hits the real API
npm run test:coverage  # with coverage
npm run typecheck      # tsc --noEmit
```

Tests run with `--runInBand` because the search endpoint is rate-limited.

### CI

`.github/workflows/test.yml` runs typecheck + tests on PRs and pushes to
`main`. The only required repo **secret** is `TWELVELABS_API_KEY` — no
repo variables are needed. Each run is hermetic:

1. **Setup** — `scripts/setup.js --create-new-index --index-name=citest-autogenerate-<sha>`
   provisions a fresh index, uploads every `assets/*.mp4`, and writes a
   `.env` with `TWELVELABS_INDEX_ID` + every fixture `*_VID_ID` the
   suite reads.
2. **Test** — `npm test` against that index.
3. **Teardown** — `if: always()`, reads `TWELVELABS_INDEX_ID` from
   `.env` and calls `scripts/teardown.js` to delete the index (and all
   uploaded videos). Runs even when tests fail. The commit-SHA in the
   index name keeps any leak attributable.

Tradeoff: each CI run re-uploads + indexes ~9 fixtures (minutes of
indexing latency) instead of reusing a shared index. In return: no
cross-run state, no quota for stray uploads, no need to manage repo
variables for fixture IDs.

## 한국어

[`twelvelabs-js`](https://www.npmjs.com/package/twelvelabs-js) SDK의
`client.search.query`에 대한 통합 테스트 스위트로, TypeScript와 Jest로
작성되었습니다. 테스트는 실제 API를 호출하며(목 사용 없음), 처음에는
**ZOMBIES** 휴리스틱(Zero, One, Many, Boundaries, Interfaces, Exceptions,
Simple scenarios)을 사용해 구성되었습니다. 이후 `tests/search.query/`
아래에 매개변수별 파일로 분리되었습니다.

### 접근 방식

- **통합 테스트 우선.** 모든 테스트가 실제 TwelveLabs API를 호출합니다.
  SDK를 목으로 처리하면 SDK 자체의 타입 검사를 재검증하는 것에 불과한데,
  과제에서는 SDK *기능* 커버리지를 요구하며 이는 실제 응답으로만 입증할
  수 있습니다.
- **매개변수별 파일 분리.** `search.query` 요청 매개변수
  (`queryText`, `pageLimit`, `operator`, `groupBy`, `searchOptions`,
  `transcriptionOptions`, `requestOptions` 및 `filter.<field>` 파일)마다
  하나의 `*.test.ts`. 어설션이 실패하면 정확히 어떤 매개변수가 문제인지
  바로 알 수 있습니다.
- 각 파일 내부의 테스트 선택은 **ZOMBIES 휴리스틱**이 주도합니다. 표준
  describe 레이아웃: `happy path`, `boundary`, `validation rejection`.
- **`describeIf`를 통한 정상적 스킵.** `TWELVELABS_API_KEY`와
  `TWELVELABS_INDEX_ID`만 필수이며, 픽스처에 의존하는 모든 그룹은 해당
  픽스처가 없으면 깔끔하게 스킵됩니다(컬러 테스트, 차원 테스트, 길이
  테스트, 파일명 테스트).
- **에러 클래스 분류 보존.** `BadRequestError`(HTTP 400),
  `JsonError`(SDK enum/직렬화 거부 — 전송되지 않음), `TwelvelabsApiError`
  (401/403/404/429 포함 그 외 전부)를 명시적으로 어설션합니다. 모두
  "throws"로 묶으면 SDK가 다른 클래스를 반환하기 시작하는 회귀를
  놓칩니다.

### 범위 결정

`search.query` 매개변수 표면은 큽니다. 이 24시간 작업 동안의 선택:

| 매개변수                  | 커버리지                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `queryText`              | 길이 경계(500 토큰 상한), 빈 문자열/공백, 누락                                                       |
| `searchOptions`          | 누락, 빈 배열, 중복, 알 수 없는 enum                                                                |
| `transcriptionOptions`   | 잘못된 enum(happy path는 `contract`와 `operator`에서 검증)                                          |
| `groupBy`                | `video`, `clip`, 잘못된 enum                                                                        |
| `operator`               | 실제 픽스처에서 AND vs OR 의미 차이, 기본 동작, 잘못된 enum                                          |
| `pageLimit`              | 1 / 10 / 50 / -1 / 51, 다중 페이지 반복, 페이지 간 for-await                                         |
| `filter` (duration)      | 버킷별 happy path, MAX/MIN_SAFE_INTEGER, 음수, 역방향 범위, 타입 및 연산자 거부                       |
| `filter` (width/height)  | 팩토리로 생성된 `duration` 커버리지의 미러                                                           |
| `filter` (filename)      | 정확 일치, 미스, 1만 자 문자열, 타입 및 연산자 거부                                                  |
| `filter` (id)            | 배열 아님, 빈 배열, 문자열 아닌 항목, 잘못된 형식, 1천 항목 배열                                      |
| `filter` (shape)         | null, 잘못된 JSON, JSON 배열/스칼라, 알 수 없는 최상위 키                                            |
| `requestOptions`         | 타임아웃, 사전 abort된 abortSignal, 서브밀리초 타임아웃                                              |
| `search.retrieve`        | 잘못된 토큰, 빈 토큰, null 토큰(happy path는 `pageLimit.test.ts`의 페이징 테스트로 암묵적 검증)        |

`sortOption`은 별도로 검증하지 않습니다 — `search.query`는 이를 문서화된
매개변수로 받지 않습니다(결과는 기본적으로 점수순).

### 레이아웃

```
assets/                      테스트 인덱스 시드용 .mp4 샘플 픽스처
scripts/
  upload.js                  단일 비디오 업로드 후 인덱싱 완료까지 폴링
  setup.js                   assets/*.mp4 전부를 빈 인덱스에 일괄 업로드
  teardown.js                인덱스와 그 안의 모든 비디오 삭제
tests/
  helpers/
    client.ts                공유 TwelveLabs 클라이언트
    env.ts                   env 변수 로더 + describeIf 게이팅
    pagination.ts            페이징 헬퍼
    dimensionFilter.ts       차원 필터 헬퍼
  search.query/
    auth.test.ts             인증 / 실패 시나리오
    contract.test.ts         컴파일 타임 + 응답 형태 가드
    queryText.test.ts
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
.github/workflows/test.yml   CI: PR 및 main 푸시 시 typecheck + 테스트
```

### 버전

| 패키지                       | 버전       |
| --------------------------- | ---------- |
| `twelvelabs-js`             | ^1.2.3     |
| `typescript`                | ^6.0.3     |
| `jest`                      | ^30.3.0    |
| `ts-jest`                   | ^29.4.9    |
| `@types/jest`               | ^30.0.0    |
| `@types/node`               | ^25.6.0    |
| `dotenv`                    | ^17.4.2    |
| Node.js (CI)                | 20         |

### 설치

```sh
npm install
```

#### 인덱스 시딩

필터 테스트에는 이미 인덱싱된 특정 픽스처 비디오(컬러, 길이, 차원,
파일명)가 필요합니다. 새로 만든 빈 인덱스를 번들된 `assets/`로 채우려면:

```sh
# 기존의 빈 인덱스에 업로드
npm run setup -- <indexId> <apiKey>
# 인덱스가 비어있지 않으면 거부; 덮어쓰려면 --force
npm run setup -- <indexId> <apiKey> --force

# 또는 새 인덱스를 생성하고 거기에 업로드 (<indexId> 불필요)
npm run setup -- <apiKey> --create-new-index
# 선택적 사용자 지정 이름 (기본값: test-autogenerate-<timestamp>)
npm run setup -- <apiKey> --create-new-index --index-name=my-test
```

`--create-new-index` 플래그는 `visual` 및 `audio` 모달리티가 활성화된
Marengo + Pegasus 인덱스를 프로비저닝합니다(전사는 오디오에서 자동
생성되며 `searchOptions: ["transcription"]`로 검색 가능 — 인덱스 생성
시점에는 별도의 transcript 모달리티가 없음).

업로드가 끝나면 `setup`은 API 키, 인덱스 id, 그리고 업로드된 모든
`videoId`를 매칭되는 env 변수에 매핑한 `.env` 파일을 작성합니다(파일명 →
변수 매핑은 `scripts/setup.js`에 하드코딩됨). `.env`가 이미 존재하면
파일은 대신 `.env.generated`로 작성됩니다; `.env`를 직접 덮어쓰려면
`--force`를 전달하세요.

단일 파일 업로드:

```sh
npm run upload -- <filePath> <indexId> <apiKey>
```

#### 픽스처 비디오

`assets/`에는 10개의 `.mp4` 파일이 포함됩니다. 파일 → 사용처 → 목적
매핑:

| 파일                  | 사용처                       | 목적                                                                       |
| -------------------- | --------------------------- | -------------------------------------------------------------------------- |
| `red-only.mp4`       | `operator.test.ts`          | 단색 빨강, 음성 "red"; `red` 비주얼 쿼리에서 최상위 결과로 랭크되어야 함        |
| `blue-only.mp4`      | `operator.test.ts`          | 단색 파랑, 음성 "blue"                                                       |
| `green-only.mp4`     | `operator.test.ts`          | 단색 초록, 음성 "green"                                                      |
| `true-blue.mp4`      | (예비) 선택적 두 번째 파랑     | 랭킹 검증용 추가 블루 픽스처; 직접 필요하지는 않음                              |
| `rgb-test.mp4`       | `operator.test.ts`          | R+G+B 비주얼 콘텐츠, **오디오 트랙 없음** — AND가 transcript를 요구함을 증명    |
| `5secvid.mp4`        | `filter.duration.test.ts`   | 약 5초 길이 버킷                                                              |
| `10secvid.mp4`       | `filter.duration.test.ts`   | 약 10초 길이 버킷                                                             |
| `400x400vid.mp4`     | `filter.dimensions.test.ts` | 400×400 차원 버킷                                                            |
| `800x800vid.mp4`     | `filter.dimensions.test.ts` | 800×800 차원 버킷                                                            |
| `test-filename.mp4`  | `filter.filename.test.ts`   | 정확 파일명 일치 대상                                                         |

`npm run setup`은 각 `videoId`를 매칭되는 변수에 매핑하여 `.env`를
자동으로 작성합니다. 파일명 → env 변수 매핑:

| 파일                  | Env 변수                   |
| -------------------- | -------------------------- |
| `red-only.mp4`       | `RED_VIDEO_ID`             |
| `blue-only.mp4`      | `BLUE_VIDEO_ID`            |
| `green-only.mp4`     | `GREEN_VIDEO_ID`           |
| `rgb-test.mp4`       | `RGB_VIDEO_ID`             |
| `5secvid.mp4`        | `5_SEC_VID_IDS`            |
| `10secvid.mp4`       | `10_SEC_VID_IDS`           |
| `400x400vid.mp4`     | `400X400PX_VID_IDS`        |
| `800x800vid.mp4`     | `800X800PX_VID_IDS`        |
| `test-filename.mp4`  | `TESTNAME_FILENAME_VID_ID` (그리고 `TESTNAME_FILENAME=test-filename.mp4`) |

수동 편집은 `.env.example`을 참고하세요.

### 자격 증명 구성

`.env` 편집:

| 변수                        | 필수 | 설명                                                                |
| -------------------------- | ---- | ------------------------------------------------------------------- |
| `TWELVELABS_API_KEY`       | 예   | TwelveLabs 계정의 API 키.                                           |
| `TWELVELABS_INDEX_ID`      | 예   | 최소 1개 이상 비디오가 인덱싱된 기존 인덱스(Marengo 엔진).             |
| `TWELVELABS_QUERY_TEXT`    | 아니오 | 결과를 반환할 가능성이 높은 텍스트 쿼리. 기본값 `number`.             |
| `RED_VIDEO_ID`             | 아니오 | 컬러 필터 픽스처. 컬러 테스트 활성화에는 4개 모두 필요.                |
| `BLUE_VIDEO_ID`            | 아니오 |                                                                     |
| `GREEN_VIDEO_ID`           | 아니오 |                                                                     |
| `RGB_VIDEO_ID`             | 아니오 |                                                                     |
| `5_SEC_VID_IDS`            | 아니오 | 콤마로 구분. 길이 테스트는 5초/10초 두 세트 모두 필요.                 |
| `10_SEC_VID_IDS`           | 아니오 |                                                                     |
| `400X400PX_VID_IDS`        | 아니오 | 콤마로 구분. 차원 테스트는 400/800 두 세트 모두 필요.                  |
| `800X800PX_VID_IDS`        | 아니오 |                                                                     |
| `TESTNAME_FILENAME`        | 아니오 | 파일명 필터 테스트 쌍.                                               |
| `TESTNAME_FILENAME_VID_ID` | 아니오 |                                                                     |

테스트 그룹은 픽스처가 없을 때 `describeIf`로 깔끔하게 스킵됩니다; API
키 + 인덱스 id만 필수입니다. 컴파일 타임 가드 테스트는 무관하게
실행됩니다.

### 가정

- 구성된 `TWELVELABS_INDEX_ID`는 최소 1개 인덱싱된 비디오가 있는
  **Marengo 엔진** 인덱스. Pegasus 인덱스는 모든 비주얼 테스트가
  `index_not_supported_for_search`로 실패합니다.
- `TWELVELABS_QUERY_TEXT`(기본값: `"number"`)는 구성된 인덱스에서 최소 1개
  결과를 반환. "passthrough filter == baseline result count"를 어설션하는
  경계 테스트는 결과가 0인 baseline에서도 통과하나 신호가 약합니다.
- 구성된 API 키가 레이트 리밋에 걸리지 않은 상태. 스위트는 실행당 약 80건
  실제 API 호출을 발생시킵니다; 제한이 빡빡한 티어에서는 `--runInBand` +
  요청별 재시도(`requestOptions` 참조)로도 부족할 수 있음 — 더 높은 쿼터의
  키가 가장 간단한 해결책.
- 인코더의 리스케일 드리프트 때문에 "400×400" 또는 "800×800" 비디오의
  실제 업로드는 항상 픽셀 단위로 정확하지 않습니다. 차원 어설션은 ±50px
  허용 범위를 사용합니다.

### 다루지 않는 것

명시적 비목표:

- **레이트 리밋 동작 (429 / `TooManyRequestsError`).** 429를 유발하기
  위해 API를 두드리는 것은 비매너적이라 검증하지 않습니다. 해당 클래스는
  더 넓은 `TwelvelabsApiError` 어설션을 통해 노출됩니다.
- **Pegasus 엔진 인덱스.** `search.query`는 Marengo가 필요; 범위 외.
- **이미지 검색 (`queryMediaType` / `queryMediaUrl`).** 문서화된 이미지
  URL 검색 경로는 본 스위트에서 검증하지 않습니다.
- **점수 정렬 불변량** (Page 내에서 점수가 비증가). 최상위 결과 식별은
  `operator.test.ts`에서 어설션; 페이지 전체의 단조 정렬은 고정하지
  않습니다.
- **동시성 / 병렬 쿼리 스트레스.** 레이트 리밋된 search 엔드포인트가
  포격당하지 않도록 의도적으로 `--runInBand`로 실행합니다.
- **`user_metadata.*` 필드 수준 필터링.** `includeUserMetadata: true`는
  `contract.test.ts`에서 검증; `user_metadata.*` 키에 대한 구체 필터는
  검증하지 않습니다.

### 실행

```sh
npm test               # 전체 테스트, 직렬, 실제 API 호출
npm run test:coverage  # 커버리지 포함
npm run typecheck      # tsc --noEmit
```

search 엔드포인트가 레이트 리밋되어 있어 테스트는 `--runInBand`로
실행됩니다.

### CI

`.github/workflows/test.yml`은 PR 및 `main` 푸시 시 typecheck + 테스트를
실행합니다. 필요한 리포 **시크릿**은 `TWELVELABS_API_KEY` 하나뿐 — 리포
변수는 필요 없습니다. 각 실행은 hermetic합니다:

1. **Setup** — `scripts/setup.js --create-new-index --index-name=citest-autogenerate-<sha>`
   가 새 인덱스를 프로비저닝하고, 모든 `assets/*.mp4`를 업로드하며,
   스위트가 읽는 `TWELVELABS_INDEX_ID` + 모든 픽스처 `*_VID_ID`가 들어간
   `.env`를 작성합니다.
2. **Test** — 해당 인덱스에 대해 `npm test`.
3. **Teardown** — `if: always()`, `.env`에서 `TWELVELABS_INDEX_ID`를
   읽어 `scripts/teardown.js`를 호출해 인덱스(와 업로드된 모든 비디오)를
   삭제합니다. 테스트 실패 시에도 실행됩니다. 인덱스 이름의 커밋 SHA로
   누수가 발생해도 추적 가능합니다.

트레이드오프: 각 CI 실행이 약 9개 픽스처를 재업로드 + 인덱싱(인덱싱
지연 수 분)합니다 — 공유 인덱스 재사용 대신. 그 대가로: 실행 간 상태
없음, 떠도는 업로드를 위한 쿼터 불필요, 픽스처 ID용 리포 변수 관리
불필요.
