// Reuse the isolated real-IndexedDB browser harness with mocked HTTP only.
process.argv[2] = "sync";
await import("./personal-library.test.mjs");
