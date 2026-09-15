const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("coldbrew", {
  transaction: (action, payload) => ipcRenderer.invoke("coldbrew:transaction", action, payload),
  compose: (payload) => ipcRenderer.invoke("coldbrew:compose", payload),
  evaluate: (answer, options) => ipcRenderer.invoke("coldbrew:evaluate", answer, options),
  meta: () => ipcRenderer.invoke("coldbrew:meta"),
  activate: (payload) => ipcRenderer.invoke("coldbrew:activate", payload),
  inspect: () => ipcRenderer.invoke("coldbrew:inspect"),
  gemini: (verb, payload) => ipcRenderer.invoke("coldbrew:gemini", verb, payload),
  seat: (seatId, verb, payload) => ipcRenderer.invoke("coldbrew:seat", seatId, verb, payload),
  openDocs: () => ipcRenderer.invoke("coldbrew:open-docs"),
  openExternal: (url) => ipcRenderer.invoke("coldbrew:open-external", url),
  minimize: () => ipcRenderer.invoke("window:minimize"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  close: () => ipcRenderer.invoke("window:close"),
});
