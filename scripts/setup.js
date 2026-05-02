const fs = require("fs");
const path = require("path");
const { uploadVideo, getIndexVideoIds, createIndex } = require("./upload");

const ASSETS_DIR = path.resolve(__dirname, "..", "assets");
const ENV_PATH = path.resolve(__dirname, "..", ".env");

// Each asset filename maps to the env var that should hold its uploaded
// videoId. tests/helpers/env.ts is the source of truth for these names.
const FILE_TO_ENV_VAR = {
  "red-only.mp4": "RED_VIDEO_ID",
  "blue-only.mp4": "BLUE_VIDEO_ID",
  "green-only.mp4": "GREEN_VIDEO_ID",
  "rgb-test.mp4": "RGB_VIDEO_ID",
  "5secvid.mp4": "5_SEC_VID_IDS",
  "10secvid.mp4": "10_SEC_VID_IDS",
  "400x400vid.mp4": "400X400PX_VID_IDS",
  "800x800vid.mp4": "800X800PX_VID_IDS",
  "test-filename.mp4": "TESTNAME_FILENAME_VID_ID",
};

function usage() {
  console.error("Usage:");
  console.error("  node scripts/setup.js <indexId> <apiKey> [--force]");
  console.error("  node scripts/setup.js <apiKey> --create-new-index [--index-name=NAME] [--force]");
  console.error("");
  console.error("  uploads every .mp4 in assets/ to the given (or newly created) index.");
  console.error("  refuses if existing index is non-empty unless --force is passed.");
  console.error("  writes .env with credentials + uploaded video IDs.");
  console.error("  refuses to overwrite existing .env unless --force is passed.");
  console.error("");
  console.error("  env: ALLOWED_IDS=id1,id2,...  if set, refuses to proceed when the");
  console.error("       existing index contains any video id outside this list.");
}

function parseAllowedIds(raw) {
  if (!raw) return undefined;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function parseFlagValue(args, name) {
  const prefix = `--${name}=`;
  const hit = args.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

function buildEnvContent(indexId, apiKey, results) {
  const idByVar = {};
  for (const r of results) {
    if (!r.ok) continue;
    const varName = FILE_TO_ENV_VAR[r.file];
    if (varName) idByVar[varName] = r.videoId;
  }

  const get = (k) => idByVar[k] || "";
  const allowedIds = results
    .filter((r) => r.videoId)
    .map((r) => r.videoId);
  const lines = [
    `TWELVELABS_API_KEY=${apiKey}`,
    `TWELVELABS_INDEX_ID=${indexId}`,
    `TWELVELABS_QUERY_TEXT=color`,
    ``,
    `ALLOWED_IDS=${allowedIds.join(",")}`,
    ``,
    `RED_VIDEO_ID=${get("RED_VIDEO_ID")}`,
    `BLUE_VIDEO_ID=${get("BLUE_VIDEO_ID")}`,
    `GREEN_VIDEO_ID=${get("GREEN_VIDEO_ID")}`,
    `RGB_VIDEO_ID=${get("RGB_VIDEO_ID")}`,
    ``,
    `5_SEC_VID_IDS=${get("5_SEC_VID_IDS")}`,
    `10_SEC_VID_IDS=${get("10_SEC_VID_IDS")}`,
    `400X400PX_VID_IDS=${get("400X400PX_VID_IDS")}`,
    `800X800PX_VID_IDS=${get("800X800PX_VID_IDS")}`,
    ``,
    `TESTNAME_FILENAME=test-filename.mp4`,
    `TESTNAME_FILENAME_VID_ID=${get("TESTNAME_FILENAME_VID_ID")}`,
    ``,
  ];
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const createNewIndex = args.includes("--create-new-index");
  const indexNameOverride = parseFlagValue(args, "index-name");
  const positional = args.filter((a) => !a.startsWith("--"));

  let indexId;
  let apiKey;
  if (createNewIndex) {
    [apiKey] = positional;
    if (!apiKey) {
      usage();
      process.exit(1);
    }
  } else {
    [indexId, apiKey] = positional;
    if (!indexId || !apiKey) {
      usage();
      process.exit(1);
    }
  }

  if (!fs.existsSync(ASSETS_DIR)) {
    console.error(`assets dir missing: ${ASSETS_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(ASSETS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".mp4"))
    .sort();

  if (files.length === 0) {
    console.error(`no .mp4 files in ${ASSETS_DIR}`);
    process.exit(1);
  }

  if (createNewIndex) {
    const name = indexNameOverride || `test-autogenerate-${Date.now()}`;
    console.log(`creating new index "${name}"...`);
    try {
      const created = await createIndex(apiKey, { indexName: name });
      indexId = created.indexId;
      console.log(`created index ${indexId}`);
    } catch (err) {
      console.error(`index create failed: ${err.message || err}`);
      process.exit(2);
    }
  } else {
    console.log(`checking index ${indexId}...`);
    let currentIds;
    try {
      currentIds = await getIndexVideoIds(indexId, apiKey);
    } catch (err) {
      console.error(`index check failed: ${err.message || err}`);
      process.exit(2);
    }

    const allowedIds = parseAllowedIds(process.env.ALLOWED_IDS);
    if (allowedIds) {
      const allowedSet = new Set(allowedIds);
      const unapproved = currentIds.filter((id) => !allowedSet.has(id));
      if (unapproved.length > 0) {
        console.error(
          `the test index contains unapproved ids, please remove the following ids:\n  ${unapproved.join("\n  ")}`,
        );
        process.exit(5);
      }
    }

    if (currentIds.length > 0 && !force) {
      console.error(`index not empty — found ${currentIds.length} existing video(s). pass --force to upload anyway.`);
      process.exit(3);
    }
  }

  console.log(`uploading ${files.length} file(s)...`);
  let ok = 0;
  let failed = 0;
  const results = [];

  for (const file of files) {
    const full = path.join(ASSETS_DIR, file);
    process.stdout.write(`→ ${file} ... `);
    try {
      const result = await uploadVideo(full, indexId, apiKey, {
        onProgress: ({ phase }) => {
          process.stdout.write(`${phase} `);
        },
      });
      console.log(`ok (video=${result.videoId})`);
      results.push({ file, ok: true, videoId: result.videoId });
      ok += 1;
    } catch (err) {
      console.log(`FAIL: ${err.message || err}`);
      results.push({ file, ok: false, error: err.message || String(err) });
      failed += 1;
    }
  }

  console.log("---");
  console.log(`done. ${ok}/${files.length} uploaded. ${failed} failed.`);

  const unmapped = results
    .filter((r) => r.ok && !FILE_TO_ENV_VAR[r.file])
    .map((r) => r.file);
  if (unmapped.length > 0) {
    console.warn(`warning: no env var mapping for: ${unmapped.join(", ")}`);
  }

  const envContent = buildEnvContent(indexId, apiKey, results);
  const envExists = fs.existsSync(ENV_PATH);
  const targetPath = envExists && !force ? `${ENV_PATH}.generated` : ENV_PATH;
  if (envExists && !force) {
    console.warn(`.env already exists — writing to ${targetPath} instead. pass --force to overwrite.`);
  }
  fs.writeFileSync(targetPath, envContent);
  console.log(`wrote ${targetPath}`);

  if (failed > 0) process.exit(4);
}

main().catch((err) => {
  console.error(`fatal: ${err.message || err}`);
  process.exit(99);
});
