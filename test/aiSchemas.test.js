const test = require("node:test");
const assert = require("node:assert/strict");
const { parseJsonResponse, validateFlashcards, validateStoryboard } = require("../aiSchemas");
const { selectRepresentativeChunks } = require("../lectureContext");

const segments = [{ id: "s1", start: 4, end: 9, text: "The cell stores energy." }];

test("parses model JSON with an optional code fence", () => {
  assert.deepEqual(parseJsonResponse('```json\n{"flashcards":[]}\n```'), { flashcards: [] });
});

test("rejects flashcards without a transcript source", () => {
  assert.throws(() => validateFlashcards([{ question: "Q?", answer: "A", source: { timestamp: 5, segmentIds: ["missing"] } }], segments), /valid question/);
});

test("keeps flashcard timestamps inside cited cues", () => {
  const cards = validateFlashcards([{ question: "What stores energy?", answer: "The cell.", source: { timestamp: 5, segmentIds: ["s1"] } }], segments);
  assert.equal(cards[0].source.excerpt, "The cell stores energy.");
  const recovered = validateFlashcards([{ question: "Q", answer: "A", source: { timestamp: 40, segmentIds: ["s1"] } }], segments);
  assert.equal(recovered[0].source.timestamp, 4);
});

test("requires storyboard images and transcript context references", () => {
  const frame = { timestamp: 5, imagePath: "frames/a.jpg", topic: "Cell", visualDescription: "Diagram", contextSummary: "Lecture introduces the cell.", segmentIds: ["s1"] };
  assert.equal(validateStoryboard([frame], segments, new Set(["frames/a.jpg"]))[0].topic, "Cell");
  assert.throws(() => validateStoryboard([frame], segments, new Set()), /incomplete/);
});

test("samples flashcard prompt chunks across long lectures", () => {
  const chunks = Array.from({ length: 20 }, (_, index) => [{ id: `s${index}`, start: index * 60, end: index * 60 + 10, text: "lecture text" }]);
  const selected = selectRepresentativeChunks(chunks, 6);
  assert.equal(selected.length, 6);
  assert.ok(selected[0][0].start < 60);
  assert.ok(selected[selected.length - 1][0].start > 17 * 60);
});
