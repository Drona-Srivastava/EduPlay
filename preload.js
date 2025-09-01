// preload.js
/* const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  openFiles: () => ipcRenderer.invoke("open-files"),
  generateCaptions: () => ipcRenderer.send("generate-captions"),

  onCaptionProgress: (callback) =>
    ipcRenderer.on("caption-progress", (event, data) => callback(data)),

  onCaptionDone: (callback) =>
    ipcRenderer.on("caption-done", (event, data) => callback(data)),

  onCaptionError: (callback) =>
    ipcRenderer.on("caption-error", (event, data) => callback(data)),
});
 */