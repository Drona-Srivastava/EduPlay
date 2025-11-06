// ================================
// 📦 IMPORTS
// ================================
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

// ================================
// ⚙️ APP SETUP
// ================================
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));
const PORT = 3000;

console.log("🚀 Server started — polished AI response edition");

// ================================
// 🧠 OLLAMA CONTEXT STORAGE
// ================================
let subtitleContext = "";

// ✅ Health check
app.get("/ping", (req, res) => {
  res.json({ status: "✅ EduPlay AI backend is alive!" });
});

// 1️⃣ Store subtitles
app.post("/ask/init", async (req, res) => {
  const { subtitles } = req.body;

  console.log("\n🛰️ [API] /ask/init called");
  console.log("📩 Raw body length:", subtitles ? subtitles.length : 0);

  if (!subtitles || !subtitles.trim()) {
    console.warn("⚠️ Missing subtitles in request!");
    return res.status(400).json({ error: "Missing 'subtitles' field." });
  }

  subtitleContext = subtitles.toString().slice(0, 12000);
  console.log(`🧾 Captions stored (${subtitleContext.length} chars).`);
  console.log("📖 First 200 chars:\n", subtitleContext.slice(0, 200));

  res.json({ message: "Subtitles context stored successfully." });
});

// 2️⃣ Handle questions with improved cleanup
app.post("/ask", async (req, res) => {
  const { question } = req.body;
  console.log("\n💬 [API] /ask called");
  console.log("❓ Question:", question);
  console.log("📚 Context chars available:", subtitleContext?.length || 0);

  const prompt = `
You are EduPlay AI, a concise and intelligent teaching assistant.

Here are the subtitles (lecture transcript) for the video:

---
${subtitleContext.slice(0, 12000)}
---

Instructions:
1. If the question relates to a concept in the transcript, explain it in simple terms.
2. If the concept is mentioned but not detailed, expand slightly using general knowledge.
3. Keep the explanation within 100 words maximum.
4. If the concept is not mentioned at all, respond exactly with:
No context available
5. Do not include headings, markdown, code, or system-style instructions in your response.

Question:
${question}

Final Answer (max 100 words, no markdown):
`;

  try {
    console.log("📤 Sending prompt to Ollama (phi3)...");
    const response = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "phi3",
        prompt,
        stream: false,
      }),
    });

    const data = await response.json();
    let answer = data?.response?.trim() || "No context available";

    // 🧹 Remove hallucinated sections
    answer = answer
      .split(/---|###|Instruction|Task|Final Answer:/i)[0]
      .replace(/\*\*|#+|>/g, "") // remove markdown or bullets
      .replace(/\s+/g, " ")
      .trim();

    // ✂️ Enforce 100-word cap
    const words = answer.split(/\s+/);
    if (words.length > 100) {
      answer = words.slice(0, 100).join(" ") + "…";
    }

    // 🧠 Fallback
    if (!answer || answer.length < 5) {
      answer = "No context available";
    }

    console.log("🤖 AI Answer:", answer);
    res.json({ answer });
  } catch (err) {
    console.error("🔥 Ollama error:", err.message);
    res.status(500).json({ error: "Failed to query Ollama API." });
  }
});

// ================================
// 🚀 START SERVER
// ================================
app.listen(PORT, () => {
  console.log(`🧠 EduPlay AI backend running at http://localhost:${PORT}`);
  console.log("🦙 Using Ollama model: phi3 (polished response mode)");
});
