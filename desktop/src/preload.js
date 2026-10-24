const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("coldbrew", {
  platform: process.platform,
  transaction: (action, payload) => ipcRenderer.invoke("coldbrew:transaction", action, payload),
  localSkills: (action, payload) => ipcRenderer.invoke("coldbrew:local-skills", action, payload),
  beginner: (action, payload) => ipcRenderer.invoke("coldbrew:beginner", action, payload),
  upstream: Object.freeze({
    catalog: () => ipcRenderer.invoke("coldbrew:beginner", "catalog"),
    status: (seat) => ipcRenderer.invoke("coldbrew:beginner", "upstream-status", { seat }),
    prepare: (seat, confirm) => ipcRenderer.invoke("coldbrew:beginner", "upstream-prepare", { seat, confirm: confirm === true }),
  }),
  relay: (action, payload) => ipcRenderer.invoke("coldbrew:relay", action, payload),
  compose: (payload) => ipcRenderer.invoke("coldbrew:compose", payload),
  evaluate: (answer, options) => ipcRenderer.invoke("coldbrew:evaluate", answer, options),
  meta: () => ipcRenderer.invoke("coldbrew:meta"),
  activate: (payload) => ipcRenderer.invoke("coldbrew:activate", payload),
  inspect: () => ipcRenderer.invoke("coldbrew:inspect"),
  gemini: (verb, payload) => ipcRenderer.invoke("coldbrew:gemini", verb, payload),
  seat: (seatId, verb, payload) => ipcRenderer.invoke("coldbrew:seat", seatId, verb, payload),
  toolbox: (payload) => ipcRenderer.invoke("coldbrew:toolbox", payload),
  originalToolbox: (action, payload) => ipcRenderer.invoke("coldbrew:original-toolbox", action, payload),
  onOriginalToolbox: (fn) => {
    const listener = (_event, entry) => fn(entry);
    ipcRenderer.on("coldbrew:original-toolbox-event", listener);
    return () => ipcRenderer.removeListener("coldbrew:original-toolbox-event", listener);
  },
  toolsHealth: (payload) => ipcRenderer.invoke("coldbrew:tools-health", payload),
  workflowTemplates: () => ipcRenderer.invoke("coldbrew:workflow-templates"),
  workflows: () => ipcRenderer.invoke("coldbrew:workflows"),
  workflowPlan: (payload) => ipcRenderer.invoke("coldbrew:workflow-plan", payload),
  workflowStart: (payload) => ipcRenderer.invoke("coldbrew:workflow-start", payload),
  startWorkflow: (payload) => ipcRenderer.invoke("coldbrew:workflow-start", payload),
  workflowStatus: (taskId) => ipcRenderer.invoke("coldbrew:workflow-status", taskId),
  getWorkflow: (taskId) => ipcRenderer.invoke("coldbrew:workflow-status", taskId),
  workflowList: () => ipcRenderer.invoke("coldbrew:workflow-list"),
  workflowPause: (taskId) => ipcRenderer.invoke("coldbrew:workflow-pause", taskId),
  workflowResume: (taskId, input) => ipcRenderer.invoke("coldbrew:workflow-resume", { id: taskId, input }),
  workflowCancel: (taskId) => ipcRenderer.invoke("coldbrew:workflow-cancel", taskId),
  cancelWorkflow: (taskId) => ipcRenderer.invoke("coldbrew:workflow-cancel", taskId),
  workflowClear: (taskId) => ipcRenderer.invoke("coldbrew:workflow-clear", taskId),
  idaStatus: (payload) => ipcRenderer.invoke("coldbrew:ida-status", payload),
  idaCall: (payload) => ipcRenderer.invoke("coldbrew:ida-call", payload),
  onWorkflow: (fn) => {
    const listener = (_event, entry) => fn(entry);
    ipcRenderer.on("coldbrew:workflow-event", listener);
    return () => ipcRenderer.removeListener("coldbrew:workflow-event", listener);
  },
  onWorkflowEvent: (fn) => {
    const listener = (_event, entry) => fn(entry);
    ipcRenderer.on("coldbrew:workflow-event", listener);
    return () => ipcRenderer.removeListener("coldbrew:workflow-event", listener);
  },
  openDocs: () => ipcRenderer.invoke("coldbrew:open-docs"),
  openExternal: (url) => ipcRenderer.invoke("coldbrew:open-external", url),
  minimize: () => ipcRenderer.invoke("window:minimize"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  close: () => ipcRenderer.invoke("window:close"),
});
