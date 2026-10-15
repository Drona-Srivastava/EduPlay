const test = require("node:test");
const assert = require("node:assert/strict");
const { selectRepresentativeTimestamps } = require("../sceneDetection");

test("deduplicates nearby scenes and spreads capped candidates across a lecture", () => {
  const selected = selectRepresentativeTimestamps([1, 2, 10, 21, 31, 45, 60, 75, 90], 100, 4, 5);
  assert.ok(selected.length <= 4);
  assert.ok(selected[0] < 30);
  assert.ok(selected[selected.length - 1] > 60);
});

test("returns no candidates when no scene changes are found", () => {
  assert.deepEqual(selectRepresentativeTimestamps([], 100), []);
});
