const { ipcRenderer } = require("electron");
const { parseFile } = require("music-metadata");
const path = require("path");
const Store = new require("electron-store");
const store = new Store();
const fs = require("fs").promises;
const { applyTheme, getCurrentTheme } = require("./themes");
const { formatTime, debounce } = require("./utils");
const {
  INACTIVITY_TIMEOUT,
  MINIMUM_POSITION,
  SEEK_UPDATE_INTERVAL,
  MIN_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  DOUBLE_CLICK_DELAY,
  supportedFormats,
  mimeTypes,
} = require("./constants");
const { openFiles, openFolder } = require("./fileSystem");
const {
  volumeSlider,
  previousBtn,
  nextBtn,
  playPauseBtn,
  muteBtn,
  updateVolume,
  toggleMute,
  playPrevious,
  playNext,
  togglePlayPause,
} = require("./mediaControl");
const {
  adjustForScreenSize,
  updateWindowTitle,
  hideControls,
  showControls,
} = require("./playerUI");
const {
  isFullscreenSupported,
  handleFullscreenChange,
  toggleFullscreen,
} = require("./fullscreenManager");
const {
  showResumeDialog,
  removeLastPosition,
  getLastPosition,
  saveLastPosition,
} = require("./playbackPosition");

const HardwareAcceleration = require("./hardwareAccelerations");
const SubtitlesManager = require("./subtitles");

let playlist = [];
let currentIndex = -1;
let isLooping = false;
let isLoopingCurrent = false; // For single media loop
let isShuffling = false;
let shuffledIndices = [];
let currentShuffleIndex = -1;
let clickTimeout = null;
let controlsTimeout;
let isFullscreen = false;
let seekTargetTime = null;
let isSeekingSmooth = false;
let lastSeekUpdate = 0;
let isDragging = false;
let animationFrame;
let lastVolume = store.get("lastVolume", 0.5); // 50%
let volumeChanged = false;

const rememberPlayback = store.get("rememberPlayback", true); // Default to true for existing users

document.addEventListener("DOMContentLoaded", () => {
  applyTheme(getCurrentTheme());
});

// DOM Elements
const mediaPlayer = document.getElementById("media-player");
const timeSlider = document.getElementById("time-slider");
const timeDisplay = document.getElementById("time-display");
const fullscreenBtn = document.getElementById("fullscreen");
const shuffleBtn = document.getElementById("shuffle");
const loopBtn = document.getElementById("loop");
const playlistElement = document.getElementById("playlist");
const playerSection = document.querySelector(".player-section");
const playlistPanel = document.getElementById("playlist-panel");
const appContainer = document.querySelector(".app-container");
const clearPlaylistBtn = document.getElementById("clear-playlist");
const togglePlaylistButton = document.getElementById("toggle-playlist");
const loader = document.getElementById("container-loader");
const searchInput = document.getElementById("query");
const leftArrow = document.getElementById("arrow-left");
const rightArrow = document.getElementById("arrow-right");
const searchCounter = document.getElementById("search-counter");
const aiButton = document.getElementById("ask-ai");
const aiPopup = document.getElementById("ai-chat-popup");
const closeChat = document.getElementById("close-ai-chat");
const sendBtn = document.getElementById("send-ai");
const aiInput = document.getElementById("ai-input");
const aiBody = document.getElementById("ai-chat-body");
const learningPopup = document.getElementById("learning-popup");
const learningContent = document.getElementById("learning-content");
const learningStatus = document.getElementById("learning-status");
const learningCacheStatus = document.getElementById("learning-cache-status");
const learningTabs = Array.from(document.querySelectorAll(".learning-tab"));
const textModelInput = document.getElementById("learning-text-model");
const visionModelInput = document.getElementById("learning-vision-model");
textModelInput.value = store.get("learningTextModel", "phi3");
visionModelInput.value = store.get("learningVisionModel", "qwen2.5vl:3b");
textModelInput.addEventListener("change", () => store.set("learningTextModel", textModelInput.value.trim() || "phi3"));
visionModelInput.addEventListener("change", () => store.set("learningVisionModel", visionModelInput.value.trim() || "qwen2.5vl:3b"));
let activeMediaPath = null;
let activeLearningTab = "flashcards";
let learningAbortController = null;
let currentFlashcards = [];
let currentStoryboard = [];

document.addEventListener("DOMContentLoaded", () => {
  const speedToggle = document.getElementById("speed-toggle");
  const speedOptions = document.querySelector(".speed-options");
  const speedButton = document.querySelector(".speed-button");
  const video = document.getElementById("media-player");

  // Toggle dropdown
  speedToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    speedButton.classList.toggle("open");
    speedOptions.classList.toggle("open");
  });

  // Handle speed selection
  document.querySelectorAll(".speed-option").forEach((option) => {
    option.addEventListener("click", (e) => {
      e.stopPropagation();
      const speed = parseFloat(option.dataset.speed);

      // Update video speed
      if (video) video.playbackRate = speed;

      // Update button text
      speedToggle.textContent = `${speed}x`;

      // Update active state
      document
        .querySelectorAll(".speed-option")
        .forEach((opt) => opt.classList.remove("active"));
      option.classList.add("active");

      // Close dropdown
      speedButton.classList.remove("open");
      speedOptions.classList.remove("open");
    });
  });

  // Close dropdown when clicking outside
  document.addEventListener("click", () => {
    speedButton.classList.remove("open");
    speedOptions.classList.remove("open");
  });
});

mediaPlayer.volume = lastVolume;
volumeSlider.value = lastVolume * 100;

const timePreview = document.createElement("div");
timePreview.className = "time-preview";
timeSlider.parentElement.appendChild(timePreview);

window.addEventListener("resize", () => {
  1;
  const width = Math.max(window.innerWidth, MIN_WINDOW_WIDTH);
  const height = Math.max(window.innerHeight, MIN_WINDOW_HEIGHT);

  // Enforce minimum width through CSS
  appContainer.style.minWidth = `${MIN_WINDOW_WIDTH}px`;
  playerSection.style.minWidth = `${MIN_WINDOW_WIDTH - 320}px`; // 320px is playlist panel width

  if (width < MIN_WINDOW_WIDTH || height < MIN_WINDOW_HEIGHT) {
    ipcRenderer.send("enforce-min-size", {
      width: width,
      height: height,
    });
  }
});

window.addEventListener("load", adjustForScreenSize);
window.addEventListener("resize", adjustForScreenSize);

togglePlaylistButton.addEventListener("click", () => {
  playlistPanel.classList.toggle("hidden");
  togglePlaylistButton.classList.toggle("active");
  appContainer.classList.toggle("playlist-hidden");
});

mediaPlayer.addEventListener("click", (e) => {
  // Prevent text selection on double click
  if (e.detail > 1) {
    e.preventDefault();
  }

  // If this is the first click
  if (!clickTimeout) {
    clickTimeout = setTimeout(() => {
      // If the timeout completes without a second click, it's a single click
      if (clickTimeout) {
        togglePlayPause();
      }
      clickTimeout = null;
    }, DOUBLE_CLICK_DELAY);
  } else {
    // This is a double click
    clearTimeout(clickTimeout);
    clickTimeout = null;
    toggleFullscreen();
  }
});

const subtitlesManager = (window.subtitlesManager = new SubtitlesManager(
  mediaPlayer
));
const hardwareAcceleration = new HardwareAcceleration(mediaPlayer);

volumeSlider.style.setProperty("--volume-percent", volumeSlider.value);

// Clear the timeout if the user moves away or starts dragging
mediaPlayer.addEventListener("mouseleave", () => {
  if (clickTimeout) {
    clearTimeout(clickTimeout);
    clickTimeout = null;
  }
});

mediaPlayer.addEventListener("mousedown", (e) => {
  if (e.detail > 1) {
    e.preventDefault();
  }
});

function toggleHardwareAcceleration(enabled) {
  hardwareAcceleration.toggle(enabled);

  // Reload current media to apply changes if something is playing
  if (currentIndex !== -1 && playlist[currentIndex]) {
    const currentTime = mediaPlayer.currentTime;
    const wasPlaying = !mediaPlayer.paused;
    const currentPath = playlist[currentIndex].path;

    mediaPlayer.removeAttribute("src");
    mediaPlayer.load();

    mediaPlayer.src = currentPath;
    mediaPlayer.currentTime = currentTime;
    if (wasPlaying) {
      mediaPlayer.play().catch(console.error);
    }
  }
}

// Load saved playlist
const savedPlaylist = store.get("playlist", []);
if (savedPlaylist.length > 0) {
  playlist = savedPlaylist;
  updatePlaylistUI();
}

function updateSliderProgress() {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
  }

  animationFrame = requestAnimationFrame(() => {
    if (!mediaPlayer.duration) return;

    const progress = (mediaPlayer.currentTime / mediaPlayer.duration) * 100;
    // console.log(mediaPlayer.currentTime);
    timeSlider.style.setProperty("--progress-percent", progress);

    const thumb = timeSlider.querySelector("::-webkit-slider-thumb");
    if (thumb) {
      thumb.style.transform = `translateX(${progress}%)`;
    }
  });
}

function handleSliderInteraction(e) {
  const rect = timeSlider.getBoundingClientRect();
  const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const targetTime = pos * mediaPlayer.duration;

  if (!isNaN(targetTime)) {
    timeDisplay.textContent = `${formatTime(targetTime)} / ${formatTime(
      mediaPlayer.duration
    )}`;
    timeSlider.style.setProperty("--progress-percent", pos * 100);

    seekTargetTime = targetTime;

    if (!isSeekingSmooth) {
      isSeekingSmooth = true;
      smoothSeek();
    }
  }
}

function smoothSeek() {
  if (!isSeekingSmooth || seekTargetTime === null) {
    isSeekingSmooth = false;
    return;
  }

  const now = performance.now();
  if (now - lastSeekUpdate >= SEEK_UPDATE_INTERVAL) {
    const currentTime = mediaPlayer.currentTime;
    const timeDiff = seekTargetTime - currentTime;

    if (Math.abs(timeDiff) < 0.1) {
      mediaPlayer.currentTime = seekTargetTime;
      isSeekingSmooth = false;
      seekTargetTime = null;
      return;
    }
    const step = Math.sign(timeDiff) * Math.min(Math.abs(timeDiff), 1);
    mediaPlayer.currentTime = currentTime + step;
    lastSeekUpdate = now;
  }

  requestAnimationFrame(smoothSeek);
}

function updateTimeDisplay() {
  if (!isNaN(mediaPlayer.duration)) {
    timeSlider.max = mediaPlayer.duration;
    timeSlider.value = mediaPlayer.currentTime;
    timeDisplay.textContent = `${formatTime(
      mediaPlayer.currentTime
    )} / ${formatTime(mediaPlayer.duration)}`;
    updateSliderProgress();
  }
}

// Event Listeners
shuffleBtn.addEventListener("click", toggleShuffle);
loopBtn.addEventListener("click", toggleLoop);
timeSlider.addEventListener("input", () => {
  const time = parseFloat(timeSlider.value);
  if (!isNaN(time)) {
    mediaPlayer.currentTime = time;
    updateSliderProgress();
  }
});

loopBtn.style.opacity = isLooping ? "1" : "0.5";
shuffleBtn.style.opacity = isShuffling ? "1" : "0.5";

// Media player events
mediaPlayer.addEventListener("timeupdate", () => {
  if (!isDragging) {
    updateTimeDisplay();
  }
});
mediaPlayer.addEventListener("ended", handleMediaEnd);
mediaPlayer.addEventListener("loadedmetadata", () => {
  timeSlider.max = mediaPlayer.duration;
  updateTimeDisplay();

  if (mediaPlayer.fastSeek) {
    mediaPlayer.preload = "auto";
  }
});
timeSlider.addEventListener("mousedown", (e) => {
  isDragging = true;
  handleSliderInteraction(e);
  document.body.style.cursor = "grabbing";
});
document.addEventListener("mouseup", () => {
  if (isDragging) {
    isDragging = false;
    isSeekingSmooth = false;
    seekTargetTime = null;
    document.body.style.cursor = "";
  }
});
document.addEventListener("mousemove", (e) => {
  if (isDragging) {
    handleSliderInteraction(e);
  }
  // Update preview
  if (timeSlider.matches(":hover")) {
    const rect = timeSlider.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const previewTime = pos * mediaPlayer.duration;

    if (!isNaN(previewTime)) {
      timePreview.textContent = formatTime(previewTime);
      timePreview.style.left = `${e.clientX}px`;
      timePreview.classList.add("visible");
    }
  }

  showControls();
});

// Preview time on hover
timeSlider.addEventListener("mousemove", (e) => {
  const rect = timeSlider.getBoundingClientRect();
  const pos = (e.clientX - rect.left) / rect.width;
  const previewTime = pos * mediaPlayer.duration;

  if (!isNaN(previewTime)) {
    timePreview.textContent = formatTime(previewTime);
    timePreview.style.left = `${e.clientX}px`;
    timePreview.classList.add("visible");
  }
});

timeSlider.addEventListener("mouseleave", () => {
  timePreview.classList.remove("visible");
});

fullscreenBtn.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();

  if (!isFullscreenSupported()) {
    console.warn("Fullscreen is not supported in this environment");
    return;
  }

  toggleFullscreen();
});

mediaPlayer.addEventListener("dblclick", (e) => {
  e.preventDefault();
  e.stopPropagation();
  toggleFullscreen();
});

let currentMatchIndex = 0;
let foundTimes = [];

// const searchInput = document.getElementById("query");
const video = document.querySelector("video");

// Handle search
searchInput.addEventListener("change", async (e) => {
  const query = e.target.value.trim();
  if (!query) return;
  mediaPlayer.pause();
  // Update the outer foundTimes array
  foundTimes = await window.subtitlesManager.searchInActiveSubtitles(query);
  console.log("Search input in renderer.js");

  currentMatchIndex = 0;

  if (foundTimes.length === 0) {
    searchInput.value = "";
    searchInput.placeholder = "No results";
    console.log("No results found");
    // hide arrows if no results
    document.getElementById("arrow-left").style.display = "none";
    document.getElementById("arrow-right").style.display = "none";
  } else {
    console.log("Found times:", foundTimes);
    video.currentTime = foundTimes[0]; // Jump to the first match
    // show arrows if more than 1 result
    const showArrows = foundTimes.length > 1 ? "block" : "none";
    document.getElementById("arrow-left").style.display = showArrows;
    document.getElementById("arrow-right").style.display = showArrows;
  }
  updateSearchCounter();
});

// Next match
document.getElementById("arrow-right").addEventListener("click", () => {
  if (foundTimes.length > 0) {
    currentMatchIndex = (currentMatchIndex + 1) % foundTimes.length;
    video.currentTime = foundTimes[currentMatchIndex];
    updateSearchCounter();
  }
});

// Previous match
document.getElementById("arrow-left").addEventListener("click", () => {
  if (foundTimes.length > 0) {
    currentMatchIndex =
      (currentMatchIndex - 1 + foundTimes.length) % foundTimes.length;
    video.currentTime = foundTimes[currentMatchIndex];
    updateSearchCounter();
  }
});

function updateSearchCounter() {
  if (foundTimes.length > 0) {
    searchCounter.style.display = "inline";
    searchCounter.textContent = `${currentMatchIndex + 1}/${foundTimes.length}`;
  } else {
    searchCounter.style.display = "none";
  }
}

function generateShuffledPlaylist(currentVideoIndex) {
  // Create array of indices excluding the current video
  const indices = Array.from({ length: playlist.length }, (_, i) => i).filter(
    (i) => i !== currentVideoIndex
  );

  // Fisher-Yates shuffle algorithm for remaining videos
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  // Put current video at the start if it exists
  if (currentVideoIndex !== -1) {
    indices.unshift(currentVideoIndex);
  }

  return indices;
}

function toggleShuffle() {
  isShuffling = !isShuffling;
  shuffleBtn.style.opacity = isShuffling ? "1" : "0.5";

  if (isShuffling) {
    // Generate new shuffled sequence starting with current video
    shuffledIndices = generateShuffledPlaylist(currentIndex);
    currentShuffleIndex = 0;
  } else {
    // Clear shuffle state when turning off
    shuffledIndices = [];
    currentShuffleIndex = -1;
  }
}

function toggleLoop() {
  // Cycle through states: No Loop -> Loop Playlist -> Loop Current
  if (!isLooping && !isLoopingCurrent) {
    // Enable playlist loop
    isLoopingCurrent = false;
    isLooping = true;
    mediaPlayer.loop = false;
    loopBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"></path><path d="M3 11v-1a4 4 0 014-4h14"></path><path d="M7 22l-4-4 4-4"></path><path d="M21 13v1a4 4 0 01-4 4H3"></path></svg>`;
    loopBtn.style.opacity = "1";
  } else if (isLooping) {
    // Enable single media loop
    isLoopingCurrent = true;
    isLooping = false;
    mediaPlayer.loop = true;
    loopBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-repeat-1"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/><path d="M11 10h1v4"/></svg>`;
    loopBtn.style.opacity = "1";
  } else {
    // Disable all looping
    isLoopingCurrent = false;
    isLooping = false;
    mediaPlayer.loop = false;
    loopBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"></path><path d="M3 11v-1a4 4 0 014-4h14"></path><path d="M7 22l-4-4 4-4"></path><path d="M21 13v1a4 4 0 01-4 4H3"></path></svg>`;
    loopBtn.style.opacity = "0.5";
  }
}

function changePlaybackSpeed() {
  mediaPlayer.playbackRate = parseFloat(playbackSpeedSelect.value);
}

function updateVolumeIcon(volume) {
  if (volume === 0) {
    muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
  } else {
    muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;
  }
}

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.target.tagName === "INPUT") return;

  switch (e.code) {
    case "Space":
      e.preventDefault();
      togglePlayPause();
      break;
    case "ArrowLeft":
      if (e.ctrlKey) {
        playPrevious();
      } else {
        mediaPlayer.currentTime = Math.max(0, mediaPlayer.currentTime - 10);
      }
      break;
    case "ArrowRight":
      if (e.ctrlKey) {
        playNext();
      } else {
        mediaPlayer.currentTime = Math.min(
          mediaPlayer.duration,
          mediaPlayer.currentTime + 10
        );
      }
      break;
    case "ArrowUp":
      mediaPlayer.volume = Math.min(1, mediaPlayer.volume + 0.1);
      volumeSlider.value = mediaPlayer.volume * 100;
      volumeSlider.style.setProperty("--volume-percent", volumeSlider.value);
      lastVolume = mediaPlayer.volume;
      store.set("lastVolume", lastVolume);
      volumeChanged = true; // Set this to true
      if (mediaPlayer.volume === 0) {
        muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
      } else {
        muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;
      }
      break;
    case "ArrowDown":
      mediaPlayer.volume = Math.max(0, mediaPlayer.volume - 0.1);
      volumeSlider.value = mediaPlayer.volume * 100;
      volumeSlider.style.setProperty("--volume-percent", volumeSlider.value);
      lastVolume = mediaPlayer.volume;
      store.set("lastVolume", lastVolume);
      volumeChanged = true; // Set this to true
      if (mediaPlayer.volume === 0) {
        muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
      } else {
        muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;
      }
      break;
    case "KeyM":
      toggleMute();
      volumeChanged = true;
      break;
    case "KeyF":
      e.preventDefault();
      toggleFullscreen();
      break;
    case "KeyL":
      toggleLoop();
      break;
    case "KeyS":
      toggleShuffle();
      break;
    case "KeyT": // Toggle Playlist Panel
      e.preventDefault();
      playlistPanel.classList.toggle("hidden");
      togglePlaylistButton.classList.toggle("active");
      appContainer.classList.toggle("playlist-hidden");
      break;
    case "BracketLeft":
      if (window.subtitlesManager) {
        window.subtitlesManager.adjustSubtitleDelay(-0.1);
      }
      break;
    case "BracketRight":
      if (window.subtitlesManager) {
        window.subtitlesManager.adjustSubtitleDelay(0.1);
      }
      break;
    case "Backslash":
      if (window.subtitlesManager) {
        window.subtitlesManager.resetSubtitleDelay();
      }
      break;

    // Add number keys for seeking (0-9 -> 0% - 90%)
    case "Digit0":
    case "Numpad0":
      mediaPlayer.currentTime = 0;
      break;
    case "Digit1":
    case "Numpad1":
      mediaPlayer.currentTime = mediaPlayer.duration * 0.1;
      break;
    case "Digit2":
    case "Numpad2":
      mediaPlayer.currentTime = mediaPlayer.duration * 0.2;
      break;
    case "Digit3":
    case "Numpad3":
      mediaPlayer.currentTime = mediaPlayer.duration * 0.3;
      break;
    case "Digit4":
    case "Numpad4":
      mediaPlayer.currentTime = mediaPlayer.duration * 0.4;
      break;
    case "Digit5":
    case "Numpad5":
      mediaPlayer.currentTime = mediaPlayer.duration * 0.5;
      break;
    case "Digit6":
    case "Numpad6":
      mediaPlayer.currentTime = mediaPlayer.duration * 0.6;
      break;
    case "Digit7":
    case "Numpad7":
      mediaPlayer.currentTime = mediaPlayer.duration * 0.7;
      break;
    case "Digit8":
    case "Numpad8":
      mediaPlayer.currentTime = mediaPlayer.duration * 0.8;
      break;
    case "Digit9":
    case "Numpad9":
      mediaPlayer.currentTime = mediaPlayer.duration * 0.9;
      break;
  }

  if (volumeChanged) {
    volumeSlider.value = mediaPlayer.volume * 100;
    volumeSlider.style.setProperty("--volume-percent", volumeSlider.value);
    if (mediaPlayer.volume > 0) {
      // Store last non-zero volume
      lastVolume = mediaPlayer.volume;
      store.set("lastVolume", lastVolume);
    }
    updateVolumeIcon(mediaPlayer.volume);
  }

  // Update time display immediately after any seek action (Arrow keys, number keys)
  if (
    [
      "ArrowLeft",
      "ArrowRight",
      "Digit0",
      "Digit1",
      "Digit2",
      "Digit3",
      "Digit4",
      "Digit5",
      "Digit6",
      "Digit7",
      "Digit8",
      "Digit9",
      "Numpad0",
      "Numpad1",
      "Numpad2",
      "Numpad3",
      "Numpad4",
      "Numpad5",
      "Numpad6",
      "Numpad7",
      "Numpad8",
      "Numpad9",
    ].includes(e.code)
  ) {
    updateTimeDisplay();
  }
});

async function addToPlaylist(filePath) {
  // Get basic file info immediately
  const basicInfo = {
    path: filePath,
    metadata: {
      title: path.basename(filePath),
      duration: 0,
    },
  };

  const index = playlist.length;
  playlist.push(basicInfo);
  updatePlaylistUI();

  // Create temporary video element for quick metadata
  const temp = document.createElement("video");
  temp.preload = "metadata";

  try {
    const metadataLoaded = new Promise((resolve, reject) => {
      temp.onloadedmetadata = () => resolve(temp.duration);
      temp.onerror = reject;
      temp.src = filePath;
    });

    const duration = await metadataLoaded;
    playlist[index].metadata.duration = duration;
    updatePlaylistUI();
    temp.remove();

    // Load full metadata in background
    parseFile(filePath)
      .then((metadata) => {
        playlist[index].metadata.title =
          metadata.common.title || path.basename(filePath);
        playlist[index].metadata.artist =
          metadata.common.artist || "Unknown Artist";
        updatePlaylistUI();
      })
      .catch(() => {});
  } catch (error) {
    console.error("Error loading metadata:", error);
    temp.remove();
  }
}

function updatePlaylistUI() {
  playlistElement.innerHTML = "";

  // Add container for playlist items
  const playlistContainer = document.createElement("div");
  playlistContainer.className = "playlist-container";

  playlist.forEach((item, index) => {
    const element = document.createElement("div");
    element.className = `playlist-item ${
      index === currentIndex ? "active" : ""
    }`;
    element.draggable = true;
    element.dataset.index = index;
    element.innerHTML = `
            <div class="playlist-item-content">
                <span class="title">${item.metadata.title}</span>
                <div class="playlist-item-controls">
                    <span class="duration">${formatTime(
                      item.metadata.duration
                    )}</span>
                    <button class="remove-button">X</button>
                </div>
            </div>
        `;

    element.addEventListener("dragstart", handleDragStart);
    element.addEventListener("dragend", handleDragEnd);
    element
      .querySelector(".playlist-item-content")
      .addEventListener("click", (e) => {
        if (!e.target.classList.contains("remove-button")) {
          currentIndex = index;
          playFile(item.path);
        }
      });

    element.querySelector(".remove-button").addEventListener("click", (e) => {
      e.stopPropagation();
      removeFromPlaylist(index);
    });

    playlistContainer.appendChild(element);
  });

  // Add bottom drop zone
  const bottomDropZone = document.createElement("div");
  bottomDropZone.className = "bottom-drop-zone";
  bottomDropZone.style.height = "50px";
  playlistContainer.appendChild(bottomDropZone);

  playlistElement.appendChild(playlistContainer);

  // Container-level drag events
  playlistContainer.addEventListener("dragover", handleDragOver);
  playlistContainer.addEventListener("drop", handleDrop);
}

let draggedElement = null;

function handleDragStart(e) {
  draggedElement = e.target;
  draggedElement.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
}

function handleDragEnd(e) {
  draggedElement.classList.remove("dragging");
  draggedElement = null;

  // Remove all drag-over classes
  document.querySelectorAll(".drag-over").forEach((item) => {
    item.classList.remove("drag-over");
  });
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();

  if (!draggedElement) return;

  const container = e.currentTarget;
  const items = [
    ...container.querySelectorAll(".playlist-item:not(.dragging)"),
  ];

  // Get mouse position relative to container
  const mouseY = e.clientY;

  // Find the element we're hovering over
  let closestItem = null;
  let closestOffset = Number.NEGATIVE_INFINITY;

  items.forEach((item) => {
    const box = item.getBoundingClientRect();
    const offset = mouseY - box.top - box.height / 2;

    if (offset < 0 && offset > closestOffset) {
      closestOffset = offset;
      closestItem = item;
    }
  });

  // Remove existing drag-over classes
  items.forEach((item) => item.classList.remove("drag-over"));

  if (closestItem) {
    closestItem.classList.add("drag-over");
  } else if (mouseY > items[items.length - 1]?.getBoundingClientRect().bottom) {
    // If we're below the last item, highlight the bottom drop zone
    container.querySelector(".bottom-drop-zone").classList.add("drag-over");
  }
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();

  if (!draggedElement) return;

  const draggedIndex = parseInt(draggedElement.dataset.index);
  const container = e.currentTarget;
  const items = [
    ...container.querySelectorAll(".playlist-item:not(.dragging)"),
  ];
  const mouseY = e.clientY;

  // Find drop position
  let dropIndex;
  const lastItem = items[items.length - 1];

  if (lastItem && mouseY > lastItem.getBoundingClientRect().bottom) {
    // If dropping below last item, set to end of playlist
    dropIndex = playlist.length;
  } else {
    // Find position between items
    for (let i = 0; i < items.length; i++) {
      const box = items[i].getBoundingClientRect();
      if (mouseY < box.top + box.height / 2) {
        dropIndex = parseInt(items[i].dataset.index);
        break;
      }
    }
    // If no position found above items, use last position
    if (dropIndex === undefined) {
      dropIndex = playlist.length;
    }
  }

  // Update playlist array
  const [movedItem] = playlist.splice(draggedIndex, 1);
  playlist.splice(
    dropIndex > draggedIndex ? dropIndex - 1 : dropIndex,
    0,
    movedItem
  );

  // Update currentIndex
  if (currentIndex === draggedIndex) {
    currentIndex = dropIndex > draggedIndex ? dropIndex - 1 : dropIndex;
  } else if (draggedIndex < currentIndex && dropIndex > currentIndex) {
    currentIndex--;
  } else if (draggedIndex > currentIndex && dropIndex <= currentIndex) {
    currentIndex++;
  }

  updatePlaylistUI();
  store.set("playlist", playlist);
}

async function playFile(filePath) {
  if (!filePath) {
    console.warn("No file path provided to playFile");
    return;
  }

  const existingDialogs = document.querySelectorAll(".resume-dialog");
  existingDialogs.forEach((dialog) => dialog.remove());
  if (learningAbortController) cancelLearning();
  activeMediaPath = filePath;
  window.subtitlesReady = false;
  window.activeLectureSegments = [];
  learningContent.replaceChildren();
  currentFlashcards = [];
  currentStoryboard = [];
  currentStoryboardArtifactDirectory = null;
  learningStatus.textContent = "Load a transcript to create learning materials.";
  learningCacheStatus.textContent = "";
  ipcRenderer.invoke("set-active-media-path", filePath).catch((error) => console.warn("Unable to update active media path:", error));

  mediaPlayer.removeAttribute("src");
  mediaPlayer.load();

  if (hardwareAcceleration.isEnabled()) {
    hardwareAcceleration.addCodecSupport(filePath);
  }

  updatePlaylistUI();
  updateWindowTitle();

  const extension = path.extname(filePath).toLowerCase();

  if (mimeTypes[extension]) {
    const source = document.createElement("source");
    source.src = filePath;
    source.type = mimeTypes[extension];
    mediaPlayer.appendChild(source);
  } else {
    mediaPlayer.src = filePath;
  }

  mediaPlayer.src = filePath;

  // Detect and load subtitles for the new file
  subtitlesManager.detectSubtitles(filePath).catch((err) => {
    console.warn("Error loading subtitles:", err);
  });

  const shouldRememberPlayback = store.get("rememberPlayback", true);
  const lastPosition = shouldRememberPlayback
    ? getLastPosition(filePath)
    : null;

  if (lastPosition && lastPosition.position > MINIMUM_POSITION) {
    // Resume dialog
    const shouldResume = await showResumeDialog(
      filePath,
      lastPosition.position
    );

    if (shouldResume) {
      mediaPlayer.currentTime = lastPosition.position;
    } else {
      mediaPlayer.currentTime = 0;
      removeLastPosition(filePath);
    }
  } else {
    mediaPlayer.currentTime = 0;
  }

  const playPromise = new Promise((resolve, reject) => {
    const onPlaying = () => {
      if (hardwareAcceleration) {
        // Check if video is actually playing with hardware acceleration
        if (mediaPlayer.videoTracks && mediaPlayer.videoTracks.length > 0) {
          const videoTrack = mediaPlayer.videoTracks[0];
          if (!videoTrack.selected) {
            console.warn("Hardware decoding might not be active");
          }
        }
      }
      mediaPlayer.removeEventListener("playing", onPlaying);
      resolve();
    };

    const onError = (error) => {
      mediaPlayer.removeEventListener("playing", onPlaying);
      reject(error);
    };

    mediaPlayer.addEventListener("playing", onPlaying, { once: true });
    mediaPlayer.addEventListener("error", onError, { once: true });
  });

  try {
    await mediaPlayer.play();
    updatePlayPauseIcon(false);
  } catch (error) {
    console.error("Error playing file:", error);
    if (error.name === "NotSupportedError" || error.name === "AbortError") {
      console.warn("Playback error, attempting fallback...");
      // Try alternative playback method
      mediaPlayer.innerHTML = ""; // Clear any existing sources
      mediaPlayer.src = filePath;
      await mediaPlayer.play();
    } else {
      alert("Error playing file. The file may be invalid or unsupported.");
    }
  }
}

function updatePlayPauseIcon(isPaused) {
  playPauseBtn.innerHTML = isPaused
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
}

let savePositionInterval;
mediaPlayer.addEventListener("play", () => {
  // Save position every 5 seconds while playing
  savePositionInterval = setInterval(() => {
    if (currentIndex !== -1 && playlist[currentIndex]) {
      saveLastPosition(
        playlist[currentIndex].path,
        mediaPlayer.currentTime,
        mediaPlayer.duration
      );
    }
  }, 5000);
});

mediaPlayer.addEventListener("pause", () => {
  clearInterval(savePositionInterval);
  // Save position immediately when paused
  if (currentIndex !== -1 && playlist[currentIndex]) {
    saveLastPosition(
      playlist[currentIndex].path,
      mediaPlayer.currentTime,
      mediaPlayer.duration
    );
  }
});

// Save position before window closes
window.addEventListener("beforeunload", () => {
  if (currentIndex !== -1 && playlist[currentIndex]) {
    saveLastPosition(
      playlist[currentIndex].path,
      mediaPlayer.currentTime,
      mediaPlayer.duration
    );
  }
  store.set("playlist", playlist);
});

// Clear last position when media ends normally
mediaPlayer.addEventListener("ended", () => {
  if (currentIndex !== -1 && playlist[currentIndex]) {
    removeLastPosition(playlist[currentIndex].path);
  }
});

// Add event listener for media player pause event
mediaPlayer.addEventListener("pause", () => {
  updatePlayPauseIcon(true);
});

// Add event listener for media player play event
mediaPlayer.addEventListener("play", () => {
  updatePlayPauseIcon(false);
});

mediaPlayer.addEventListener("wheel", (e) => {
  e.preventDefault();

  const volumeChange = e.deltaY > 0 ? -0.05 : 0.05;
  const newVolume = Math.max(0, Math.min(1, mediaPlayer.volume + volumeChange));

  mediaPlayer.volume = newVolume;
  volumeSlider.value = newVolume * 100;
  volumeSlider.style.setProperty("--volume-percent", newVolume * 100);

  lastVolume = newVolume;
  // Save the new volume
  store.set("lastVolume", newVolume);

  // Update volume icon
  if (newVolume === 0) {
    muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
  } else {
    muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;
  }
});

document.addEventListener("mousemove", () => {
  if (isFullscreen) {
    showControls();
  }
});

// Prevent controls from hiding while interacting with them
const controlsOverlay = document.getElementById("controls-overlay");

function resetControlsTimer() {
  showControls();
  clearTimeout(controlsTimeout);
  controlsTimeout = setTimeout(hideControls, INACTIVITY_TIMEOUT);
}

// --- GLOBAL LISTENERS ---
// Keep controls alive when moving mouse, clicking, typing, scrolling
["mousemove", "mousedown", "keydown", "scroll"].forEach((evt) => {
  document.addEventListener(evt, resetControlsTimer);
});

// Hovering over controls keeps them alive
controlsOverlay.addEventListener("mouseenter", () => {
  clearTimeout(controlsTimeout);
  showControls();
});
controlsOverlay.addEventListener("mouseleave", () => {
  resetControlsTimer();
});

// --- SEARCH BAR SPECIAL CASE ---
// While typing → force controls visible
searchInput.addEventListener("focus", () => {
  clearTimeout(controlsTimeout);
  showControls();
});
// When leaving search bar → resume normal inactivity timeout
searchInput.addEventListener("blur", () => {
  resetControlsTimer();
});

// Init on load
resetControlsTimer();

document.addEventListener("fullscreenchange", handleFullscreenChange);
document.addEventListener("webkitfullscreenchange", handleFullscreenChange);

function removeFromPlaylist(index) {
  if (index === currentIndex) {
    if (playlist.length === 1) {
      clearPlaylist();
      return;
    }
    playNext();
    if (currentIndex > index) {
      currentIndex--;
    }
  } else if (index < currentIndex) {
    currentIndex--;
  }

  playlist.splice(index, 1);
  updatePlaylistUI();
  store.set("playlist", playlist);
}

function clearPlaylist() {
  // Stop any currently playing media
  mediaPlayer.pause();
  // Clear the source to prevent memory leaks
  mediaPlayer.removeAttribute("src");
  mediaPlayer.load();

  // Reset all player state
  playlist = [];
  currentIndex = -1;

  // Update UI elements
  updatePlaylistUI();
  updateWindowTitle();
  updatePlayPauseIcon(true);

  // Clear the time display and slider
  timeDisplay.textContent = "00:00 / 00:00";
  timeSlider.value = 0;

  // Save empty playlist to store
  store.set("playlist", playlist);
}

function handleMediaEnd() {
  // Remove last position when media ends normally
  if (currentIndex !== -1 && playlist[currentIndex]) {
    removeLastPosition(playlist[currentIndex].path);
  }

  if (isLoopingCurrent) {
    // Single media loop - just play the current file again
    mediaPlayer.play();
  } else if (isLooping) {
    // Playlist loop - continue with next file or return to start
    if (isShuffling) {
      playNext();
    } else {
      if (currentIndex < playlist.length - 1) {
        playNext();
      } else {
        // At end of playlist, return to start
        currentIndex = 0;
        playFile(playlist[currentIndex].path);
      }
    }
  } else if (playlist.length > 0) {
    // No loop - normal playlist behavior
    if (isShuffling) {
      playNext();
    } else {
      if (currentIndex < playlist.length - 1) {
        playNext();
      } else {
        // At the end of playlist and not looping - stop playback
        mediaPlayer.pause();
        updatePlayPauseIcon(true);
        mediaPlayer.currentTime = 0;
      }
    }
  } else {
    // If playlist is empty, reset the player
    mediaPlayer.pause();
    updatePlayPauseIcon(true);
  }
}

clearPlaylistBtn.addEventListener("click", () => {
  if (playlist.length > 0) {
    clearPlaylist();
  }
});

// IPC Events
ipcRenderer.on("change-theme", (_, themeName) => {
  applyTheme(themeName);
});
ipcRenderer.on("menu-open-files", openFiles);
ipcRenderer.on("menu-open-folder", openFolder);
ipcRenderer.on("menu-play-pause", togglePlayPause);
ipcRenderer.on("menu-previous", playPrevious);
ipcRenderer.on("menu-next", playNext);
ipcRenderer.on("menu-fullscreen", toggleFullscreen);

ipcRenderer.on("toggle-remember-playback", (_, enabled) => {
  store.set("rememberPlayback", enabled);
});
ipcRenderer.on("toggle-hardware-acceleration", (_, enabled) => {
  toggleHardwareAcceleration(enabled);
  store.set("hardwareAcceleration", enabled);
});
ipcRenderer.on("file-opened", async (_, filePath) => {
  // Clear playlist if it's empty or if it's a fresh start
  if (playlist.length === 0 || currentIndex === -1) {
    playlist = [];
    currentIndex = 0;
    await addToPlaylist(filePath);
    playFile(filePath);
  } else {
    // Add to existing playlist
    await addToPlaylist(filePath);
    // If nothing is playing, start playing the new file
    if (mediaPlayer.paused) {
      currentIndex = playlist.length - 1;
      playFile(filePath);
    }
  }
});

ipcRenderer.on("caption-start", () => {
  console.log("Caption generation started from renderer.js");
  loader.style.display = "flex";
  mediaPlayer.pause(); // pause if playing
});

// Listen for status
ipcRenderer.on("caption-status", (event, { status }) => {
  console.log("STATUS", status);
});

ipcRenderer.on("caption-path", (event, { scriptPath }) => {
  console.log("Caption script path:", scriptPath);
});

ipcRenderer.on("no-caption-path", (event, { scriptPath }) => {
  console.log("No caption script path found:", scriptPath);
});

// Listen for done event (hide loader)
ipcRenderer.on("caption-done", async (event, { filePath }) => {
  console.log("Caption generation done in renderer.js");
  // console.log("Received caption file in renderer.js:", filePath);
  loader.style.display = "none";
  mediaPlayer.play(); // play if paused
});

if (loader.style.display == "none") {
  console.log("Loader is hidden");
} else {
  console.log("Loader is visible");
}

ipcRenderer.on("search-result", (event, times) => {
  console.log("Got search results:", times);

  if (times.length === 0) {
    searchInput.placeholder = "No results found";
    leftArrow.style.display = "none";
    rightArrow.style.display = "none";
  } else {
    searchInput.placeholder = `Found ${times.length} matches`;
    if (times.length > 1) {
      leftArrow.style.display = "block";
      rightArrow.style.display = "block";
    } else {
      leftArrow.style.display = "none";
      rightArrow.style.display = "none";
    }
  }

  // store results in a global so you can navigate with arrows
  window.searchResults = times;
  window.currentIndex = 0;

  if (times.length > 0) {
    const video = document.getElementById("videoPlayer");
    video.currentTime = times[0]; // jump to first match
    video.play();
  }
});
// Initialize hardware acceleration state when player loads
document.addEventListener("DOMContentLoaded", async () => {
  // Check hardware support
  const hasHardwareSupport = hardwareAcceleration.checkSupport();

  // If no hardware support, force disable regardless of stored setting
  if (!hasHardwareSupport) {
    hardwareAcceleration.toggle(false);
  } else {
    // Initialize with current state
    hardwareAcceleration.toggle(hardwareAcceleration.isEnabled());
  }
});

aiButton.addEventListener("click", () => {
  aiPopup.classList.toggle("visible");
});

closeChat.addEventListener("click", () => {
  aiPopup.classList.remove("visible");
});

sendBtn.addEventListener("click", sendMessage);
aiInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

async function sendMessage() {
  const text = aiInput.value.trim();
  if (!text) return;

  // Check if subtitles are ready
  if (!window.subtitlesReady) {
    const warnMsg = document.createElement("div");
    warnMsg.className = "ai-message ai-bot";
    warnMsg.textContent =
      "⚠️ Please wait — subtitles are still being processed by AI.";
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

  // Display placeholder
  const botMsg = document.createElement("div");
  botMsg.className = "ai-message ai-bot";
  botMsg.textContent = "Thinking...";
  aiBody.appendChild(botMsg);

  aiBody.scrollTop = aiBody.scrollHeight;

  try {
    console.log("🧠 Sending question to AI backend:", text);
    const res = await fetch("http://127.0.0.1:3000/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: text, videoPath: activeMediaPath, model: selectedTextModel() }),
    });

    const data = await res.json();
    if (!res.ok) {
      botMsg.textContent = `⚠️ ${data.error || `AI request failed (${res.status}).`}`;
    } else {
      console.log("🤖 AI Answer:", data.answer);
      botMsg.textContent =
        data.answer && data.answer.trim()
          ? data.answer
          : "⚠️ The AI returned an empty answer. Check that this video has a loaded transcript.";
    }
  } catch (error) {
    console.error("🚨 AI request failed:", error);
    botMsg.textContent = `⚠️ Couldn’t reach the AI server: ${error.message}`;
  }

  aiBody.scrollTop = aiBody.scrollHeight;
}

document.getElementById("open-learning").addEventListener("click", () => {
  learningPopup.classList.toggle("visible");
  learningPopup.classList.remove("hidden");
  if (learningPopup.classList.contains("visible")) refreshLearningModelStatus();
});
document.getElementById("close-learning").addEventListener("click", () => learningPopup.classList.remove("visible"));
learningTabs.forEach((tab) => tab.addEventListener("click", () => {
  activeLearningTab = tab.dataset.learningTab;
  learningTabs.forEach((entry) => entry.classList.toggle("active", entry === tab));
  document.getElementById("generate-flashcards").classList.toggle("hidden", activeLearningTab !== "flashcards");
  document.getElementById("generate-storyboard").classList.toggle("hidden", activeLearningTab !== "storyboard");
  renderLearningContent();
}));
document.getElementById("generate-flashcards").addEventListener("click", generateFlashcards);
document.getElementById("generate-storyboard").addEventListener("click", generateStoryboard);
document.getElementById("cancel-learning").addEventListener("click", cancelLearning);

function currentLectureSegments() {
  return Array.isArray(window.activeLectureSegments) ? window.activeLectureSegments : [];
}

async function refreshLearningModelStatus() {
  try {
    const response = await fetch("http://127.0.0.1:3000/learning/config");
    const config = await response.json();
    if (!config.available) learningStatus.textContent = "Ollama is not running. Start Ollama to generate learning materials.";
    else {
      textModelInput.placeholder = `Installed: ${(config.installedModels || []).slice(0, 3).join(", ") || "none"}`;
      visionModelInput.placeholder = `Installed: ${(config.installedModels || []).filter((name) => /vision|vl|gemma3/i.test(name)).slice(0, 3).join(", ") || "none"}`;
    }
  } catch (_) { learningStatus.textContent = "EduPlay’s local AI service is unavailable. Restart the app and try again."; }
}

function learningRequestContext() {
  const segments = currentLectureSegments();
  if (!activeMediaPath || !segments.length) throw new Error("Select a media file with an active timestamped transcript first.");
  return { videoPath: activeMediaPath, segments };
}

function selectedTextModel() { return textModelInput.value.trim() || "phi3"; }
function selectedVisionModel() { return visionModelInput.value.trim() || "qwen2.5vl:3b"; }

async function generateFlashcards() {
  let requestPath = activeMediaPath;
  try {
    const context = learningRequestContext();
    requestPath = context.videoPath;
    setLearningBusy(true, "Generating flashcards from the lecture transcript…");
    const response = await fetch("http://127.0.0.1:3000/learning/flashcards", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...context, model: selectedTextModel() }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Flashcard generation failed.");
    if (activeMediaPath !== requestPath) return;
    currentFlashcards = data.flashcards || [];
    learningCacheStatus.textContent = data.cached ? "Saved result" : "Generated and saved";
    learningStatus.textContent = `${currentFlashcards.length} flashcards ready. Reveal an answer, then mark your recall.`;
    renderLearningContent();
  } catch (error) { if (activeMediaPath === requestPath) learningStatus.textContent = error.message; }
  finally { setLearningBusy(false); }
}

async function generateStoryboard() {
  let requestPath = activeMediaPath;
  try {
    const context = learningRequestContext();
    requestPath = context.videoPath;
    if (!Number.isFinite(mediaPlayer.duration) || mediaPlayer.videoWidth === 0) throw new Error("Open a video and wait for it to load before generating a storyboard.");
    learningAbortController = new AbortController();
    setLearningBusy(true, "Detecting meaningful scene changes…");
    const response = await fetch("http://127.0.0.1:3000/learning/storyboard", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...context, duration: mediaPlayer.duration, model: selectedVisionModel() }),
      signal: learningAbortController.signal,
    });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    let result = null;
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || "";
      for (const line of lines) consumeStoryboardEvent(line, (value) => { result = value; });
      if (done) break;
    }
    if (pending.trim()) consumeStoryboardEvent(pending, (value) => { result = value; });
    if (!response.ok) throw new Error(result?.error || "Storyboard generation failed.");
    if (!result) throw new Error("Storyboard service returned no result.");
    if (result.error) throw new Error(result.error);
    if (activeMediaPath !== requestPath) return;
    currentStoryboard = result.storyboard || [];
    currentStoryboardArtifactDirectory = result.artifactDirectory;
    learningCacheStatus.textContent = result.cached ? "Saved result" : "Generated and saved";
    learningStatus.textContent = `${currentStoryboard.length} storyboard moments ready.`;
    renderLearningContent();
  } catch (error) {
    if (activeMediaPath === requestPath) learningStatus.textContent = error.name === "AbortError" ? "Storyboard generation cancelled." : error.message;
  } finally { learningAbortController = null; setLearningBusy(false); }
}

let currentStoryboardArtifactDirectory = null;
function consumeStoryboardEvent(line, onResult) {
  try {
    const value = JSON.parse(line);
    if (value.type === "progress") {
      const stage = value.stage === "detecting-scenes" ? `Detecting scenes (${value.candidateCount} candidates)…` : value.stage === "extracting-frames" ? `Extracting frame ${value.completed}/${value.total}…` : value.stage === "analyzing-frames" ? `Understanding frame ${value.completed}/${value.total}…` : "Processing storyboard…";
      learningStatus.textContent = stage;
    } else onResult(value);
  } catch (_) { /* Ignore partial or malformed progress records. */ }
}

async function cancelLearning() {
  if (!learningAbortController) return;
  try { await fetch("http://127.0.0.1:3000/learning/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoPath: activeMediaPath }) }); }
  catch (_) { /* Request abort below still stops UI work. */ }
  learningAbortController.abort();
}

function setLearningBusy(busy, message) {
  document.getElementById("cancel-learning").classList.toggle("hidden", !learningAbortController);
  document.getElementById("generate-flashcards").disabled = busy;
  document.getElementById("generate-storyboard").disabled = busy;
  if (message) learningStatus.textContent = message;
}

function renderLearningContent() {
  learningContent.replaceChildren();
  if (activeLearningTab === "flashcards") {
    currentFlashcards.forEach((card) => {
      const article = document.createElement("article");
      article.className = "learning-card flashcard";
      const question = document.createElement("h3"); question.textContent = card.question;
      const reveal = document.createElement("button"); reveal.textContent = "Reveal answer";
      const answer = document.createElement("div"); answer.className = "flashcard-answer hidden";
      const text = document.createElement("p"); text.textContent = card.answer;
      const excerpt = document.createElement("blockquote"); excerpt.textContent = `Lecture source: “${card.source.excerpt}”`;
      const jump = document.createElement("button"); jump.textContent = `Jump to ${formatTime(card.source.timestamp)}`;
      const knew = document.createElement("button"); knew.textContent = "Knew it";
      const missed = document.createElement("button"); missed.textContent = "Missed it";
      const feedback = document.createElement("div"); feedback.className = "learning-feedback";
      feedback.append(knew, missed);
      answer.append(text, excerpt, jump, feedback);
      reveal.addEventListener("click", () => { answer.classList.toggle("hidden"); reveal.textContent = answer.classList.contains("hidden") ? "Reveal answer" : "Hide answer"; });
      jump.addEventListener("click", () => jumpToTimestamp(card.source.timestamp));
      knew.addEventListener("click", () => saveCardReview(card, "knew"));
      missed.addEventListener("click", () => saveCardReview(card, "missed"));
      article.append(question, reveal, answer);
      learningContent.append(article);
    });
    if (!currentFlashcards.length) learningContent.textContent = "Generate flashcards from this video’s transcript.";
    return;
  }
  currentStoryboard.forEach((frame) => {
    const article = document.createElement("article"); article.className = "learning-card storyboard-card";
    const image = document.createElement("img"); image.alt = frame.visualDescription;
    const framePath = path.resolve(currentStoryboardArtifactDirectory || "", frame.imagePath);
    image.src = require("url").pathToFileURL(framePath).href;
    const heading = document.createElement("h3"); heading.textContent = frame.topic;
    const description = document.createElement("p"); description.textContent = frame.visualDescription;
    const context = document.createElement("p"); context.textContent = frame.contextSummary;
    const jump = document.createElement("button"); jump.textContent = `Jump to ${formatTime(frame.timestamp)}`;
    jump.addEventListener("click", () => jumpToTimestamp(frame.timestamp));
    article.append(image, heading, description, context, jump);
    learningContent.append(article);
  });
  if (!currentStoryboard.length) learningContent.textContent = "Generate a scene-based storyboard with an installed local vision model.";
}

function jumpToTimestamp(timestamp) {
  mediaPlayer.currentTime = Math.max(0, Number(timestamp) || 0);
  mediaPlayer.play().catch(() => {});
}

async function saveCardReview(card, rating) {
  card.review = { rating, updatedAt: new Date().toISOString() };
  try {
    const response = await fetch("http://127.0.0.1:3000/learning/review", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoPath: activeMediaPath, cardId: card.id, rating }),
    });
    if (!response.ok) throw new Error("Review could not be saved.");
    learningStatus.textContent = rating === "knew" ? "Marked as known." : "Marked to review again.";
  } catch (error) { learningStatus.textContent = error.message; }
}

// Drag and drop support
document.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.stopPropagation();
});

document.addEventListener("drop", async (e) => {
  e.preventDefault();
  e.stopPropagation();

  const files = Array.from(e.dataTransfer.files).filter((file) => {
    const ext = path.extname(file.path).toLowerCase();
    return supportedFormats.includes(ext);
  });

  const promises = files.map((file) => addToPlaylist(file.path));

  if (currentIndex === -1 && files.length > 0) {
    currentIndex = 0;
    playFile(files[0].path);
  }

  // Save playlist after basic info is added
  store.set("playlist", playlist);

  // Wait for metadata in background
  await Promise.allSettled(promises);
  store.set("playlist", playlist); // Update with complete metadata
});

// Error handling
mediaPlayer.addEventListener("error", (e) => {
  // Only show error if there's actually a source attribute
  if (mediaPlayer.hasAttribute("src")) {
    console.error("Media Player Error:", e);
    alert(
      `Error playing media: ${mediaPlayer.error?.message || "Unknown error"}`
    );

    // Only try to play next if we have items in the playlist
    if (playlist.length > 0) {
      playNext();
    }
  }
});

mediaPlayer.addEventListener("error", (e) => {
  hardwareAcceleration.handleError(
    e.target.error,
    currentIndex !== -1 ? playlist[currentIndex].path : null,
    (path) => playFile(path)
  );
});

// Save playlist before window closes
window.addEventListener("beforeunload", () => {
  store.set("playlist", playlist);
});
