const test = require("node:test");
const assert = require("node:assert/strict");
const { timestampToSeconds, parseSrt, normalizeSegments, getContextWindow } = require("../lectureContext");

test("parses SRT cues into timestamped transcript segments", () => {
  const segments = parseSrt("1\n00:00:02,500 --> 00:00:04,000\nHello <i>world</i>\n\n2\n00:01:00,000 --> 00:01:02,000\nNext cue");
  assert.equal(segments.length, 2);
  assert.equal(segments[0].start, 2.5);
  assert.equal(segments[0].text, "Hello world");
  assert.equal(timestampToSeconds("01:02:03.004"), 3723.004);
  assert.equal(timestampToSeconds("bad"), null);
});

test("associates a timestamp with nearby transcript cues", () => {
  const segments = normalizeSegments([{ id: "a", start: 10, end: 12, text: "first" }, { id: "b", start: 30, end: 32, text: "second" }]);
  const window = getContextWindow(segments, 11, 0, 5);
  assert.deepEqual(window.segments.map((segment) => segment.id), ["a"]);
});
