# EduPlay - Technical Architecture & Flow Documentation

## Table of Contents
1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [System Architecture](#system-architecture)
4. [Component Breakdown](#component-breakdown)
5. [Data Flow & Processes](#data-flow--processes)
6. [IPC Communication](#ipc-communication)
7. [Caption Generation Flow](#caption-generation-flow)
8. [AI Integration & Question Answering](#ai-integration--question-answering)
9. [File & Subtitle Management](#file--subtitle-management)
10. [Configuration & Storage](#configuration--storage)

---

## Project Overview

**EduPlay** is a Smart Educational Media Player for students that enables:
- Watching lectures with synchronized subtitles
- Auto-generating captions using AI (OpenAI Whisper)
- Searching transcripts
- Asking AI questions directly from video content
- Full-featured media playback (pause, seek, speed control, etc.)

**Key Features:**
- Multi-format media support (video & audio)
- Hardware-accelerated playback
- Local AI integration (Ollama with phi3 model)
- Automatic caption generation with English translation
- Persistent storage of playback positions and settings
- Cross-platform support (Windows, macOS, Linux)

---

## Technology Stack

### Frontend
- **HTML/CSS/JavaScript** - UI and DOM manipulation
- **Electron Renderer Process** - Frontend application context
- **Electron IPC** - Inter-process communication

### Desktop Framework
- **Electron 28.3.3** - Cross-platform desktop application runtime
- **Node.js** - Runtime for main and backend processes

### Backend Services
- **Express.js 5.1.0** - Node.js web server framework (Port 3000)
- **CORS** - Cross-origin resource sharing
- **Body-parser** - JSON request parsing

### AI & Processing
- **OpenAI Whisper** - Speech-to-text transcription (Python)
- **Torch** - Deep learning framework for Whisper
- **Ollama** - Local LLM inference (phi3 model on port 11434)
- **LangChain** - AI orchestration

### Media Processing
- **FFmpeg 5.2.0** - Video/audio processing
- **FFprobe 3.1.0** - Media inspection
- **fluent-ffmpeg 2.1.3** - FFmpeg wrapper for Node.js
- **music-metadata 7.14.0** - Audio metadata parsing

### Storage & State Management
- **Electron Store 8.2.0** - Persistent configuration storage
- **electron-log 5.0.1** - Application logging

### Other Utilities
- **srt-to-vtt 1.1.3** - Subtitle format conversion
- **node-fetch 3.3.2** - HTTP requests (used by server for Ollama)
- **electron-updater 6.1.7** - Auto-update system

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        EduPlay Application                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────┐                          │
│  │   RENDERER PROCESS (Frontend)    │                          │
│  │                                  │                          │
│  │  • index.html / styles.css       │                          │
│  │  • renderer.js (UI Logic)        │                          │
│  │  • Media Player (HTML5 <video>)  │                          │
│  │  • Subtitle Management UI        │                          │
│  │  • AI Chat Interface             │                          │
│  │  • Playlist Management           │                          │
│  └──────────────────────────────────┘                          │
│           ↑ IPC Communication ↓                                │
│  ┌──────────────────────────────────┐                          │
│  │   MAIN PROCESS (Electron)        │                          │
│  │                                  │                          │
│  │  • main.js                       │                          │
│  │  • IPC Handlers                  │                          │
│  │  • Python Process Spawning       │                          │
│  │  • File Dialog Management        │                          │
│  │  • Window Management             │                          │
│  │  • Auto-Update Handler           │                          │
│  └──────────────────────────────────┘                          │
│           ↑ Process Spawning ↓       ↑ HTTP Requests ↓        │
│  ┌───────────────────┐         ┌──────────────────┐            │
│  │  Python Script    │         │   NODE SERVER    │            │
│  │                   │         │   (Express)      │            │
│  │ generate_caption  │         │                  │            │
│  │    .py            │         │ • /ask/init      │            │
│  │                   │         │ • /ask           │            │
│  │ • Whisper Model   │         │ • /ping          │            │
│  │ • Speech-to-Text  │         │                  │            │
│  │ • SRT Generation  │         │ (Port 3000)      │            │
│  └───────────────────┘         └──────────────────┘            │
│                                      ↑ HTTP Requests ↓         │
│                                ┌──────────────────┐             │
│                                │   Ollama LLM     │             │
│                                │   (Port 11434)   │             │
│                                │                  │             │
│                                │ Model: phi3      │             │
│                                │ (Local Language  │             │
│                                │  Model)          │             │
│                                └──────────────────┘             │
│                                                                 │
│  ┌──────────────────────────────────┐                          │
│  │      Supporting Modules          │                          │
│  │                                  │                          │
│  │  • subtitles.js                  │                          │
│  │  • mediaControl.js               │                          │
│  │  • playerUI.js                   │                          │
│  │  • fileSystem.js                 │                          │
│  │  • fullscreenManager.js          │                          │
│  │  • playbackPosition.js           │                          │
│  │  • themes.js                     │                          │
│  │  • utils.js                      │                          │
│  │  • hardwareAccelerations.js      │                          │
│  └──────────────────────────────────┘                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. **Renderer Process (Frontend)**

**Key Files:**
- `index.html` - UI structure
- `renderer.js` - Frontend logic (1500+ lines)
- `styles.css` - Styling

**Responsibilities:**
- Rendering the UI (media player, controls, playlist, AI chat)
- Handling user interactions (play, pause, seek, etc.)
- Managing playlist operations
- Displaying captions and subtitles
- Implementing search functionality
- Displaying AI responses

**Core Elements:**
```javascript
// From renderer.js - Key DOM elements
const mediaPlayer = document.getElementById("media-player");
const timeSlider = document.getElementById("time-slider");
const playlistElement = document.getElementById("playlist");
const aiButton = document.getElementById("ask-ai");
const aiPopup = document.getElementById("ai-chat-popup");
const loader = document.getElementById("container-loader");

// Global State
let playlist = [];
let currentIndex = -1;
let isLooping = false;
let isShuffling = false;
let isDragging = false;
let subtitlesReady = false;
```

---

### 2. **Main Process (Electron IPC Hub)**

**File:** `main.js`

**Responsibilities:**
- Creating and managing the application window
- Handling hardware acceleration settings
- File dialog management
- Spawning Python processes for caption generation
- Managing IPC events between Renderer and Services
- Auto-update system

**Hardware Acceleration Settings:**
```javascript
const isHardwareAccelerated = store.get("./hardwareAcceleration", true);

if (isHardwareAccelerated) {
  app.commandLine.appendSwitch("force_high_performance_gpu");
  app.commandLine.appendSwitch("ignore-gpu-blacklist");
  app.commandLine.appendSwitch("enable-gpu-rasterization");
  app.commandLine.appendSwitch("enable-zero-copy");
  app.commandLine.appendSwitch("enable-accelerated-video-decode");
  app.commandLine.appendSwitch("enable-native-gpu-memory-buffers");
  app.commandLine.appendSwitch("enable-hardware-overlays", "single-fullscreen");
  app.commandLine.appendSwitch("enable-features", "VaapiVideoDecoder");
  app.commandLine.appendSwitch("enable-features", "PlatformHEVCDecoderSupport");
}
```

**Window Creation:**
```javascript
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemote: true,
      powerPreferences: "high-performance",
    },
  });

  mainWindow.loadFile("index.html");
  remoteMain.enable(mainWindow.webContents);
}
```

---

### 3. **Backend Server (Node.js + Express)**

**File:** `server.js`

**Port:** 3000

**Responsibilities:**
- Storing subtitle context for AI queries
- Processing questions with Ollama LLM integration
- Providing API endpoints for caption initialization and questions

**Architecture:**
```javascript
const express = require("express");
const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));

// Subtitle context storage (in-memory)
let subtitleContext = "";
```

**API Endpoints:**

#### `/ping` (GET)
Health check endpoint - Verifies server is running
```javascript
app.get("/ping", (req, res) => {
  res.json({ status: "✅ EduPlay AI backend is alive!" });
});
```

#### `/ask/init` (POST)
Receives and stores subtitle text for context
```javascript
app.post("/ask/init", async (req, res) => {
  const { subtitles } = req.body;
  
  if (!subtitles || !subtitles.trim()) {
    return res.status(400).json({ error: "Missing 'subtitles' field." });
  }
  
  // Store only first 12,000 characters for performance
  subtitleContext = subtitles.toString().slice(0, 12000);
  console.log(`🧾 Captions stored (${subtitleContext.length} chars).`);
  
  res.json({ message: "Subtitles context stored successfully." });
});
```

#### `/ask` (POST)
Processes user questions using stored subtitle context with Ollama
```javascript
app.post("/ask", async (req, res) => {
  const { question } = req.body;
  
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
4. If the concept is not mentioned at all, respond exactly with: No context available
5. Do not include headings, markdown, code, or system-style instructions in your response.

Question:
${question}

Final Answer (max 100 words, no markdown):
`;

  try {
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

    // Clean up response
    answer = answer
      .split(/---|###|Instruction|Task|Final Answer:/i)[0]
      .replace(/\*\*|#+|>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // Enforce 100-word cap
    const words = answer.split(/\s+/);
    if (words.length > 100) {
      answer = words.slice(0, 100).join(" ") + "…";
    }

    res.json({ answer });
  } catch (err) {
    console.error("🔥 Ollama error:", err.message);
    res.status(500).json({ error: "Failed to query Ollama API." });
  }
});
```

---

### 4. **Python Script for Caption Generation**

**File:** `generate_caption.py`

**Dependencies:**
- `openai-whisper` - Speech recognition
- `torch` - Deep learning framework
- `ffmpeg` - Media processing

**Workflow:**
```python
import whisper
import torch
import os

def clear_vram():
    """Clear GPU memory for next operation"""
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.synchronize()

def generate_captions(video_path):
    """Generate captions from video using Whisper AI"""
    
    # Choose model and device
    model_size = "base"  # Balanced speed/accuracy
    device = "cuda" if torch.cuda.is_available() else "cpu"
    
    print(f"STATUS: Loading Whisper model ({model_size}) on {device}...", flush=True)
    model = whisper.load_model(model_size, device=device)
    
    # Transcribe with English translation
    print("STATUS: Starting transcription (English translation)...", flush=True)
    result = model.transcribe(
        video_path,
        verbose=False,
        task="translate",  # 👈 Force English translation
        language=None      # Auto-detect input language
    )
    
    # Generate SRT file
    captions_path = os.path.splitext(video_path)[0] + "_AI_captions_en.srt"
    
    print("STATUS: Generating English SRT file...", flush=True)
    with open(captions_path, "w", encoding="utf-8") as f:
        for i, segment in enumerate(result["segments"], start=1):
            f.write(f"{i}\n")
            f.write(f"{format_timestamp(segment['start'])} --> {format_timestamp(segment['end'])}\n")
            f.write(f"{segment['text'].strip()}\n\n")
    
    print(f"RESULT:{captions_path}", flush=True)

def format_timestamp(seconds: float):
    """Convert seconds to SRT timestamp format"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds * 1000) % 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"

if __name__ == "__main__":
    video_path = sys.argv[1]
    generate_captions(video_path)
    clear_vram()
```

**Output Format:**
The script outputs progress messages prefixed with status codes:
- `STATUS: <message>` - Progress update
- `RESULT: <filepath>` - Final caption file path

---

### 5. **Subtitle Management**

**File:** `subtitles.js`

**Class:** `SubtitlesManager`

**Key Features:**
- Extracts embedded subtitles from video files
- Loads external subtitle files (SRT, VTT, ASS, SSA, SUB)
- Manages subtitle delay
- Handles subtitle caching
- Integrates with AI context (sends subtitles to backend)

**Initialization:**
```javascript
class SubtitlesManager {
  constructor(mediaPlayer) {
    this.mediaPlayer = mediaPlayer;
    this.currentSubtitles = [];
    this.embeddedSubtitles = [];
    this.activeTrack = null;
    this.subtitleCache = new Map();
    this.tempDir = path.join(os.tmpdir(), "video-player-subtitles");
    this.ffmpegAvailable = initializeFfmpeg();
    
    // Load stored preferences
    this.autoLoadEnabled = store.get("autoLoadSubtitles", true);
    this.defaultLanguage = store.get("defaultSubtitleLanguage", "eng");
    this.subtitleHistory = store.get("subtitleHistory", {});
  }
}
```

**Sending Subtitles to AI Backend:**
```javascript
const subtitleText = fs.readFileSync(filePath, "utf-8").trim();

console.log("🧠 Sending subtitles to AI context...");
const response = await fetch("http://127.0.0.1:3000/ask/init", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ subtitles: subtitleText }),
});

const data = await response.json();
if (data?.message) {
  console.log("✅ AI context updated:", data.message);
  window.subtitlesReady = true; // 🚀 Global flag for AI chat
}
```

---

## Data Flow & Processes

### **Flow Diagram: Complete User Journey**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         USER OPENS MEDIA FILE                               │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     ↓
                    ┌─────────────────────────────────┐
                    │  File Dialog (Main Process IPC)  │
                    │  ✓ Validates file format        │
                    │  ✓ Checks supported extensions  │
                    └────────────┬────────────────────┘
                                 ↓
                    ┌──────────────────────────────────┐
                    │   Load Video in Renderer         │
                    │  ✓ Set <video> element src      │
                    │  ✓ Parse media metadata         │
                    │  ✓ Display media info           │
                    └────────────┬─────────────────────┘
                                 ↓
        ┌────────────────────────────────────────────────────────┐
        │         OPTIONAL: Generate Auto-Captions              │
        │   (User clicks "Generate Captions" button)             │
        └────────────┬─────────────────────────────────────────┘
                     ↓
        ┌─────────────────────────────────────────────┐
        │  Renderer sends IPC: "generate-captions"   │
        └────────────┬────────────────────────────────┘
                     ↓
        ┌──────────────────────────────────────────────────┐
        │  Main Process receives IPC event               │
        │  ✓ Verify video file exists                    │
        │  ✓ Spawn Python child process                  │
        └────────────┬─────────────────────────────────────┘
                     ↓
        ┌──────────────────────────────────────────────────┐
        │  Python Script (generate_caption.py)           │
        │  ✓ Initialize Whisper model                    │
        │  ✓ Transcribe video                            │
        │  ✓ Generate SRT file                           │
        │  ✓ Output: "RESULT:/path/to/caption.srt"      │
        └────────────┬─────────────────────────────────────┘
                     ↓
        ┌──────────────────────────────────────────────────┐
        │  Main Process receives RESULT from Python      │
        │  ✓ Extract caption file path                   │
        │  ✓ Send IPC: "caption-done"                    │
        └────────────┬─────────────────────────────────────┘
                     ↓
        ┌──────────────────────────────────────────────────┐
        │  Renderer receives "caption-done" IPC          │
        │  ✓ Load captions into video player             │
        │  ✓ Hide loading overlay                         │
        │  ✓ Resume playback                             │
        └─────────────────────────────────────────────────┘
                     ↓
        ┌──────────────────────────────────────────────────┐
        │    OPTIONAL: Load/Enable Subtitles             │
        │  (User selects subtitles from menu)             │
        └────────────┬─────────────────────────────────────┘
                     ↓
        ┌──────────────────────────────────────────────────┐
        │  SubtitlesManager initializes subtitle track   │
        │  ✓ Parse SRT file                              │
        │  ✓ Create HTML <track> elements                │
        │  ✓ Attach to <video> element                   │
        └────────────┬─────────────────────────────────────┘
                     ↓
        ┌──────────────────────────────────────────────────┐
        │  Read subtitle text from file                  │
        │  POST to http://localhost:3000/ask/init        │
        │  Server stores subtitle context in memory      │
        └────────────┬─────────────────────────────────────┘
                     ↓
        ┌──────────────────────────────────────────────────┐
        │  Set global flag: window.subtitlesReady = true  │
        │  AI Chat becomes available to user              │
        └──────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                     USER ASKS AI QUESTION                                   │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     ↓
                    ┌──────────────────────────────────┐
                    │  User types question in AI chat  │
                    │  Clicks "Send" or presses Enter  │
                    └────────────┬─────────────────────┘
                                 ↓
                    ┌──────────────────────────────────┐
                    │  Renderer: sendMessage()         │
                    │  ✓ Check subtitlesReady flag     │
                    │  ✓ Display user message          │
                    └────────────┬─────────────────────┘
                                 ↓
                    ┌──────────────────────────────────┐
                    │  POST to localhost:3000/ask      │
                    │  Body: { question: "..." }       │
                    └────────────┬─────────────────────┘
                                 ↓
                    ┌──────────────────────────────────┐
                    │  Backend Server receives question│
                    │  ✓ Build LLM prompt with context│
                    │  ✓ Combine stored subtitles      │
                    └────────────┬─────────────────────┘
                                 ↓
                    ┌──────────────────────────────────┐
                    │  POST to Ollama API              │
                    │  http://127.0.0.1:11434/api/     │
                    │  generate (phi3 model)           │
                    └────────────┬─────────────────────┘
                                 ↓
                    ┌──────────────────────────────────┐
                    │  Ollama processes with context   │
                    │  Returns generated response      │
                    └────────────┬─────────────────────┘
                                 ↓
                    ┌──────────────────────────────────┐
                    │  Backend Server processes        │
                    │  ✓ Clean up response             │
                    │  ✓ Remove markdown              │
                    │  ✓ Enforce 100-word limit       │
                    │  ✓ Return JSON response         │
                    └────────────┬─────────────────────┘
                                 ↓
                    ┌──────────────────────────────────┐
                    │  Renderer displays AI response   │
                    │  in chat window                  │
                    └──────────────────────────────────┘
```

---

## IPC Communication

### **IPC Events Reference**

**Renderer → Main (Sending)**

| Event | Handler | Purpose | Payload |
|-------|---------|---------|---------|
| `enforce-min-size` | `ipcMain.on()` | Set minimum window dimensions | `{ width: number, height: number }` |
| `generate-captions` | `ipcMain.on()` | Start caption generation | None |

**Renderer → Main (Handling Requests)**

| Event | Handler | Purpose | Returns |
|-------|---------|---------|---------|
| `open-files` | `ipcMain.handle()` | Open file dialog | File path(s) |
| `open-folder` | `ipcMain.handle()` | Open folder dialog | Folder path |
| `open-subtitle-file` | `ipcMain.handle()` | Select subtitle file | File path(s) |
| `get-current-subtitle-path` | `ipcMain.handle()` | Get active subtitle | File path or null |

**Main → Renderer (Sending)**

| Event | Usage | Purpose | Payload |
|-------|-------|---------|---------|
| `caption-start` | `mainWindow.webContents.send()` | Notify caption gen started | None |
| `caption-status` | `mainWindow.webContents.send()` | Send progress status | `{ status: string }` |
| `caption-done` | `mainWindow.webContents.send()` | Notify caption complete | `{ filePath: string }` |
| `file-opened` | `mainWindow.webContents.send()` | Notify file opened | `filePath: string` |
| `update-message` | `mainWindow.webContents.send()` | Send update status | `string` |
| `update-progress` | `mainWindow.webContents.send()` | Send download progress | `number (0-100)` |

**Renderer Listeners (Receive)**

```javascript
// Listen for caption generation start
ipcRenderer.on("caption-start", () => {
  console.log("Caption generation started");
  loader.style.display = "flex"; // Show loading overlay
  mediaPlayer.pause();
});

// Listen for status updates
ipcRenderer.on("caption-status", (event, { status }) => {
  console.log("STATUS:", status);
  // Update UI with progress message
});

// Listen for completion
ipcRenderer.on("caption-done", async (event, { filePath }) => {
  console.log("Caption generation done");
  loader.style.display = "none"; // Hide loading overlay
  mediaPlayer.play(); // Resume playback
  // Load subtitle file automatically
});

// Listen for file open event
ipcRenderer.on("file-opened", async (_, filePath) => {
  // Play the file that was opened
  playFile(filePath);
});
```

---

## Caption Generation Flow

### **Detailed Process**

```
User Interface (index.html)
        ↓
[Generate Captions Button Click]
        ↓
renderer.js → document.addEventListener('click', ...)
        ↓
ipcRenderer.send("generate-captions")
        ↓
main.js → ipcMain.on("generate-captions", ())
        ↓
mainWindow.webContents.send("caption-start")
├─→ Show loading overlay in renderer.js
├─→ Pause video playback
└─→ Prepare UI for long operation
        ↓
Main Process validates:
├─ currentFilePath exists
├─ generate_caption.py exists
└─ Python executable available
        ↓
const py = spawn("python3", [scriptPath, currentFilePath])
        ↓
generate_caption.py EXECUTION
├─ Receive video_path from command line argument
├─ Check CUDA availability (GPU acceleration)
├─ Load Whisper model ("base" for speed)
├─ Transcribe video:
│  ├─ task="translate" (force English output)
│  ├─ language=None (auto-detect input)
│  └─ Output: { segments: [...], text: "..." }
├─ Format segments to SRT:
│  1. Index number
│  2. Timestamp range (HH:MM:SS,mmm --> HH:MM:SS,mmm)
│  3. Text content
│  4. Blank line separator
└─ Output: "RESULT:/path/to/video_AI_captions_en.srt"
        ↓
main.js captures Python stdout
├─ Checks for "STATUS:" prefix → Update UI
├─ Checks for "RESULT:" prefix → Extract path
└─ Checks for "PARTIAL:" prefix → Real-time display (if implemented)
        ↓
mainWindow.webContents.send("caption-done", { filePath })
        ↓
renderer.js receives "caption-done" event
├─ Hide loading overlay
├─ Resume video playback
└─ Automatically load subtitle track from filePath
        ↓
SubtitlesManager loads SRT file
├─ Parse SRT content
├─ Create HTML <track> element
├─ Set track source to SRT file
└─ Attach to <video> element
        ↓
✅ Captions now visible during playback
```

### **Code: Caption Generation Initiation (renderer.js)**

```javascript
// When user clicks "Generate Captions" button
document.addEventListener('click', function(event) {
  if (event.target.id === 'generate-captions-btn') {
    // Send IPC message to main process
    ipcRenderer.send("generate-captions");
  }
});

// Listen for start event
ipcRenderer.on("caption-start", () => {
  console.log("Caption generation started from renderer.js");
  loader.style.display = "flex";    // Show loading overlay
  mediaPlayer.pause();               // Pause if playing
});

// Listen for status updates
ipcRenderer.on("caption-status", (event, { status }) => {
  console.log("STATUS", status);
  // Could update a status label with the message
});

// Listen for completion
ipcRenderer.on("caption-done", async (event, { filePath }) => {
  console.log("Caption generation done in renderer.js");
  loader.style.display = "none";     // Hide loading overlay
  mediaPlayer.play();                // Resume playback
  // Subtitle file is now ready to load
});
```

### **Code: Main Process Handler (main.js)**

```javascript
ipcMain.on("generate-captions", () => {
  // Verify a file is loaded
  if (!currentFilePath) {
    console.error("No file loaded yet!");
    return;
  }

  // Notify renderer that generation is starting
  mainWindow.webContents.send("caption-start");

  const scriptPath = path.join(__dirname, "generate_caption.py");

  if (!fs.existsSync(scriptPath)) {
    mainWindow.webContents.send("no-caption-path", { scriptPath });
    return;
  }

  // Spawn Python subprocess
  const py = spawn("python3", [scriptPath, currentFilePath], { 
    shell: false 
  });

  // Handle stdout from Python script
  py.stdout.on("data", (data) => {
    const msg = data.toString().trim();

    if (msg.startsWith("PARTIAL:")) {
      // Real-time caption display (optional feature)
      const [timeRange, text] = msg.split(":").slice(1);
      const [start, end] = timeRange.split("-");
      updateSubtitleOverlay(text, parseFloat(start), parseFloat(end));
      
    } else if (msg.startsWith("STATUS:")) {
      // Progress update
      const statusmsg = msg.replace("STATUS:", "").trim();
      mainWindow.webContents.send("caption-status", { status: statusmsg });
      
    } else if (msg.startsWith("RESULT:")) {
      // Caption file generated successfully
      captionsPath = msg.replace("RESULT:", "").trim();
      mainWindow.webContents.send("caption-done", { filePath: captionsPath });
      
    } else {
      console.log("PYTHON OUT:", msg);
    }
  });

  // Handle stderr
  py.stderr.on("data", (data) => {
    console.error("Python error:", data.toString());
  });

  // Handle process close
  py.on("close", (code) => {
    console.log(`Captions process finished with code ${code}`);
  });
});
```

---

## AI Integration & Question Answering

### **System Architecture: Renderer → Backend → Ollama**

```
┌──────────────────────────────────────────────────────────────────────┐
│                   EduPlay Renderer (Frontend)                        │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ AI Chat Interface                                              │ │
│  │                                                                │ │
│  │ [User Question Input Box]                                     │ │
│  │ User: "What is quantum entanglement?"                         │ │
│  │ [Send Button]                                                 │ │
│  │                                                                │ │
│  │ [Chat History Display]                                        │ │
│  │ Bot: "Quantum entanglement is..."                             │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  HTTP POST: localhost:3000/ask                                      │
│  { "question": "What is quantum entanglement?" }                    │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│              Backend Server (Node.js/Express)                        │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Route Handler: POST /ask                                       │ │
│  │                                                                │ │
│  │ 1. Extract question from request                              │ │
│  │ 2. Build prompt with stored subtitle context                  │ │
│  │ 3. Include system instructions for response format            │ │
│  │ 4. Send to Ollama API                                         │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  In-Memory Storage:                                                 │
│  let subtitleContext = "00:00:00,000 --> 00:00:05,000\n"           │
│                        "Welcome to the lecture..."                 │
│                                                                      │
│  HTTP POST: http://127.0.0.1:11434/api/generate                     │
│  {                                                                   │
│    "model": "phi3",                                                 │
│    "prompt": "[System prompt] [Subtitles] [Question]",             │
│    "stream": false                                                  │
│  }                                                                   │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│                  Ollama Local LLM Service                            │
│                  (Running on Port 11434)                            │
│                                                                      │
│  Model: phi3 (Small, fast language model)                          │
│                                                                      │
│  Processing:                                                        │
│  1. Receive prompt with context                                    │
│  2. Generate response based on prompt                              │
│  3. Return generated text                                          │
│                                                                      │
│  Output: { "response": "Quantum entanglement is a phenomenon..." }  │
└──────────────────────────────────────────────────────────────────────┘
                              ↓ (Response processed)
                              ↓ (Cleaned of markdown)
                              ↓ (Capped at 100 words)
┌──────────────────────────────────────────────────────────────────────┐
│              Backend Server (Response Processing)                    │
│                                                                      │
│  1. Remove markdown formatting                                      │
│  2. Split by dividers and remove extra sections                     │
│  3. Clean special characters                                        │
│  4. Limit to maximum 100 words                                      │
│  5. Send JSON response back to Renderer                             │
│                                                                      │
│  HTTP Response: 200 OK                                              │
│  { "answer": "Quantum entanglement is a phenomenon where..." }      │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│                   EduPlay Renderer (Display)                         │
│                                                                      │
│  1. Update chat with bot response                                   │
│  2. Scroll to latest message                                        │
│  3. Keep user input field active for next question                  │
│                                                                      │
│  [Chat History Display]                                             │
│  User: "What is quantum entanglement?"                              │
│  Bot: "Quantum entanglement is a phenomenon..."                     │
│                                                                      │
│  [User Question Input Box]  [Send Button]                           │
└──────────────────────────────────────────────────────────────────────┘
```

### **Step 1: Subtitle Initialization**

When user loads/enables subtitles, the subtitle text is sent to the backend:

```javascript
// From subtitles.js - When subtitle is loaded
const subtitleText = fs.readFileSync(filePath, "utf-8").trim();

if (!subtitleText) {
  console.warn("⚠️ Subtitle file is empty!");
  return;
}

console.log("🧠 Sending subtitles to AI context...");
const response = await fetch("http://127.0.0.1:3000/ask/init", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ subtitles: subtitleText }),
});

const data = await response.json();
if (data?.message) {
  console.log("✅ AI context updated:", data.message);
  window.subtitlesReady = true; // 🚀 Enable AI chat
}
```

**Backend Handler:**
```javascript
// server.js
app.post("/ask/init", async (req, res) => {
  const { subtitles } = req.body;
  
  console.log("\n🛰️ [API] /ask/init called");
  console.log("📩 Raw body length:", subtitles ? subtitles.length : 0);
  
  if (!subtitles || !subtitles.trim()) {
    console.warn("⚠️ Missing subtitles in request!");
    return res.status(400).json({ error: "Missing 'subtitles' field." });
  }
  
  // Store only first 12,000 characters for performance
  subtitleContext = subtitles.toString().slice(0, 12000);
  console.log(`🧾 Captions stored (${subtitleContext.length} chars).`);
  console.log("📖 First 200 chars:\n", subtitleContext.slice(0, 200));
  
  res.json({ message: "Subtitles context stored successfully." });
});
```

### **Step 2: Question Processing with Ollama**

When user submits a question:

```javascript
// From renderer.js - sendMessage function
async function sendMessage() {
  const text = aiInput.value.trim();
  if (!text) return;
  
  // Check if subtitles are ready
  if (!subtitlesReady) {
    const warnMsg = document.createElement("div");
    warnMsg.className = "ai-message ai-bot";
    warnMsg.textContent = "⚠️ Please wait — subtitles are still being processed by AI.";
    aiBody.appendChild(warnMsg);
    aiBody.scrollTop = aiBody.scrollHeight;
    return;
  }
  
  // Display user message
  const userMsg = document.createElement("div");
  userMsg.className = "ai-message ai-user";
  userMsg.textContent = text;
  aiBody.appendChild(userMsg);
  aiInput.value = "";
  
  // Display placeholder while thinking
  const botMsg = document.createElement("div");
  botMsg.className = "ai-message ai-bot";
  botMsg.textContent = "Thinking...";
  aiBody.appendChild(botMsg);
  aiBody.scrollTop = aiBody.scrollHeight;
  
  try {
    console.log("🧠 Sending question to AI backend:", text);
    const res = await fetch("http://localhost:3000/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: text }),
    });
    
    const data = await res.json();
    console.log("🤖 AI Answer:", data.answer);
    
    // Update placeholder with actual response
    botMsg.textContent = data.answer && data.answer.trim()
      ? data.answer
      : "⚠️ Hmm, I couldn't find an answer for that.";
      
  } catch (error) {
    console.error("🚨 AI request failed:", error);
    botMsg.textContent = "⚠️ Error: Couldn't reach the AI server. Make sure it's running.";
  }
  
  aiBody.scrollTop = aiBody.scrollHeight;
}
```

**Backend Processing:**
```javascript
// server.js - /ask endpoint
app.post("/ask", async (req, res) => {
  const { question } = req.body;
  
  console.log("\n💬 [API] /ask called");
  console.log("❓ Question:", question);
  console.log("📚 Context chars available:", subtitleContext?.length || 0);
  
  // Build comprehensive prompt
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
    
    // 🧹 Clean up response - remove markdown and extra sections
    answer = answer
      .split(/---|###|Instruction|Task|Final Answer:/i)[0]
      .replace(/\*\*|#+|>/g, "")  // Remove markdown
      .replace(/\s+/g, " ")       // Normalize whitespace
      .trim();
    
    // ✂️ Enforce 100-word cap
    const words = answer.split(/\s+/);
    if (words.length > 100) {
      answer = words.slice(0, 100).join(" ") + "…";
    }
    
    // 🧠 Fallback for bad responses
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
```

### **Ollama Integration Details**

**Connection Specs:**
- **URL:** http://127.0.0.1:11434
- **Model:** phi3 (Microsoft's small language model)
- **API Endpoint:** `/api/generate`
- **Streaming:** Disabled (`stream: false`) for complete response

**Request Format:**
```json
{
  "model": "phi3",
  "prompt": "...",
  "stream": false
}
```

**Response Format:**
```json
{
  "response": "Generated text content...",
  "context": [...],
  "model": "phi3",
  "created_at": "2024-01-01T12:00:00Z",
  "total_duration": 1234567890,
  "load_duration": 123456789,
  "prompt_eval_count": 100,
  "eval_count": 50,
  "eval_duration": 1111111101
}
```

---

## File & Subtitle Management

### **Supported Media Formats**

```javascript
// From constants.js
const supportedFormats = [
  // Video formats
  '.mp4', '.mkv', '.avi', '.webm', '.mov', '.flv', 
  '.m4v', '.3gp', '.wmv', '.ts',
  
  // Audio formats
  '.mp3', '.wav', '.ogg', '.aac', '.m4a', 
  '.flac', '.wma', '.opus'
];

const mimeTypes = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': ['video/x-matroska', 'video/mkv', 'application/x-matroska'],
  '.mov': 'video/quicktime',
  '.H265': 'video/H265',
  '.mpeg': 'video/mpeg',
  '.raw': 'video/raw',
  '.ts': 'video/mp2t'
};
```

### **Subtitle File Support**

**Supported Formats:**
- SRT (.srt) - SubRip Subtitle
- VTT (.vtt) - WebVTT (Video Text Tracks)
- ASS (.ass) - Advanced SubStation Alpha
- SSA (.ssa) - SubStation Alpha
- SUB (.sub) - Various formats

**SRT Format Example:**
```
1
00:00:00,000 --> 00:00:05,000
Welcome to the lecture

2
00:00:05,000 --> 00:00:10,500
Today we will discuss quantum mechanics

3
00:00:10,500 --> 00:00:15,000
Quantum entanglement is a key concept
```

### **Subtitle Loading Process**

```javascript
// From subtitles.js - loadSubtitleFile method

async loadSubtitleFile(filePath, languageCode = null) {
  try {
    // Read subtitle file
    const subtitleText = await fs.readFileSync(filePath, "utf-8");
    
    // Parse SRT content
    const tracks = this.parseSRT(subtitleText);
    
    // Store in cache
    this.subtitleCache.set(filePath, tracks);
    
    // Create HTML track element
    const track = document.createElement("track");
    track.kind = "subtitles";
    track.srclang = languageCode || "en";
    track.src = filePath;
    track.label = `Subtitles (${languageCode})`;
    
    // Add to video element
    this.mediaPlayer.appendChild(track);
    
    // Mark as active
    this.activeTrack = track;
    
    // Send to AI backend for context
    await this.sendSubtitleContextToAI(subtitleText);
    
  } catch (error) {
    console.error("Failed to load subtitle file:", error);
  }
}

async sendSubtitleContextToAI(subtitleText) {
  try {
    const response = await fetch("http://127.0.0.1:3000/ask/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subtitles: subtitleText }),
    });
    
    const data = await response.json();
    if (data?.message) {
      window.subtitlesReady = true;
      console.log("✅ AI context updated");
    }
  } catch (error) {
    console.error("❌ Failed to send subtitles to AI:", error);
  }
}
```

---

## Configuration & Storage

### **Persistent Storage (Electron Store)**

**File Location:** User's application data directory (OS-dependent)
- **Windows:** `%APPDATA%\EduPlay`
- **macOS:** `~/Library/Application Support/EduPlay`
- **Linux:** `~/.config/EduPlay`

**Stored Settings:**

```javascript
const store = new Store();

// Playback settings
store.get("rememberPlayback", true)              // Remember last position
store.get("lastVolume", 0.5)                    // Last volume level (0-1)
store.get("lastPosition", {})                   // Last play position per file
store.get("playbackRate", 1.0)                  // Last playback speed

// Subtitle settings
store.get("autoLoadSubtitles", true)            // Auto-load subtitles
store.get("defaultSubtitleLanguage", "eng")     // Default subtitle language
store.get("subtitleDelay", 0)                   // Subtitle timing offset
store.get("lastSelectedLanguage", null)         // Last used subtitle language
store.get("subtitleHistory", {})                // Subtitle usage history

// Display settings
store.get("lastTheme", "dark")                  // Theme preference
store.get("hardwareAcceleration", true)         // GPU acceleration enabled

// AI settings
store.get("pendingUpdateVersion", null)         // App update pending

// Release notes cache
store.get(`releaseNotes.${version}`, "")        // Stored release notes
```

**Usage Example:**
```javascript
// Get stored value with default
const rememberPlayback = store.get("rememberPlayback", true);

// Set value
store.set("lastVolume", 0.75);

// Delete value
store.delete("lastPosition");

// Check if key exists
if (store.has("customSetting")) {
  // Key exists
}

// Clear all settings
store.clear();
```

### **Command Line Arguments & Environment**

**Hardware Acceleration Flags (main.js):**
```javascript
if (isHardwareAccelerated) {
  app.commandLine.appendSwitch("force_high_performance_gpu");
  app.commandLine.appendSwitch("ignore-gpu-blacklist");
  app.commandLine.appendSwitch("enable-gpu-rasterization");
  app.commandLine.appendSwitch("enable-zero-copy");
  app.commandLine.appendSwitch("enable-accelerated-video-decode");
  app.commandLine.appendSwitch("enable-native-gpu-memory-buffers");
  app.commandLine.appendSwitch("enable-hardware-overlays", "single-fullscreen");
  app.commandLine.appendSwitch("enable-features", "VaapiVideoDecoder");
  app.commandLine.appendSwitch("enable-features", "PlatformHEVCDecoderSupport");
}
```

### **Python Environment Requirements**

**requirements.txt:**
```
openai-whisper      # Speech recognition AI
torch               # Deep learning framework
tqdm                # Progress bars
numpy               # Numerical computing
regex               # Advanced regex support
requests            # HTTP requests
```

**Installation:**
```bash
pip install -r requirements.txt
```

---

## Error Handling & Edge Cases

### **Caption Generation Errors**

```javascript
// Check if Python script exists
if (!fs.existsSync(scriptPath)) {
  mainWindow.webContents.send("no-caption-path", { scriptPath });
  return;
}

// Check if file is loaded
if (!currentFilePath) {
  console.error("No file loaded yet!");
  return;
}

// Handle Python stderr
py.stderr.on("data", (data) => {
  console.error("Python error:", data.toString());
  // Could notify user of error
});
```

### **AI Query Errors**

```javascript
// Handle network errors or Ollama not running
catch (error) {
  console.error("🚨 AI request failed:", error);
  botMsg.textContent = "⚠️ Error: Couldn't reach the AI server. Make sure it's running.";
}

// Handle Ollama API errors
catch (err) {
  console.error("🔥 Ollama error:", err.message);
  res.status(500).json({ error: "Failed to query Ollama API." });
}
```

### **Subtitle Loading Errors**

```javascript
// Empty subtitle file
if (!subtitleText) {
  console.warn("⚠️ Subtitle file is empty!");
  return;
}

// Unexpected AI response format
if (!data?.message) {
  console.warn("⚠️ Unexpected AI response:", data);
}

// FFmpeg not available
if (!fs.existsSync(ffmpegBinary)) {
  throw new Error(`FFmpeg binary not found at: ${ffmpegBinary}`);
}
```

---

## Build & Distribution

### **Build Scripts**

From `package.json`:
```bash
npm start                    # Start dev app: electron --ozone-platform=x11 .
npm run build               # Build installer: electron-builder
npm run dist                # Create distribution: electron-builder
npm run dist:all            # Build for all platforms
npm run dist:win            # Build Windows installer
npm run dist:linux          # Build Linux installer
npm run dist:mac            # Build macOS installer
```

### **Build Configuration**

```json
{
  "build": {
    "appId": "com.eduplay.mediaplayer",
    "productName": "EduPlay",
    "files": [
      "main.js",
      "index.html",
      "renderer.js",
      "*.js",
      "package.json",
      "generate_caption.py",
      "requirements.txt",
      "ffmpeg-binaries/**/*"
    ]
  }
}
```

---

## Security Considerations

1. **Context Isolation:** Disabled (`contextIsolation: false`) for Node integration
2. **Node Integration:** Enabled in webPreferences for Electron features
3. **Remote Module:** Enabled for dynamic component loading
4. **Content Security Policy:** Configured to allow local resources and media

---

## Performance Optimization

### **Hardware Acceleration**
- GPU-accelerated video decoding
- Hardware rendering overlays
- Zero-copy video transfer
- HEVC/H.265 codec support

### **Memory Management**
```python
# From generate_caption.py
def clear_vram():
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.synchronize()
```

### **Caching**
- Subtitle caching in memory
- Extracted subtitle caching
- Metadata caching via music-metadata

---

## Troubleshooting Guide

| Issue | Cause | Solution |
|-------|-------|----------|
| AI chat not responding | Ollama not running | Start Ollama: `ollama serve` |
| Caption generation timeout | Large video file | Use smaller video or check GPU |
| Subtitles not displaying | File not recognized | Convert to SRT format |
| Slow playback | GPU not enabled | Enable hardware acceleration in settings |
| Python script not found | Incorrect path | Verify `generate_caption.py` exists in root |

---

## Dependencies Tree

```
eduplay/
├── Electron (Desktop Runtime)
│   ├── Main Process (Node.js)
│   │   ├── Express Server
│   │   │   └── Ollama HTTP Client
│   │   └── Child Process (Python)
│   │       ├── Whisper AI
│   │       ├── Torch
│   │       └── GPU Manager
│   └── Renderer Process
│       ├── HTML5 Video Player
│       ├── Electron IPC Client
│       └── Fetch API (HTTP Client)
├── Storage (Electron Store)
├── FFmpeg Integration
│   ├── FFmpeg Binary
│   └── FFprobe Binary
└── External Services
    ├── Ollama LLM (Port 11434)
    └── File System (OS-dependent)
```

---

## Conclusion

EduPlay is a sophisticated educational media player that seamlessly integrates multiple AI and media processing technologies:

1. **Frontend** provides intuitive UI for video playback and AI interaction
2. **IPC Communication** enables secure inter-process messaging
3. **Python Whisper** generates captions with auto-translation
4. **Express Backend** orchestrates AI queries and subtitle management
5. **Ollama LLM** provides local, privacy-focused AI assistance
6. **Storage Layer** persists user preferences and playback history

The architecture is designed for performance, privacy, and extensibility, allowing users to work with media files entirely offline with AI assistance.

