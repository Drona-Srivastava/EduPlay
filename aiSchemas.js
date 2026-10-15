function parseJsonResponse(text) {
  const cleaned = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned); } catch (_) {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(cleaned.slice(first, last + 1));
    throw new Error("Model returned invalid JSON.");
  }
}

function validateFlashcards(value, segments) {
  const cards = Array.isArray(value) ? value : value?.flashcards;
  if (!Array.isArray(cards) || cards.length === 0 || cards.length > 40) throw new Error("Expected 1–40 flashcards.");
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  return cards.map((card, index) => {
    const question = String(card.question || "").trim();
    const answer = String(card.answer || "").trim();
    const source = card.source || {};
    const ids = Array.isArray(source.segmentIds) ? source.segmentIds.map(String) : [];
    const sourceSegments = ids.map((id) => segmentById.get(id)).filter(Boolean).sort((a, b) => a.start - b.start);
    const modelTimestamp = Number(source.timestamp);
    if (!question || !answer || !sourceSegments.length) {
      throw new Error(`Flashcard ${index + 1} is missing a valid question, answer, timestamp, or transcript reference.`);
    }
    const first = sourceSegments[0];
    const last = sourceSegments[sourceSegments.length - 1];
    const timestamp = Number.isFinite(modelTimestamp) && modelTimestamp >= first.start - 1 && modelTimestamp <= last.end + 1
      ? Math.min(last.end, Math.max(first.start, modelTimestamp))
      : first.start;
    return {
      id: `card-${index + 1}`,
      question,
      answer,
      source: {
        timestamp,
        segmentIds: sourceSegments.map((segment) => segment.id),
        transcriptStart: first.start,
        transcriptEnd: last.end,
        excerpt: sourceSegments.map((segment) => segment.text).join(" ").slice(0, 1200),
      },
      review: { rating: null, updatedAt: null },
    };
  });
}

function validateStoryboard(value, segments, validImages) {
  const frames = Array.isArray(value) ? value : value?.frames;
  if (!Array.isArray(frames) || frames.length === 0 || frames.length > 40) throw new Error("Expected 1–40 storyboard frames.");
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  return frames.map((frame, index) => {
    const timestamp = Number(frame.timestamp);
    const imagePath = String(frame.imagePath || "");
    const topic = String(frame.topic || "").trim();
    const visualDescription = String(frame.visualDescription || "").trim();
    const contextSummary = String(frame.contextSummary || "").trim();
    const ids = Array.isArray(frame.segmentIds) ? frame.segmentIds.map(String) : [];
    const cited = ids.map((id) => segmentById.get(id)).filter(Boolean).sort((a, b) => a.start - b.start);
    if (!Number.isFinite(timestamp) || timestamp < 0 || !validImages.has(imagePath) || !topic || !visualDescription || !contextSummary || !cited.length) {
      throw new Error(`Storyboard entry ${index + 1} is incomplete or references an invalid frame/transcript segment.`);
    }
    return {
      id: `frame-${index + 1}`,
      timestamp,
      imagePath,
      topic,
      visualDescription,
      contextSummary,
      transcriptStart: cited[0].start,
      transcriptEnd: cited[cited.length - 1].end,
      segmentIds: cited.map((segment) => segment.id),
    };
  }).sort((a, b) => a.timestamp - b.timestamp);
}

module.exports = { parseJsonResponse, validateFlashcards, validateStoryboard };
