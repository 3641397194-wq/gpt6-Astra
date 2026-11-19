const topics = {
  wormhole: {
    crumb: "WORMHOLES",
    eyebrow: "GENERAL RELATIVITY · THOUGHT EXPERIMENT 01",
    title: "A shortcut<br>through <em>the stars.</em>",
    description: "What if two distant points in the universe were connected by a hidden bridge? Step inside the geometry of a wormhole.",
    meta: "A wormhole would connect separate regions of spacetime.",
    index: "01",
    scene: "WORMHOLE / SPACETIME BRIDGE",
    endpointA: "MOUTH A",
    endpointB: "MOUTH B",
    distanceLabel: "DISTANCE THROUGH SPACE",
    distance: "26.7",
    distanceUnit: "LY",
    distanceFoot: "ordinary route · hypothetical shortcut",
    heading: "Bend the map. Meet somewhere else.",
    cards: [
      ["Fold, don't cross.", "In the embedding diagram, a wormhole is a tunnel between distant points. The route through it could be shorter than the route through ordinary space."],
      ["A bridge needs support.", "Known equations suggest a traversable throat would need unusual negative energy to stay open. No material is known to do that at the needed scale."],
    ],
    factValue: "299,792",
    factUnit: "km/s",
    factText: "The speed of light in vacuum. A local speed limit for information and matter.",
  },
  lightspeed: {
    crumb: "SPEED OF LIGHT",
    eyebrow: "SPECIAL RELATIVITY · UNIVERSAL CONSTANT 02",
    title: "The universe<br>has a <em>speed limit.</em>",
    description: "Light races through a vacuum at a constant speed. For anything with mass, reaching that limit would take infinite energy.",
    meta: "Every observer measures light in a vacuum at the same speed.",
    index: "02",
    scene: "LIGHT SPEED / SPACETIME GRID",
    endpointA: "EMISSION",
    endpointB: "1 LIGHT-SECOND",
    distanceLabel: "DISTANCE LIGHT TRAVELS",
    distance: "299,792",
    distanceUnit: "KM/S",
    distanceFoot: "in one second · in a vacuum",
    heading: "One speed. Every observer.",
    cards: [
      ["The constant c.", "In a vacuum, light travels at exactly 299,792,458 meters per second. It is also the speed limit for information."],
      ["Mass takes energy.", "As an object with mass gets faster, the energy needed to accelerate it rises. Reaching light speed would require infinite energy."],
    ],
    factValue: "299,792",
    factUnit: "km/s",
    factText: "The speed of light in vacuum. The same for every inertial observer.",
  },
  curvature: {
    crumb: "SPACETIME",
    eyebrow: "GENERAL RELATIVITY · GEOMETRY OF GRAVITY 03",
    title: "Gravity is<br>the shape of <em>time.</em>",
    description: "Matter and energy curve spacetime. Planets, light, and even time itself follow paths through that changing geometry.",
    meta: "Earth orbits the Sun by following curved spacetime.",
    index: "03",
    scene: "SPACETIME / MASS & CURVATURE",
    endpointA: "MASS",
    endpointB: "CURVED PATH",
    distanceLabel: "SPACETIME CURVATURE",
    distance: "1.00",
    distanceUnit: "G",
    distanceFoot: "illustrative field strength · not to scale",
    heading: "Matter tells space how to curve.",
    cards: [
      ["A changing geometry.", "In general relativity, mass and energy curve spacetime. Objects in free fall follow the straightest paths available in that curved geometry."],
      ["Time flows differently.", "Clocks tick more slowly deeper in a gravitational field. This effect is measured and must be included in GPS satellite timing."],
    ],
    factValue: "6.67×10⁻¹¹",
    factUnit: "N·m²/kg²",
    factText: "Newton's gravitational constant. General relativity describes gravity geometrically.",
  },
};

const canvas = document.getElementById("universe");
const context = canvas.getContext("2d");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const state = {
  mode: "wormhole",
  yaw: -0.22,
  pitch: 0.12,
  zoom: 1,
  dragging: false,
  paused: prefersReducedMotion.matches,
  pointer: { x: 0, y: 0 },
  lastPointer: { x: 0, y: 0 },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * pixelRatio);
  canvas.height = Math.round(rect.height * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function project(x, y, z, width, height, time) {
  const drift = state.paused ? 0 : time;
  const yaw = state.yaw + Math.sin(drift * 0.00017) * 0.05;
  const pitch = state.pitch + Math.sin(drift * 0.00021) * 0.025;
  const rotatedX = x * Math.cos(yaw) - z * Math.sin(yaw);
  const turnedZ = x * Math.sin(yaw) + z * Math.cos(yaw);
  const rotatedY = y * Math.cos(pitch) - turnedZ * Math.sin(pitch);
  const rotatedZ = y * Math.sin(pitch) + turnedZ * Math.cos(pitch);
  const depth = 1 / (1 + rotatedZ * 0.0024);
  const scale = Math.min(width, height) * 0.72 * state.zoom * depth;
  return { x: width / 2 + rotatedX * scale, y: height / 2 + rotatedY * scale, z: rotatedZ, scale: depth };
}

function drawStars(width, height, time) {
  const drift = state.paused ? 0 : time * 0.000015;
  for (let i = 0; i < 145; i += 1) {
    const seed = i * 127.1;
    const x = ((Math.sin(seed) * 43758.5453) % 1 + 1) % 1;
    const y = ((Math.sin(seed + 78.23) * 12741.231) % 1 + 1) % 1;
    const twinkle = 0.3 + (Math.sin(time * 0.0015 + seed) + 1) * 0.24;
    const sx = (x * width + drift * (i % 3 + 1) * width) % width;
    const sy = y * height;
    context.globalAlpha = twinkle;
    context.fillStyle = i % 9 === 0 ? "#a5eeee" : "#c8d6ed";
    context.fillRect(sx, sy, i % 11 === 0 ? 1.6 : 1, i % 11 === 0 ? 1.6 : 1);
  }
  context.globalAlpha = 1;
}

function drawSpaceGrid(width, height, time) {
  const spacing = 26;
  const lines = 11;
  context.save();
  context.lineWidth = 0.6;
  for (let row = -lines; row <= lines; row += 1) {
    context.beginPath();
    for (let column = -lines; column <= lines; column += 0.3) {
      const x = column * spacing;
      const y = row * spacing;
      const curve = state.mode === "curvature" ? Math.exp(-(x * x + y * y) / 6000) * 90 : Math.exp(-(x * x + y * y) / 7200) * 35;
      const p = project(x, y + curve, 150, width, height, time);
      if (column <= -lines) context.moveTo(p.x, p.y);
      else context.lineTo(p.x, p.y);
    }
    context.strokeStyle = `rgba(105, 167, 191, ${row === 0 ? 0.18 : 0.09})`;
    context.stroke();
  }
  for (let column = -lines; column <= lines; column += 1) {
    context.beginPath();
    for (let row = -lines; row <= lines; row += 0.3) {
      const x = column * spacing;
      const y = row * spacing;
      const curve = state.mode === "curvature" ? Math.exp(-(x * x + y * y) / 6000) * 90 : Math.exp(-(x * x + y * y) / 7200) * 35;
      const p = project(x, y + curve, 150, width, height, time);
      if (row <= -lines) context.moveTo(p.x, p.y);
      else context.lineTo(p.x, p.y);
    }
    context.strokeStyle = `rgba(105, 167, 191, ${column === 0 ? 0.18 : 0.09})`;
    context.stroke();
  }
  context.restore();
}

function drawWormhole(width, height, time) {
  const t = state.paused ? 0 : time * 0.001;
  const centerX = width * 0.5;
  const centerY = height * 0.52;
  const ringCount = 23;
  const pointsPerRing = 100;
  const rings = [];
  for (let ring = 0; ring < ringCount; ring += 1) {
    const u = (ring / (ringCount - 1) - 0.5) * 2;
    const radius = 18 + Math.pow(Math.abs(u), 1.52) * 185;
    const z = u * 127;
    const ringPoints = [];
    for (let i = 0; i <= pointsPerRing; i += 1) {
      const angle = (i / pointsPerRing) * Math.PI * 2;
      const ripple = Math.sin(angle * 2 + t * 1.5 + ring * 0.12) * 1.8;
      ringPoints.push(project((radius + ripple) * Math.cos(angle), (radius + ripple) * Math.sin(angle) * 0.43, z, width, height, time));
    }
    rings.push({ u, radius, ringPoints });
  }

  context.save();
  for (let ringIndex = rings.length - 1; ringIndex >= 0; ringIndex -= 1) {
    const ring = rings[ringIndex];
    context.beginPath();
    ring.ringPoints.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    const intensity = 0.08 + Math.pow(1 - Math.abs(ring.u), 1.4) * 0.45;
    context.strokeStyle = ringIndex === Math.floor(ringCount / 2)
      ? `rgba(222, 255, 255, ${0.88 + Math.sin(t * 3) * 0.08})`
      : `rgba(${ringIndex % 2 ? "105, 191, 226" : "143, 133, 255"}, ${intensity})`;
    context.lineWidth = ringIndex === Math.floor(ringCount / 2) ? 2 : 1.05;
    context.shadowBlur = ringIndex === Math.floor(ringCount / 2) ? 19 : 6;
    context.shadowColor = ringIndex % 2 ? "#65dbea" : "#918cff";
    context.stroke();
  }

  const throatGradient = context.createRadialGradient(centerX, centerY, 2, centerX, centerY, 95);
  throatGradient.addColorStop(0, "rgba(224, 255, 255, .86)");
  throatGradient.addColorStop(0.08, "rgba(91, 220, 244, .6)");
  throatGradient.addColorStop(0.25, "rgba(72, 112, 208, .25)");
  throatGradient.addColorStop(1, "rgba(21, 24, 66, 0)");
  context.fillStyle = throatGradient;
  context.beginPath();
  context.ellipse(centerX, centerY, 98, 43, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();

  drawLightPath(width, height, time, false);
  drawAccretionDisk(width, height, time);
}

function drawLightPath(width, height, time, fast) {
  const progress = state.paused ? 0.52 : (time * (fast ? 0.00018 : 0.00011)) % 1;
  const centerY = height * 0.52;
  const centerX = width * 0.5;
  context.save();
  context.beginPath();
  context.moveTo(width * 0.09, centerY + 27);
  context.bezierCurveTo(width * 0.27, centerY + (fast ? -72 : 72), width * 0.38, centerY - 47, width * 0.5, centerY);
  context.bezierCurveTo(width * 0.63, centerY + 47, width * 0.73, centerY - (fast ? -72 : 72), width * 0.91, centerY - 22);
  context.strokeStyle = fast ? "rgba(255, 229, 156, .38)" : "rgba(136, 239, 239, .3)";
  context.lineWidth = 1.3;
  context.setLineDash(fast ? [3, 6] : []);
  context.stroke();
  context.setLineDash([]);
  const x = lerp(width * 0.1, width * 0.9, progress);
  const y = centerY + Math.sin(progress * Math.PI * 2) * (progress < 0.48 ? 25 : 17);
  const glow = context.createRadialGradient(x, y, 0, x, y, 17);
  glow.addColorStop(0, fast ? "rgba(255, 246, 198, .98)" : "rgba(239, 255, 255, .98)");
  glow.addColorStop(0.15, fast ? "rgba(255, 206, 115, .65)" : "rgba(132, 243, 244, .62)");
  glow.addColorStop(1, "rgba(112, 227, 255, 0)");
  context.fillStyle = glow;
  context.beginPath();
  context.arc(x, y, 17, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = fast ? "#fff3c2" : "#f4ffff";
  context.beginPath();
  context.arc(x, y, 2.1, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawAccretionDisk(width, height, time) {
  const centerX = width / 2;
  const centerY = height * 0.52;
  const rotation = state.paused ? -0.15 : Math.sin(time * 0.00017) * 0.035 - 0.15;
  context.save();
  context.translate(centerX, centerY);
  context.rotate(rotation);
  for (let i = 0; i < 58; i += 1) {
    const radius = 79 + i * 1.38;
    context.beginPath();
    context.ellipse(0, 0, radius, radius * 0.21, 0, Math.PI * 0.04, Math.PI * 0.96);
    const hue = 181 + i * 1.9;
    context.strokeStyle = `hsla(${hue}, 92%, ${70 - i * 0.34}%, ${0.22 + (i % 5) * 0.045})`;
    context.lineWidth = i % 7 === 0 ? 1.8 : 0.7;
    context.shadowColor = i < 16 ? "#7ce6ee" : "#7d71f5";
    context.shadowBlur = i % 7 === 0 ? 7 : 2;
    context.stroke();
  }
  context.restore();
}

function drawLightSpeed(width, height, time) {
  const centerX = width / 2;
  const centerY = height * 0.52;
  drawSpaceGrid(width, height, time);
  context.save();
  const horizon = context.createRadialGradient(centerX, centerY, 1, centerX, centerY, 148);
  horizon.addColorStop(0, "rgba(4, 8, 17, .99)");
  horizon.addColorStop(0.38, "rgba(4, 8, 17, .94)");
  horizon.addColorStop(0.46, "rgba(106, 225, 238, .62)");
  horizon.addColorStop(0.49, "rgba(255, 245, 196, .7)");
  horizon.addColorStop(0.53, "rgba(74, 128, 208, .18)");
  horizon.addColorStop(1, "rgba(74, 128, 208, 0)");
  context.fillStyle = horizon;
  context.beginPath();
  context.arc(centerX, centerY, 148, 0, Math.PI * 2);
  context.fill();
  context.restore();
  drawAccretionDisk(width, height, time);
  drawLightPath(width, height, time, true);
}

function drawCurvature(width, height, time) {
  const centerX = width / 2;
  const centerY = height * 0.51;
  drawSpaceGrid(width, height, time);
  const massGlow = context.createRadialGradient(centerX, centerY, 3, centerX, centerY, 145);
  massGlow.addColorStop(0, "rgba(245, 238, 210, .94)");
  massGlow.addColorStop(0.06, "rgba(241, 195, 115, .72)");
  massGlow.addColorStop(0.18, "rgba(184, 116, 95, .25)");
  massGlow.addColorStop(1, "rgba(150, 112, 240, 0)");
  context.fillStyle = massGlow;
  context.beginPath();
  context.arc(centerX, centerY, 145, 0, Math.PI * 2);
  context.fill();
  context.save();
  context.beginPath();
  context.ellipse(centerX, centerY, 36, 16, -0.16, 0, Math.PI * 2);
  context.fillStyle = "#050811";
  context.shadowBlur = 21;
  context.shadowColor = "#b98bf4";
  context.fill();
  context.restore();
  drawLightPath(width, height, time, false);
}

function render(time) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  context.clearRect(0, 0, width, height);
  drawStars(width, height, time);
  if (state.mode === "wormhole") drawWormhole(width, height, time);
  else if (state.mode === "lightspeed") drawLightSpeed(width, height, time);
  else drawCurvature(width, height, time);
  requestAnimationFrame(render);
}

function setMode(mode) {
  const content = topics[mode];
  if (!content) return;
  state.mode = mode;
  document.querySelectorAll(".topic-link").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll(".mode-button").forEach((button) => {
    const active = button.dataset.view === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.getElementById("crumbTopic").textContent = content.crumb;
  document.getElementById("eyebrowText").textContent = content.eyebrow;
  document.getElementById("pageTitle").innerHTML = content.title;
  document.getElementById("pageDescription").textContent = content.description;
  document.getElementById("metaText").textContent = content.meta;
  document.getElementById("indexNumber").textContent = content.index;
  document.getElementById("sceneName").textContent = content.scene;
  document.getElementById("endpointA").textContent = content.endpointA;
  document.getElementById("endpointB").textContent = content.endpointB;
  document.getElementById("distanceLabel").textContent = content.distanceLabel;
  document.getElementById("distanceValue").innerHTML = `${content.distance} <i>${content.distanceUnit}</i>`;
  document.getElementById("distanceFoot").textContent = content.distanceFoot;
  document.getElementById("conceptHeading").textContent = content.heading;
  document.getElementById("cardOneTitle").textContent = content.cards[0][0];
  document.getElementById("cardOneText").textContent = content.cards[0][1];
  document.getElementById("cardTwoTitle").textContent = content.cards[1][0];
  document.getElementById("cardTwoText").textContent = content.cards[1][1];
  document.getElementById("factValue").textContent = content.factValue;
  document.getElementById("factUnit").textContent = content.factUnit;
  document.getElementById("factText").textContent = content.factText;
  document.getElementById("spacePhoto").src = mode === "curvature"
    ? "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1800&q=85"
    : mode === "lightspeed"
      ? "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1800&q=85"
      : "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=1800&q=85";
}

document.querySelectorAll("[data-mode], [data-view]").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode || button.dataset.view));
});

canvas.addEventListener("pointerdown", (event) => {
  state.dragging = true;
  state.lastPointer = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointermove", (event) => {
  state.pointer = { x: event.clientX, y: event.clientY };
  if (!state.dragging) return;
  const dx = event.clientX - state.lastPointer.x;
  const dy = event.clientY - state.lastPointer.y;
  state.yaw += dx * 0.006;
  state.pitch = clamp(state.pitch + dy * 0.004, -1.05, 1.05);
  state.lastPointer = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener("pointerup", () => { state.dragging = false; });
canvas.addEventListener("pointercancel", () => { state.dragging = false; });
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  state.zoom = clamp(state.zoom - event.deltaY * 0.001, 0.66, 1.55);
}, { passive: false });
document.getElementById("resetView").addEventListener("click", () => {
  state.yaw = -0.22;
  state.pitch = 0.12;
  state.zoom = 1;
});

const motionButton = document.getElementById("motionToggle");
function updateMotionButton() {
  motionButton.setAttribute("aria-pressed", String(state.paused));
  motionButton.querySelector(".motion-icon").textContent = state.paused ? "▶" : "Ⅱ";
  motionButton.lastElementChild.textContent = state.paused ? "RESUME MOTION" : "PAUSE MOTION";
}
motionButton.addEventListener("click", () => { state.paused = !state.paused; updateMotionButton(); });
prefersReducedMotion.addEventListener?.("change", (event) => {
  if (event.matches) state.paused = true;
  updateMotionButton();
});

const timeSlider = document.getElementById("timeSlider");
function updateDistance() {
  const seconds = Number(timeSlider.value);
  const kilometers = 299792.458 * seconds;
  const formatted = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(kilometers));
  document.getElementById("timeOutput").textContent = seconds === 1 ? "1 second" : `${seconds} seconds`;
  document.getElementById("timeLabel").textContent = seconds === 1 ? "one second?" : `${seconds} seconds?`;
  document.getElementById("lightDistance").innerHTML = `${formatted} <small>km</small>`;
  const earthLaps = kilometers / 40075;
  document.getElementById("distanceComparison").textContent = `≈ ${earthLaps < 10 ? earthLaps.toFixed(1) : Math.round(earthLaps)} laps around Earth`;
}
timeSlider.addEventListener("input", updateDistance);

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
updateDistance();
updateMotionButton();
requestAnimationFrame(render);
