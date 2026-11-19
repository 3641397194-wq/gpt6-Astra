const topics = {
  wormhole: {
    crumb: "WORMHOLES",
    eyebrow: "GENERAL RELATIVITY · THOUGHT EXPERIMENT 01",
    title: "A shortcut<br>through <em>the stars.</em>",
    description: "Imagine a tunnel connecting two faraway places. A wormhole is a mathematical idea for a shortcut through space—not something we've found.",
    meta: "Think of a tunnel linking two distant points on a cosmic map.",
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
      ["Imagine folding a map.", "If two faraway dots on a map could be connected by a tunnel, the tunnel might be a shorter route. This is only an analogy: real space is not a sheet you can fold."],
      ["The tunnel may collapse.", "Many models say a usable wormhole would need large amounts of unusual negative energy to stay open. We do not know how to make that happen."],
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
    scene: "EARTH → STAR → EARTH / ROUND TRIP",
    endpointA: "EARTH",
    endpointB: "PROXIMA CENTAURI",
    distanceLabel: "LIGHT TIME · ONE WAY",
    distance: "1.28",
    distanceUnit: "SEC",
    distanceFoot: "Earth to the Moon · average",
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
    title: "Gravity bends<br>space and <em>time.</em>",
    description: "Mass and energy change the shape of space and time. Planets and light follow those curves—this is Einstein's picture of gravity.",
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
      ["A stretched map.", "Picture a grid that dips near a heavy object. That picture helps show curved space, though actual spacetime has three dimensions of space plus time."],
      ["Gravity changes clocks.", "A clock closer to a massive object ticks a little more slowly than one farther away. GPS satellites account for this real, measured effect."],
    ],
    factValue: "6.67×10⁻¹¹",
    factUnit: "N·m²/kg²",
    factText: "Newton's gravitational constant. General relativity describes gravity geometrically.",
  },
};

const canvas = document.getElementById("universe");
const hasThree = typeof window.THREE === "object";
const context = hasThree ? null : canvas.getContext("2d");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const state = {
  mode: "wormhole",
  yaw: -0.68,
  pitch: 0.12,
  zoom: 1,
  dragging: false,
  paused: prefersReducedMotion.matches,
  pointer: { x: 0, y: 0 },
  lastPointer: { x: 0, y: 0 },
  destination: "moon",
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
let renderer3D;
let camera3D;
let scene3D;
let wormholeGroup;
let lightSpeedGroup;
let curvatureGroup;
let lightBeam;
let lightPhoton;
let lightCurve;
let curvatureSatellite;
let wormholePhoton;
let wormholeCurve;
let earthMesh;
let moonMesh;
let sunMesh;
let lastFrameTime = 0;
const hoverTarget3D = typeof window.THREE === "object" ? new THREE.Vector3() : null;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  if (renderer3D) {
    renderer3D.setPixelRatio(pixelRatio);
    renderer3D.setSize(rect.width, rect.height, false);
    camera3D.aspect = rect.width / Math.max(rect.height, 1);
    camera3D.updateProjectionMatrix();
    return;
  }
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

function addStarfield() {
  const positions = new Float32Array(1800 * 3);
  for (let i = 0; i < positions.length; i += 3) {
    const theta = Math.random() * Math.PI * 2;
    const z = Math.random() * 2 - 1;
    const radius = 24 + Math.random() * 48;
    const ring = Math.sqrt(1 - z * z);
    positions[i] = radius * ring * Math.cos(theta);
    positions[i + 1] = radius * z;
    positions[i + 2] = radius * ring * Math.sin(theta);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(geometry, new THREE.PointsMaterial({
    color: 0xc5d7f0,
    size: 0.075,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true,
  }));
  scene3D.add(stars);
}

function createWormhole() {
  wormholeGroup = new THREE.Group();
  scene3D.add(wormholeGroup);

  const ringCount = 72;
  const sideCount = 72;
  const positions = [];
  const colors = [];
  const indices = [];
  for (let ring = 0; ring <= ringCount; ring += 1) {
    const t = ring / ringCount;
    const z = (t - 0.5) * 6.4;
    const flare = Math.pow(Math.abs(t * 2 - 1), 1.55);
    const radius = 0.28 + flare * 1.36;
    const color = new THREE.Color(0x66e9e9).lerp(new THREE.Color(0x8e83ff), t);
    for (let side = 0; side <= sideCount; side += 1) {
      const angle = side / sideCount * Math.PI * 2;
      const ripple = Math.sin(angle * 3 + t * 9) * 0.025;
      const r = radius + ripple;
      positions.push(r * Math.cos(angle), r * Math.sin(angle), z);
      const glow = 0.5 + (1 - flare) * 0.5;
      colors.push(color.r * glow, color.g * glow, color.b * glow);
      if (ring < ringCount && side < sideCount) {
        const a = ring * (sideCount + 1) + side;
        const b = a + sideCount + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const throatGeometry = new THREE.BufferGeometry();
  throatGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  throatGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  throatGeometry.setIndex(indices);
  throatGeometry.computeVertexNormals();
  const throat = new THREE.Mesh(throatGeometry, new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.48,
    metalness: 0.32,
    roughness: 0.25,
    emissive: 0x182b67,
    emissiveIntensity: 0.8,
  }));
  wormholeGroup.add(throat);

  [-3.15, 3.15].forEach((z, index) => {
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(1.63, 0.055, 14, 120),
      new THREE.MeshStandardMaterial({
        color: index ? 0x83a2ff : 0x82f4ed,
        emissive: index ? 0x423caa : 0x157c83,
        emissiveIntensity: 1.1,
        metalness: 0.3,
        roughness: 0.2,
      }),
    );
    rim.position.z = z;
    wormholeGroup.add(rim);

    const innerRim = new THREE.Mesh(
      new THREE.TorusGeometry(1.43, 0.018, 8, 120),
      new THREE.MeshBasicMaterial({ color: index ? 0xa2b4ff : 0xc0ffff, transparent: true, opacity: 0.72 }),
    );
    innerRim.position.z = z;
    wormholeGroup.add(innerRim);
  });

  for (let index = 0; index < 9; index += 1) {
    const t = index / 8;
    const z = lerp(-2.8, 2.8, t);
    const radius = 0.28 + Math.pow(Math.abs(t * 2 - 1), 1.55) * 1.36;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.009, 5, 96),
      new THREE.MeshBasicMaterial({ color: index % 2 ? 0x8e83ff : 0x69e4e6, transparent: true, opacity: 0.36 }),
    );
    ring.position.z = z;
    wormholeGroup.add(ring);
  }

  const horizon = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 36, 24),
    new THREE.MeshBasicMaterial({ color: 0x03050d }),
  );
  wormholeGroup.add(horizon);

  const orbit = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.045, 10, 100),
    new THREE.MeshBasicMaterial({ color: 0xffc98d, transparent: true, opacity: 0.8 }),
  );
  orbit.rotation.x = 0.18;
  orbit.rotation.y = -0.27;
  wormholeGroup.add(orbit);

  wormholeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.2, 0.24, 3.22),
    new THREE.Vector3(0.36, 0.14, 1.55),
    new THREE.Vector3(-0.12, -0.06, 0),
    new THREE.Vector3(-0.38, 0.18, -1.65),
    new THREE.Vector3(0.16, -0.14, -3.22),
  ]);
  const lightPath = new THREE.Mesh(
    new THREE.TubeGeometry(wormholeCurve, 96, 0.018, 7, false),
    new THREE.MeshBasicMaterial({ color: 0xc3ffff, transparent: true, opacity: 0.76 }),
  );
  wormholeGroup.add(lightPath);
  wormholePhoton = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  wormholeGroup.add(wormholePhoton);
}

function makePlanet(radius, color, emissive = 0x000000) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 32),
    new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.82, metalness: 0.03 }),
  );
}

function createLightSpeedScene() {
  lightSpeedGroup = new THREE.Group();
  scene3D.add(lightSpeedGroup);

  sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.66, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0xffc66c }),
  );
  sunMesh.position.set(-3.55, 0.55, 0);
  lightSpeedGroup.add(sunMesh);
  const sunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.82, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0xff9f4b, transparent: true, opacity: 0.12, side: THREE.BackSide }),
  );
  sunMesh.add(sunGlow);

  earthMesh = makePlanet(0.42, 0x287cad, 0x071624);
  earthMesh.position.set(0, 0, 0);
  lightSpeedGroup.add(earthMesh);
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 40, 28),
    new THREE.MeshBasicMaterial({ color: 0x58b8ff, transparent: true, opacity: 0.16, side: THREE.BackSide }),
  );
  earthMesh.add(atmosphere);

  moonMesh = makePlanet(0.16, 0xc8d1d9);
  moonMesh.position.set(1.34, 0.15, 0);
  lightSpeedGroup.add(moonMesh);

  const mars = makePlanet(0.27, 0xb85f48, 0x35150f);
  mars.position.set(2.42, -0.18, -0.15);
  lightSpeedGroup.add(mars);

  const proxima = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0xffaa78 }),
  );
  proxima.position.set(3.62, 0.06, 0);
  lightSpeedGroup.add(proxima);
  const proximaGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 24, 18),
    new THREE.MeshBasicMaterial({ color: 0xff815f, transparent: true, opacity: 0.14, side: THREE.BackSide }),
  );
  proxima.add(proximaGlow);

  const lineMaterial = new THREE.LineDashedMaterial({ color: 0xa7bed5, dashSize: 0.09, gapSize: 0.08, transparent: true, opacity: 0.42 });
  const ruler = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-3.55, -1.25, 0), new THREE.Vector3(3.62, -1.25, 0)]),
    lineMaterial,
  );
  ruler.computeLineDistances();
  lightSpeedGroup.add(ruler);

  updateLightBeam();

  const textureLoader = new THREE.TextureLoader();
  textureLoader.setCrossOrigin("anonymous");
  textureLoader.load(
    "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg",
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      earthMesh.material.map = texture;
      earthMesh.material.color.set(0xffffff);
      earthMesh.material.needsUpdate = true;
    },
  );
  textureLoader.load(
    "https://threejs.org/examples/textures/planets/moon_1024.jpg",
    (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      moonMesh.material.map = texture;
      moonMesh.material.color.set(0xffffff);
      moonMesh.material.needsUpdate = true;
    },
  );
}

function updateLightBeam() {
  if (!lightSpeedGroup) return;
  if (lightBeam) {
    lightSpeedGroup.remove(lightBeam);
    lightBeam.geometry.dispose();
    lightBeam.material.dispose();
  }
  if (lightPhoton) {
    lightSpeedGroup.remove(lightPhoton);
    lightPhoton.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) object.material.dispose();
    });
  }
  const destinations = {
    moon: new THREE.Vector3(1.34, 0.15, 0),
    sun: new THREE.Vector3(-3.55, 0.55, 0),
    mars: new THREE.Vector3(2.42, -0.18, -0.15),
    proxima: new THREE.Vector3(3.62, 0.06, 0),
  };
  const end = destinations[state.destination] || destinations.moon;
  const start = new THREE.Vector3(0, 0, 0.04);
  const outboundControl = new THREE.Vector3(end.x * 0.38, 0.18, 0.12);
  const returnControl = new THREE.Vector3(end.x * 0.38, -0.18, -0.12);
  lightCurve = new THREE.CatmullRomCurve3([start, outboundControl, end, returnControl, start]);
  lightBeam = new THREE.Mesh(
    new THREE.TubeGeometry(lightCurve, 80, 0.015, 6, false),
    new THREE.MeshBasicMaterial({ color: 0xffedb0, transparent: true, opacity: 0.62 }),
  );
  lightSpeedGroup.add(lightBeam);
  lightPhoton = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.ConeGeometry(0.055, 0.19, 8),
    new THREE.MeshBasicMaterial({ color: 0xf3fbff }),
  );
  hull.rotation.z = -Math.PI / 2;
  lightPhoton.add(hull);
  const cockpit = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0x91f4ff }),
  );
  cockpit.position.set(0.015, 0.035, 0);
  lightPhoton.add(cockpit);
  const engineGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffb875 }),
  );
  engineGlow.position.x = -0.09;
  lightPhoton.add(engineGlow);
  lightSpeedGroup.add(lightPhoton);
}

function createCurvatureScene() {
  curvatureGroup = new THREE.Group();
  scene3D.add(curvatureGroup);
  const gridMaterial = new THREE.LineBasicMaterial({ color: 0x78cad8, transparent: true, opacity: 0.38 });
  const extent = 5.2;
  const steps = 48;
  const heightAt = (x, z) => -1.35 * Math.exp(-(x * x + z * z) / 4.2);
  for (let line = -5; line <= 5; line += 1) {
    const horizontal = [];
    const vertical = [];
    for (let step = 0; step <= steps; step += 1) {
      const value = -extent + (step / steps) * extent * 2;
      horizontal.push(new THREE.Vector3(value, heightAt(value, line * 0.72), line * 0.72));
      vertical.push(new THREE.Vector3(line * 0.72, heightAt(line * 0.72, value), value));
    }
    curvatureGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(horizontal), gridMaterial));
    curvatureGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(vertical), gridMaterial));
  }

  const well = makePlanet(0.56, 0x171a28, 0x493023);
  well.position.set(0, -0.9, 0);
  curvatureGroup.add(well);
  const wellGlow = new THREE.Mesh(
    new THREE.TorusGeometry(0.76, 0.018, 8, 96),
    new THREE.MeshBasicMaterial({ color: 0xffce8b, transparent: true, opacity: 0.72 }),
  );
  wellGlow.position.y = -0.53;
  wellGlow.rotation.x = Math.PI / 2;
  curvatureGroup.add(wellGlow);

  const orbit = new THREE.EllipseCurve(0, 0, 2.15, 1.45, 0, Math.PI * 2, false, 0);
  const orbitPoints = orbit.getPoints(128).map((point) => new THREE.Vector3(point.x, heightAt(point.x, point.y) + 0.1, point.y));
  curvatureGroup.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(orbitPoints),
    new THREE.LineBasicMaterial({ color: 0xd4c0ff, transparent: true, opacity: 0.55 }),
  ));
  curvatureSatellite = makePlanet(0.13, 0x9feef1, 0x174d55);
  curvatureGroup.add(curvatureSatellite);
}

function initializeThree() {
  scene3D = new THREE.Scene();
  renderer3D = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
  renderer3D.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer3D.setClearColor(0x000000, 0);
  renderer3D.outputColorSpace = THREE.SRGBColorSpace;
  camera3D = new THREE.PerspectiveCamera(42, 1, 0.1, 160);
  camera3D.position.set(0, 1.4, 9.2);
  scene3D.add(new THREE.AmbientLight(0x9db6e0, 1.5));
  const keyLight = new THREE.PointLight(0x75dff3, 24, 35);
  keyLight.position.set(-3, 4, 7);
  scene3D.add(keyLight);
  const rimLight = new THREE.PointLight(0x8f80ff, 18, 32);
  rimLight.position.set(4, -2, -6);
  scene3D.add(rimLight);
  addStarfield();
  createWormhole();
  createLightSpeedScene();
  createCurvatureScene();
  updateThreeMode();
}

function updateThreeMode() {
  if (!renderer3D) return;
  wormholeGroup.visible = state.mode === "wormhole";
  lightSpeedGroup.visible = state.mode === "lightspeed";
  curvatureGroup.visible = state.mode === "curvature";
}

function renderThree(time) {
  if (!renderer3D) return;
  const elapsed = Math.min((time - lastFrameTime) / 1000, 0.05) || 0;
  lastFrameTime = time;
  if (!state.paused) {
    wormholeGroup.rotation.z += elapsed * 0.055;
    wormholeGroup.rotation.x = Math.sin(time * 0.0002) * 0.045;
    if (earthMesh) earthMesh.rotation.y += elapsed * 0.18;
    if (moonMesh) moonMesh.rotation.y += elapsed * 0.07;
    if (sunMesh) sunMesh.rotation.y -= elapsed * 0.035;
    if (curvatureSatellite) {
      const orbitPhase = time * 0.00034;
      const x = Math.cos(orbitPhase) * 2.15;
      const z = Math.sin(orbitPhase) * 1.45;
      curvatureSatellite.position.set(x, -1.35 * Math.exp(-(x * x + z * z) / 4.2) + 0.1, z);
    }
  }

  const distance = 9.2 / state.zoom;
  const pitch = clamp(state.pitch, -1.15, 1.15);
  hoverTarget3D.set(state.pointer.x * 0.42, -state.pointer.y * 0.28, 0);
  scene3D.position.lerp(hoverTarget3D, 0.09);
  camera3D.position.set(
    Math.sin(state.yaw) * Math.cos(pitch) * distance,
    Math.sin(pitch) * distance,
    Math.cos(state.yaw) * Math.cos(pitch) * distance,
  );
  camera3D.lookAt(0, 0, 0);
  const progress = state.paused ? 0.5 : (time * 0.00011) % 1;
  if (wormholePhoton && wormholeCurve) wormholePhoton.position.copy(wormholeCurve.getPointAt(progress));
  if (lightPhoton && lightCurve) {
    const journeyProgress = state.paused ? 0.5 : (time % 10000) / 10000;
    lightPhoton.position.copy(lightCurve.getPointAt(journeyProgress));
    lightPhoton.quaternion.setFromUnitVectors(
      new THREE.Vector3(1, 0, 0),
      lightCurve.getTangentAt(journeyProgress).normalize(),
    );
  }
  renderer3D.render(scene3D, camera3D);
  requestAnimationFrame(renderThree);
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
  updateThreeMode();
  updateJourneyReadout();
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
  const rect = canvas.getBoundingClientRect();
  state.pointer = {
    x: (event.clientX - rect.left) / rect.width - 0.5,
    y: (event.clientY - rect.top) / rect.height - 0.5,
  };
  if (!state.dragging) return;
  const dx = event.clientX - state.lastPointer.x;
  const dy = event.clientY - state.lastPointer.y;
  state.yaw -= dx * 0.006;
  state.pitch = clamp(state.pitch - dy * 0.004, -1.05, 1.05);
  state.lastPointer = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener("pointerup", () => { state.dragging = false; });
canvas.addEventListener("pointercancel", () => { state.dragging = false; });
canvas.addEventListener("pointerleave", () => {
  if (!state.dragging) state.pointer = { x: 0, y: 0 };
});
canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  state.zoom = clamp(state.zoom - event.deltaY * 0.001, 0.66, 1.55);
}, { passive: false });
document.getElementById("resetView").addEventListener("click", () => {
  state.yaw = -0.68;
  state.pitch = 0.12;
  state.zoom = 1;
});

canvas.addEventListener("keydown", (event) => {
  const turn = event.shiftKey ? 0.18 : 0.09;
  if (event.key === "ArrowLeft") state.yaw -= turn;
  else if (event.key === "ArrowRight") state.yaw += turn;
  else if (event.key === "ArrowUp") state.pitch = clamp(state.pitch + turn, -1.15, 1.15);
  else if (event.key === "ArrowDown") state.pitch = clamp(state.pitch - turn, -1.15, 1.15);
  else if (event.key === "+" || event.key === "=") state.zoom = clamp(state.zoom + 0.08, 0.66, 1.55);
  else if (event.key === "-") state.zoom = clamp(state.zoom - 0.08, 0.66, 1.55);
  else if (event.key === "0") {
    state.yaw = -0.68;
    state.pitch = 0.12;
    state.zoom = 1;
  } else return;
  event.preventDefault();
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

const journeys = {
  moon: {
    name: "THE MOON",
    time: "1.28",
    unit: "SEC",
    description: "Moonlight takes about 1.28 seconds to reach Earth. The Moon is about 384,400 km away on average.",
  },
  sun: {
    name: "THE SUN",
    time: "8:20",
    unit: "MIN",
    description: "Sunlight takes about 8 minutes and 20 seconds to reach Earth. When you look at the Sun, you see it as it was a little over 8 minutes ago.",
  },
  mars: {
    name: "MARS",
    time: "3–22",
    unit: "MIN",
    description: "A radio message to Mars takes roughly 3 to 22 minutes one way, depending on where Earth and Mars are in their orbits.",
  },
  proxima: {
    name: "PROXIMA CENTAURI",
    time: "4.24",
    unit: "YEARS",
    description: "Proxima Centauri is our nearest neighboring star system, about 4.24 light-years away. Its light takes more than four years to get here.",
  },
};

const tripSpeed = document.getElementById("tripSpeed");
function updateRoundTrip() {
  const speedPercent = Number(tripSpeed.value);
  const speedFraction = speedPercent / 100;
  const gamma = 1 / Math.sqrt(1 - speedFraction * speedFraction);
  const earthYears = (2 * 4.24) / speedFraction;
  const travelerYears = earthYears / gamma;
  const difference = earthYears - travelerYears;
  const speedLabel = speedPercent % 1 === 0 ? speedPercent.toFixed(0) : speedPercent.toFixed(1);
  document.getElementById("tripSpeedOutput").textContent = `${speedLabel}% of light speed`;
  document.getElementById("earthElapsed").innerHTML = `${earthYears.toFixed(2)} <small>years pass</small>`;
  document.getElementById("travelerElapsed").innerHTML = `${travelerYears.toFixed(2)} <small>years pass</small>`;
  document.getElementById("reunionMessage").textContent = `When you reunite, the traveler is about ${difference.toFixed(2)} years younger than the person who stayed on Earth.`;
}
tripSpeed.addEventListener("input", updateRoundTrip);

document.getElementById("showTripButton").addEventListener("click", () => {
  setMode("lightspeed");
  document.querySelector('[data-destination="proxima"]').click();
  document.querySelector(".universe-card").scrollIntoView({ behavior: "smooth", block: "center" });
});

function updateJourneyReadout() {
  const journey = journeys[state.destination];
  if (!journey) return;
  document.getElementById("journeyDescription").textContent = journey.description;
  if (state.mode !== "lightspeed") return;
  document.getElementById("endpointA").textContent = "EARTH";
  document.getElementById("endpointB").textContent = journey.name;
  document.getElementById("distanceLabel").textContent = "LIGHT TIME · ONE WAY";
  document.getElementById("distanceValue").innerHTML = `${journey.time} <i>${journey.unit}</i>`;
  document.getElementById("distanceFoot").textContent = `Earth to ${journey.name.toLowerCase()} · ship returns`;
}

document.querySelectorAll(".journey-stop").forEach((button) => {
  button.addEventListener("click", () => {
    state.destination = button.dataset.destination;
    document.querySelectorAll(".journey-stop").forEach((stop) => {
      const active = stop === button;
      stop.classList.toggle("active", active);
      stop.setAttribute("aria-pressed", String(active));
    });
    updateJourneyReadout();
    updateLightBeam();
  });
});

document.querySelectorAll(".image-note").forEach((card) => {
  const resetTilt = () => {
    card.style.setProperty("--tilt-x", "0deg");
    card.style.setProperty("--tilt-y", "0deg");
  };
  card.addEventListener("pointermove", (event) => {
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    card.style.setProperty("--tilt-x", `${(0.5 - y) * 9}deg`);
    card.style.setProperty("--tilt-y", `${(x - 0.5) * 11}deg`);
  });
  card.addEventListener("pointerleave", resetTilt);
  card.addEventListener("blur", resetTilt);
});

window.addEventListener("resize", resizeCanvas);
document.getElementById("webglStatus").textContent = hasThree ? "LIVE 3D" : "2D FALLBACK";
if (hasThree) initializeThree();
resizeCanvas();
updateDistance();
updateRoundTrip();
updateMotionButton();
updateJourneyReadout();
requestAnimationFrame(hasThree ? renderThree : render);
