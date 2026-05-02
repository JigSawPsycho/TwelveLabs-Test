/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  // Load .env into process.env before any test module runs.
  setupFiles: ["dotenv/config"],
  // Real API calls can be slow; allow up to 60s per test.
  testTimeout: 60_000,
  verbose: true,
  clearMocks: true,
  // jest-junit XML is uploaded as a CI artifact so failures can be
  // inspected without re-running the suite.
  reporters: [
    "default",
    [
      "jest-junit",
      {
        outputDirectory: "reports",
        outputName: "junit.xml",
        ancestorSeparator: " > ",
      },
    ],
  ],
};
