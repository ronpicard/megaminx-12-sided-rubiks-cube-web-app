import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";

/* ═══════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════ */
const COLORS = [
  "#FFFFFF", "#CC1111", "#007744", "#F5D000", "#0055BB", "#EE6600",
  "#888888", "#DD44AA", "#77CC22", "#DDBB77", "#7711AA", "#33AACC",
];
const NAMES = [
  "White", "Red", "Green", "Yellow", "Blue", "Orange",
  "Gray", "Pink", "Lime", "Cream", "Purple", "Cyan",
];
const TUT_PHASES = [
  { name: "Build the Star", desc: "Place edge pieces around the first face center" },
  { name: "Insert Corners", desc: "Fill in the 5 corners of the first face" },
  { name: "Second Layer (F2L)", desc: "Pair edges with corners and insert" },
  { name: "Continue Down", desc: "Repeat F2L for each ring of faces" },
  { name: "Edges — Orient", desc: "Flip edges so top color matches center" },
  { name: "Edges — Permute", desc: "Cycle edges into correct positions" },
  { name: "Last Corners", desc: "Orient and permute the final corners" },
];
const GUIDE_STEPS = [
  { t: "First Face — Build the Star", d: "Choose your starting face (white is traditional). Hunt for edge pieces that contain the starting face's color. Rotate adjacent faces to bring each edge near its target slot, turn the top face to open the slot, then rotate back. Build a 5-pointed star of edges radiating from the center." },
  { t: "First Face — Insert Corners", d: "Fill the 5 gaps between the star's edges with corner pieces. Each corner has 3 colors — match all 3. Position the corner below its target slot, then use the 3-move trigger: lift the side face, slide the bottom, drop the side face back down." },
  { t: "Second Layer (F2L Pairs)", d: "First Two Layers is the heart of the solve. Pair an edge piece with its matching corner, then insert them together. Find an unsolved edge, align it above its target slot, and use a trigger to pair and insert both at once." },
  { t: "Continue Down Each Band", d: "Repeat F2L for each ring working downward. Keep solved portions on top. If a piece is in the right spot but flipped wrong, take it out first, then re-insert correctly." },
  { t: "Last Face — Edge Orientation", d: "Flip last-face edges so they show the correct color on top (forming a star). Rotate adjacent face, turn last face, rotate back, turn back. Repeat until all 5 edges are correct." },
  { t: "Last Face — Edge Permutation", d: "Edges have correct color on top but wrong positions. A 3-edge cycle swaps three at once. Find one correct edge, hold it at back, apply the sequence 1–3 times." },
  { t: "Last Face — Corners", d: "Orient each corner with R' D' R D until correct. The puzzle looks scrambled mid-step — that's normal! Then use a 3-corner cycle to swap any remaining misplaced corners." },
];
const DEMOS = [
  { setup: [{ f: 1, c: true }, { f: 2, c: false }, { f: 0, c: true }], solve: [{ f: 0, c: false }, { f: 2, c: true }, { f: 1, c: false }], title: "Building the Star", desc: "An edge piece gets moved into the first face. Rotate adjacent, open slot, lock in.", tip: "Look for edge pieces with the first face's color anywhere on the puzzle." },
  { setup: [{ f: 2, c: true }, { f: 9, c: false }, { f: 2, c: false }], solve: [{ f: 2, c: true }, { f: 9, c: true }, { f: 2, c: false }], title: "Corner Insertion", desc: "Position the corner below its slot, then use a 3-move trigger to insert.", tip: "Each corner has 3 colors. Match all 3, not just the top." },
  { setup: [{ f: 1, c: true }, { f: 3, c: false }, { f: 1, c: false }, { f: 0, c: true }], solve: [{ f: 0, c: false }, { f: 1, c: true }, { f: 3, c: true }, { f: 1, c: false }], title: "F2L Pairing", desc: "Pair an edge with its corner, then insert both together as a unit.", tip: "Once you learn the 3–4 triggers, you'll use them over and over." },
  { setup: [{ f: 4, c: true }, { f: 3, c: false }, { f: 7, c: true }, { f: 4, c: false }], solve: [{ f: 4, c: true }, { f: 7, c: false }, { f: 3, c: true }, { f: 4, c: false }], title: "Layer by Layer", desc: "Same F2L approach, working down ring by ring.", tip: "If a piece is right but flipped, take it out and re-insert correctly." },
  { setup: [{ f: 6, c: true }, { f: 8, c: false }, { f: 6, c: false }, { f: 8, c: true }], solve: [{ f: 8, c: false }, { f: 6, c: true }, { f: 8, c: true }, { f: 6, c: false }], title: "Edge Orientation", desc: "Flip edges in place so their color matches the last face center.", tip: "You may need to repeat 2–3 times, rotating the face between applications." },
  { setup: [{ f: 6, c: true }, { f: 7, c: true }, { f: 6, c: false }, { f: 7, c: false }], solve: [{ f: 7, c: true }, { f: 6, c: true }, { f: 7, c: false }, { f: 6, c: false }], title: "Edge 3-Cycle", desc: "Swap three edges at once while leaving 2 untouched.", tip: "If only 2 edges are swapped, you need 2 applications of the 3-cycle." },
  { setup: [{ f: 7, c: false }, { f: 6, c: false }, { f: 7, c: true }, { f: 6, c: true }], solve: [{ f: 6, c: false }, { f: 7, c: false }, { f: 6, c: true }, { f: 7, c: true }], title: "Corner Orient + Permute", desc: "R' D' R D repeatedly. Puzzle looks broken mid-step — it restores!", tip: "Trust the process — it always comes back together." },
];

/* ═══════════════════════════════════════════
   PUZZLE LOGIC
   ═══════════════════════════════════════════ */
function createSolved() { return Array.from({ length: 12 }, (_, i) => Array(11).fill(COLORS[i])); }
function cloneF(f) { return f.map(r => [...r]); }

function getAdj(fi) {
  const m = {
    0: [[2, [1, 10, 9]], [11, [9, 8, 7]], [9, [3, 2, 1]], [10, [1, 10, 9]], [1, [3, 2, 1]]],
    1: [[0, [1, 10, 9]], [10, [9, 8, 7]], [3, [3, 2, 1]], [4, [1, 10, 9]], [2, [3, 2, 1]]],
    2: [[1, [1, 10, 9]], [4, [9, 8, 7]], [5, [3, 2, 1]], [11, [1, 10, 9]], [0, [3, 2, 1]]],
    3: [[1, [7, 6, 5]], [10, [7, 6, 5]], [8, [5, 4, 3]], [7, [9, 8, 7]], [4, [3, 2, 1]]],
    4: [[3, [1, 10, 9]], [7, [7, 6, 5]], [5, [5, 4, 3]], [2, [5, 4, 3]], [1, [9, 8, 7]]],
    5: [[2, [7, 6, 5]], [4, [7, 6, 5]], [7, [5, 4, 3]], [6, [9, 8, 7]], [11, [3, 2, 1]]],
    6: [[8, [1, 10, 9]], [9, [7, 6, 5]], [11, [5, 4, 3]], [5, [9, 8, 7]], [7, [3, 2, 1]]],
    7: [[6, [1, 10, 9]], [5, [7, 6, 5]], [4, [5, 4, 3]], [3, [9, 8, 7]], [8, [3, 2, 1]]],
    8: [[7, [1, 10, 9]], [3, [7, 6, 5]], [10, [5, 4, 3]], [9, [9, 8, 7]], [6, [3, 2, 1]]],
    9: [[0, [7, 6, 5]], [11, [7, 6, 5]], [6, [5, 4, 3]], [8, [9, 8, 7]], [10, [3, 2, 1]]],
    10: [[9, [1, 10, 9]], [8, [7, 6, 5]], [3, [5, 4, 3]], [1, [5, 4, 3]], [0, [9, 8, 7]]],
    11: [[5, [1, 10, 9]], [6, [7, 6, 5]], [9, [5, 4, 3]], [0, [5, 4, 3]], [2, [9, 8, 7]]],
  };
  return m[fi] || [];
}

function rotFace(faces, fi, cw) {
  const f = faces[fi], nf = [...f];
  if (cw) { for (let i = 0; i < 10; i++) nf[1 + ((i + 8) % 10)] = f[1 + i]; }
  else { for (let i = 0; i < 10; i++) nf[1 + ((i + 2) % 10)] = f[1 + i]; }
  faces[fi] = nf;
  const adj = getAdj(fi);
  if (adj.length === 5) {
    const saved = adj.map(([a, t]) => t.map(x => faces[a][x]));
    for (let i = 0; i < 5; i++) {
      const ni = cw ? (i + 4) % 5 : (i + 1) % 5;
      const [a2, t2] = adj[ni];
      for (let j = 0; j < t2.length; j++) faces[a2][t2[j]] = saved[i][j];
    }
  }
}

function doShuffle() {
  const f = createSolved(), hist = [];
  for (let i = 0; i < 30; i++) {
    const fi = Math.floor(Math.random() * 12), cw = Math.random() > 0.5;
    rotFace(f, fi, cw);
    hist.push({ face: fi, cw });
  }
  return { faces: f, history: hist };
}

function checkSolved(f) { return f.every(face => face.every(t => t === face[0])); }

/* ═══════════════════════════════════════════
   THREE.JS GEOMETRY
   ═══════════════════════════════════════════ */
const PHI = (1 + Math.sqrt(5)) / 2;
const INV_PHI = 1 / PHI;
const DOD_RAW = [
  [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
  [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
  [0, INV_PHI, PHI], [0, INV_PHI, -PHI], [0, -INV_PHI, PHI], [0, -INV_PHI, -PHI],
  [INV_PHI, PHI, 0], [INV_PHI, -PHI, 0], [-INV_PHI, PHI, 0], [-INV_PHI, -PHI, 0],
  [PHI, 0, INV_PHI], [PHI, 0, -INV_PHI], [-PHI, 0, INV_PHI], [-PHI, 0, -INV_PHI],
];
const DOD_FACE_IDX = [
  [0, 8, 10, 2, 16], [0, 16, 17, 1, 12], [0, 12, 14, 4, 8],
  [1, 17, 3, 11, 9], [1, 9, 5, 14, 12], [4, 14, 5, 19, 18],
  [7, 15, 6, 18, 19], [7, 19, 5, 9, 11], [7, 11, 3, 13, 15],
  [2, 10, 6, 15, 13], [2, 13, 3, 17, 16], [4, 18, 6, 10, 8],
];

function getDodVerts() {
  const verts = DOD_RAW.map(v => new THREE.Vector3(v[0], v[1], v[2]).normalize().multiplyScalar(2.2));
  return DOD_FACE_IDX.map(fi => fi.map(i => verts[i].clone()));
}

function computeFaceInfo() {
  return getDodVerts().map(verts => {
    const c = new THREE.Vector3();
    verts.forEach(v => c.add(v));
    c.divideScalar(5);
    const n = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(verts[1], verts[0]),
      new THREE.Vector3().subVectors(verts[2], verts[0])
    ).normalize();
    if (n.dot(c) < 0) n.negate();
    return { center: c, normal: n };
  });
}

function shrinkPts(pts, center, amt) {
  return pts.map(p => new THREE.Vector3().copy(p).lerp(center, amt));
}

function fanTriangulate(pts, offset) {
  const pos = [];
  const c = new THREE.Vector3();
  pts.forEach(p => c.add(p));
  c.divideScalar(pts.length);
  for (let i = 0; i < pts.length; i++) {
    pos.push(
      c.x + offset.x, c.y + offset.y, c.z + offset.z,
      pts[i].x + offset.x, pts[i].y + offset.y, pts[i].z + offset.z,
      pts[(i + 1) % pts.length].x + offset.x, pts[(i + 1) % pts.length].y + offset.y, pts[(i + 1) % pts.length].z + offset.z
    );
  }
  return pos;
}

function makeTileMesh(pts, color, faceIndex, tileIndex, offset) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(fanTriangulate(pts, offset), 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color), roughness: 0.32, metalness: 0.02, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = { faceIndex, tileIndex };
  return mesh;
}

function buildFaceGroup(verts, tiles, fi) {
  const group = new THREE.Group();
  const center = new THREE.Vector3();
  verts.forEach(v => center.add(v));
  center.divideScalar(5);
  const normal = new THREE.Vector3().crossVectors(
    new THREE.Vector3().subVectors(verts[1], verts[0]),
    new THREE.Vector3().subVectors(verts[2], verts[0])
  ).normalize();
  if (normal.dot(center) < 0) normal.negate();
  const bump = normal.clone().multiplyScalar(0.012);
  const GAP = 0.07;

  const outerV = verts.map(v => {
    const d = new THREE.Vector3().subVectors(v, center);
    return new THREE.Vector3().copy(center).add(d.multiplyScalar(0.97));
  });
  const innerV = verts.map(v => {
    const d = new THREE.Vector3().subVectors(v, center);
    return new THREE.Vector3().copy(center).add(d.multiplyScalar(0.33));
  });
  const outerMids = [];
  for (let i = 0; i < 5; i++) {
    outerMids.push(new THREE.Vector3().lerpVectors(outerV[i], outerV[(i + 1) % 5], 0.5));
  }

  // Black base (static — no faceIndex so animation ignores it)
  const bp = [];
  for (let i = 0; i < 5; i++) {
    bp.push(center.x, center.y, center.z, verts[i].x, verts[i].y, verts[i].z, verts[(i + 1) % 5].x, verts[(i + 1) % 5].y, verts[(i + 1) % 5].z);
  }
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute("position", new THREE.Float32BufferAttribute(bp, 3));
  bGeo.computeVertexNormals();
  group.add(new THREE.Mesh(bGeo, new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.9, side: THREE.DoubleSide })));

  // Center pentagon (tile 0)
  const cc = new THREE.Vector3();
  innerV.forEach(v => cc.add(v));
  cc.divideScalar(5);
  group.add(makeTileMesh(shrinkPts(innerV, cc, GAP), tiles[0], fi, 0, bump));

  // Corner kites (odd tiles) and edge triangles (even tiles)
  for (let i = 0; i < 5; i++) {
    const i2 = (i + 1) % 5;
    const prevI = (i + 4) % 5;

    const cp = [innerV[i], outerMids[prevI], outerV[i], outerMids[i]];
    const cpc = new THREE.Vector3();
    cp.forEach(p => cpc.add(p));
    cpc.divideScalar(4);
    group.add(makeTileMesh(shrinkPts(cp, cpc, GAP * 0.9), tiles[1 + i * 2], fi, 1 + i * 2, bump));

    const ep = [innerV[i], outerMids[i], innerV[i2]];
    const epc = new THREE.Vector3();
    ep.forEach(p => epc.add(p));
    epc.divideScalar(3);
    group.add(makeTileMesh(shrinkPts(ep, epc, GAP * 1.1), tiles[2 + i * 2], fi, 2 + i * 2, bump));
  }
  return group;
}

/* ═══════════════════════════════════════════
   3D ARROWS
   ═══════════════════════════════════════════ */
function makeArcArrow(center, normal, tangent, bitangent, radius, startA, endA, lift, color, opacity) {
  const group = new THREE.Group();
  const liftOff = normal.clone().multiplyScalar(lift);
  const arcPts = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    const angle = startA + (endA - startA) * t;
    arcPts.push(
      center.clone().add(liftOff)
        .add(tangent.clone().multiplyScalar(Math.cos(angle) * radius))
        .add(bitangent.clone().multiplyScalar(Math.sin(angle) * radius))
    );
  }
  const curve = new THREE.CatmullRomCurve3(arcPts);
  const mat = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.5,
    roughness: 0.3, transparent: true, opacity,
  });
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.035, 6, false), mat));
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 6), mat.clone());
  const tip = arcPts[arcPts.length - 1];
  const prev = arcPts[arcPts.length - 3];
  cone.position.copy(tip);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(tip, prev).normalize());
  group.add(cone);
  return group;
}

function getFaceBasis(faceIdx, faceInfo) {
  const info = faceInfo[faceIdx];
  const normal = info.normal.clone();
  let up = new THREE.Vector3(0, 1, 0);
  if (Math.abs(normal.dot(up)) > 0.9) up = new THREE.Vector3(1, 0, 0);
  const tangent = new THREE.Vector3().crossVectors(normal, up).normalize();
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
  return { center: info.center, normal, tangent, bitangent };
}

function buildTutorialArrow(faceIdx, cw, faceInfo) {
  const { center, normal, tangent, bitangent } = getFaceBasis(faceIdx, faceInfo);
  const startA = cw ? 0.4 : -0.4;
  const endA = cw ? -2.6 : 2.6;
  const group = makeArcArrow(center, normal, tangent, bitangent, 0.7, startA, endA, 0.15, 0x00ff88, 0.9);
  group.userData = { isArrow: true };
  return group;
}

function buildHoverArrows(faceIdx, faceInfo) {
  const { center, normal, tangent, bitangent } = getFaceBasis(faceIdx, faceInfo);
  const group = new THREE.Group();
  group.add(makeArcArrow(center, normal, tangent, bitangent, 0.55, 0.3, -1.8, 0.18, 0xffffff, 0.75));
  group.add(makeArcArrow(center, normal, tangent, bitangent, 0.55, -0.3, 1.8, 0.18, 0xffffff, 0.75));
  group.visible = false;
  return group;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */
export default function Megaminx3D() {
  // Three.js refs
  const mountRef = useRef(null);
  const cameraRef = useRef(null);
  const puzzleRef = useRef(null);
  const hoverGroupRef = useRef(null);
  const arrowRef = useRef(null);
  const rayRef = useRef(new THREE.Raycaster());
  const faceInfoRef = useRef(computeFaceInfo());

  // Animation state
  const animRef = useRef({
    active: false, pivot: null, axis: null,
    targetAngle: 0, startTime: 0, duration: 280, onComplete: null,
  });
  const camTargetRef = useRef({ x: 0.4, y: -0.3, active: false });
  const hoveredFaceRef = useRef(null);

  // All mutable game state in one ref to avoid stale closures
  const S = useRef({
    faces: createSolved(), history: [], solving: false, sel: null,
    rot: { x: 0.4, y: -0.3 },
    dragging: false, dragType: null, dragFaceIdx: null,
    dragStartScreen: null, prevMouse: { x: 0, y: 0 },
    tutorialMode: false, tutorialSteps: [], tutorialIdx: 0,
    demoMode: false,
  });

  // React UI state
  const [uiFaces, setUiFaces] = useState(() => createSolved());
  const [uiSel, setUiSel] = useState(null);
  const [moves, setMoves] = useState(0);
  const [shuffled, setShuffled] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [solving, setSolving] = useState(false);
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [hasHist, setHasHist] = useState(false);
  const [tutMode, setTutMode] = useState(false);
  const [tutStep, setTutStep] = useState(0);
  const [tutTotal, setTutTotal] = useState(0);
  const [tutFeedback, setTutFeedback] = useState(null);
  const [demoActive, setDemoActive] = useState(false);
  const [demoPhase, setDemoPhase] = useState(-1);
  const [demoLabel, setDemoLabel] = useState("");
  const [demoTitle, setDemoTitle] = useState("");
  const [demoTip, setDemoTip] = useState("");

  // Timer
  useEffect(() => {
    if (running) {
      const id = setInterval(() => setTime(t => t + 1), 1000);
      return () => clearInterval(id);
    }
  }, [running]);

  // Solve detection
  useEffect(() => {
    if (shuffled && !solving && !tutMode && !demoActive && checkSolved(uiFaces)) {
      setRunning(false);
      setCelebrating(true);
      setTimeout(() => setCelebrating(false), 5000);
    }
  }, [uiFaces, shuffled, solving, tutMode, demoActive]);

  /* ── Core helpers ── */
  const rebuild = useCallback((fd) => {
    const g = puzzleRef.current;
    if (!g) return;
    const toRemove = [];
    g.children.forEach(c => {
      if (!c.userData?.isArrow && !c.userData?.isCore) toRemove.push(c);
    });
    toRemove.forEach(c => {
      c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      g.remove(c);
    });
    getDodVerts().forEach((v, i) => g.add(buildFaceGroup(v, fd[i], i)));
  }, []);

  const syncUI = useCallback(() => {
    setUiFaces(cloneF(S.current.faces));
    setUiSel(S.current.sel);
    setHasHist(S.current.history.length > 0);
  }, []);

  const highlightFace = useCallback((faceIdx, color) => {
    const g = puzzleRef.current;
    if (!g) return;
    const emCol = color || 0x443300;
    g.traverse(o => {
      if (o.isMesh && o.userData.tileIndex !== undefined && o.userData.tileIndex >= 0 && o.material) {
        const sel = faceIdx !== null && o.userData.faceIndex === faceIdx;
        o.material.emissive = new THREE.Color(sel ? emCol : 0x000000);
        o.material.emissiveIntensity = sel ? 0.7 : 0;
      }
    });
  }, []);

  const clearArrow = useCallback(() => {
    const g = puzzleRef.current;
    if (!g) return;
    const arrows = [];
    g.children.forEach(c => { if (c.userData?.isArrow) arrows.push(c); });
    arrows.forEach(a => {
      a.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      g.remove(a);
    });
    arrowRef.current = null;
  }, []);

  const showArrow = useCallback((fi, cw) => {
    clearArrow();
    const g = puzzleRef.current;
    if (!g) return;
    const arrow = buildTutorialArrow(fi, cw, faceInfoRef.current);
    g.add(arrow);
    arrowRef.current = arrow;
  }, [clearArrow]);

  // Hover arrows — in separate group, just toggle visibility
  const clearHover = useCallback(() => {
    const hg = hoverGroupRef.current;
    if (hg) hg.children.forEach(c => { c.visible = false; });
    hoveredFaceRef.current = null;
  }, []);

  const showHover = useCallback((fi) => {
    if (hoveredFaceRef.current === fi) return;
    const hg = hoverGroupRef.current;
    if (hg) hg.children.forEach((c, i) => { c.visible = (i === fi); });
    hoveredFaceRef.current = fi;
  }, []);

  const panTo = useCallback((fi) => {
    const info = faceInfoRef.current[fi];
    camTargetRef.current = {
      x: Math.atan2(info.center.y, Math.sqrt(info.center.x ** 2 + info.center.z ** 2)),
      y: -Math.atan2(info.center.x, info.center.z),
      active: true,
    };
  }, []);

  /* ── Animated rotation ── */
  const animateRotation = useCallback((fi, cw, duration, onDone) => {
    const anim = animRef.current;
    if (anim.active) return;
    const g = puzzleRef.current;
    const info = faceInfoRef.current[fi];
    const adj = getAdj(fi);
    const tiles = [];

    g.traverse(o => {
      if (!o.isMesh || o.userData.tileIndex === undefined || o.userData?.isArrow) return;
      const ofi = o.userData.faceIndex;
      const oti = o.userData.tileIndex;
      if (ofi === fi) { tiles.push(o); return; }
      for (const [adjFi, adjTiles] of adj) {
        if (ofi === adjFi && adjTiles.includes(oti)) { tiles.push(o); break; }
      }
    });

    const pivot = new THREE.Group();
    pivot.position.copy(info.center);
    g.add(pivot);
    for (const mesh of tiles) {
      mesh.parent.remove(mesh);
      pivot.add(mesh);
      mesh.position.sub(info.center);
    }

    anim.active = true;
    anim.pivot = pivot;
    anim.axis = info.normal.clone().normalize();
    anim.targetAngle = cw ? -(2 * Math.PI / 5) : (2 * Math.PI / 5);
    anim.startTime = performance.now();
    anim.duration = duration;
    anim.onComplete = () => {
      g.remove(pivot);
      while (pivot.children.length) {
        const c = pivot.children[0];
        c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        pivot.remove(c);
      }
      rotFace(S.current.faces, fi, cw);
      rebuild(S.current.faces);
      highlightFace(S.current.sel);
      syncUI();
      anim.active = false;
      if (onDone) onDone();
    };
  }, [rebuild, highlightFace, syncUI]);

  /* ── Tutorial ── */
  const showTutStep = useCallback(() => {
    const s = S.current;
    if (!s.tutorialMode || s.tutorialIdx >= s.tutorialSteps.length) return;
    const step = s.tutorialSteps[s.tutorialIdx];
    highlightFace(step.face, 0x004422);
    showArrow(step.face, step.cw);
    setTutStep(s.tutorialIdx);
    panTo(step.face);
  }, [highlightFace, showArrow, panTo]);

  const handleTutRot = useCallback((fi, cw) => {
    const s = S.current;
    if (!s.tutorialMode || s.tutorialIdx >= s.tutorialSteps.length) return false;
    const expected = s.tutorialSteps[s.tutorialIdx];
    if (fi === expected.face && cw === expected.cw) {
      setTutFeedback("correct");
      clearArrow();
      animateRotation(fi, cw, 280, () => {
        s.tutorialIdx++;
        if (s.tutorialIdx >= s.tutorialSteps.length) {
          s.tutorialMode = false;
          clearArrow();
          setTutMode(false);
          setTutFeedback(null);
          setCelebrating(true);
          setTimeout(() => setCelebrating(false), 5000);
        } else {
          setTimeout(() => { setTutFeedback(null); showTutStep(); }, 300);
        }
      });
      return true;
    }
    setTutFeedback("wrong");
    setTimeout(() => setTutFeedback(null), 800);
    return true;
  }, [animateRotation, clearArrow, showTutStep]);

  /* ── Demo ── */
  const playDemo = useCallback((phaseIdx) => {
    const s = S.current;
    if (s.solving || s.tutorialMode || s.demoMode || animRef.current.active) return;
    const demo = DEMOS[phaseIdx];
    const f = createSolved();
    for (const mv of demo.setup) rotFace(f, mv.f, mv.c);
    s.faces = cloneF(f);
    s.history = [];
    s.sel = null;
    s.demoMode = true;
    clearHover();
    rebuild(f);
    highlightFace(null);
    syncUI();
    setDemoActive(true);
    setDemoPhase(phaseIdx);
    setDemoLabel(demo.desc);
    setDemoTitle(demo.title);
    setDemoTip(demo.tip);
    setShuffled(false);
    setRunning(false);
    setMoves(0);

    const solveMoves = demo.solve.map(mv => ({ face: mv.f, cw: mv.c }));
    let idx = 0;
    if (solveMoves.length > 0) panTo(solveMoves[0].face);

    const step = () => {
      if (!S.current.demoMode) return;
      if (idx >= solveMoves.length) {
        setTimeout(() => {
          if (!S.current.demoMode) return;
          const f2 = createSolved();
          for (const mv of demo.setup) rotFace(f2, mv.f, mv.c);
          S.current.faces = cloneF(f2);
          rebuild(f2);
          highlightFace(null);
          syncUI();
          idx = 0;
          if (solveMoves.length > 0) panTo(solveMoves[0].face);
          setTimeout(step, 600);
        }, 1500);
        return;
      }
      const mv = solveMoves[idx];
      highlightFace(mv.face, 0x004422);
      showArrow(mv.face, mv.cw);
      panTo(mv.face);
      setTimeout(() => {
        if (!S.current.demoMode) return;
        clearArrow();
        animateRotation(mv.face, mv.cw, 400, () => { idx++; setTimeout(step, 300); });
      }, 600);
    };
    setTimeout(step, 800);
  }, [rebuild, highlightFace, syncUI, clearArrow, clearHover, showArrow, panTo, animateRotation]);

  const stopDemo = useCallback(() => {
    S.current.demoMode = false;
    clearArrow();
    clearHover();
    highlightFace(null);
    setDemoActive(false);
    setDemoPhase(-1);
    setDemoLabel("");
    setDemoTitle("");
    setDemoTip("");
  }, [clearArrow, clearHover, highlightFace]);

  /* ═══ Init Three.js ═══ */
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const w = el.clientWidth, h = el.clientHeight;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0c18);
    const camera = new THREE.PerspectiveCamera(36, w / h, 0.1, 100);
    camera.position.set(0, 0, 8);
    cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    el.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x606080, 0.7));
    const kl = new THREE.DirectionalLight(0xfff0dd, 1.5);
    kl.position.set(5, 7, 6);
    scene.add(kl);
    const fl = new THREE.DirectionalLight(0x6688ff, 0.4);
    fl.position.set(-5, -3, 4);
    scene.add(fl);
    const rl = new THREE.PointLight(0xff8844, 0.5, 14);
    rl.position.set(0, -4, 4);
    scene.add(rl);

    // Puzzle group
    const group = new THREE.Group();
    puzzleRef.current = group;
    scene.add(group);

    // Black core
    const core = new THREE.Mesh(
      new THREE.DodecahedronGeometry(2.15, 0),
      new THREE.MeshBasicMaterial({ color: 0x080808 })
    );
    core.userData = { isCore: true };
    group.add(core);
    rebuild(S.current.faces);

    // Hover arrows — SEPARATE group in scene, synced rotation
    const hoverGroup = new THREE.Group();
    scene.add(hoverGroup);
    hoverGroupRef.current = hoverGroup;
    const fInfo = faceInfoRef.current;
    for (let i = 0; i < 12; i++) {
      hoverGroup.add(buildHoverArrows(i, fInfo));
    }

    // Animation loop
    let raf;
    const animate = (now) => {
      raf = requestAnimationFrame(animate);
      const s = S.current;
      const anim = animRef.current;

      // Auto-rotate when idle
      if (!s.dragging && !s.solving && !anim.active) s.rot.y += 0.002;

      // Smooth camera pan
      const cam = camTargetRef.current;
      if (cam.active) {
        const dx = cam.x - s.rot.x, dy = cam.y - s.rot.y;
        if (Math.abs(dx) < 0.005 && Math.abs(dy) < 0.005) {
          cam.active = false;
        } else {
          s.rot.x += dx * 0.06;
          s.rot.y += dy * 0.06;
        }
      }

      group.rotation.x = s.rot.x;
      group.rotation.y = s.rot.y;
      hoverGroup.rotation.x = s.rot.x;
      hoverGroup.rotation.y = s.rot.y;

      // Pulse tutorial arrow
      if (arrowRef.current) {
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
        arrowRef.current.traverse(o => {
          if (o.material && o.material.emissiveIntensity !== undefined) {
            o.material.emissiveIntensity = pulse;
          }
        });
      }

      // Rotation animation
      if (anim.active && anim.pivot) {
        const t = Math.min((now - anim.startTime) / anim.duration, 1);
        anim.pivot.quaternion.setFromAxisAngle(anim.axis, anim.targetAngle * easeInOutCubic(t));
        if (t >= 1) {
          const cb = anim.onComplete;
          anim.active = false;
          anim.pivot = null;
          if (cb) cb();
        }
      }

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(animate);

    const onResize = () => {
      const w2 = el.clientWidth, h2 = el.clientHeight;
      camera.aspect = w2 / h2;
      camera.updateProjectionMatrix();
      renderer.setSize(w2, h2);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [rebuild]);

  // Sync 3D with React state
  useEffect(() => {
    if (!animRef.current.active) {
      rebuild(uiFaces);
      highlightFace(uiSel);
    }
  }, [uiFaces, uiSel, rebuild, highlightFace]);

  /* ═══ Pointer Events ═══ */
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const getXY = (e) => ({
      cx: e.touches ? e.touches[0].clientX : e.clientX,
      cy: e.touches ? e.touches[0].clientY : e.clientY,
    });

    const hitTest = (cx, cy) => {
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((cx - rect.left) / rect.width) * 2 - 1,
        -((cy - rect.top) / rect.height) * 2 + 1
      );
      rayRef.current.setFromCamera(ndc, cameraRef.current);
      const hits = rayRef.current.intersectObjects(puzzleRef.current.children, true);
      for (const hit of hits) {
        if (hit.object.userData.faceIndex !== undefined && !hit.object.userData?.isArrow) {
          return { faceIndex: hit.object.userData.faceIndex };
        }
      }
      return null;
    };

    const onDown = (e) => {
      e.preventDefault();
      clearHover();
      const s = S.current;
      if (s.solving || s.demoMode || animRef.current.active) return;
      const p = getXY(e);
      s.dragStartScreen = { ...p };
      s.prevMouse = { ...p };
      s.dragging = true;
      camTargetRef.current.active = false;
      const hit = hitTest(p.cx, p.cy);
      s.dragType = hit ? "face" : "orbit";
      s.dragFaceIdx = hit ? hit.faceIndex : null;
    };

    const onMove = (e) => {
      const s = S.current;

      // Hover (mouse only, not during drag/solve/demo/tutorial)
      if (!s.dragging && !s.solving && !s.demoMode && !s.tutorialMode && !animRef.current.active && !e.touches) {
        const p = getXY(e);
        const hit = hitTest(p.cx, p.cy);
        if (hit) showHover(hit.faceIndex);
        else clearHover();
        return;
      }

      if (!s.dragging || s.solving || s.demoMode || animRef.current.active) return;
      const p = getXY(e);

      if (s.dragType === "orbit") {
        s.rot.y += (p.cx - s.prevMouse.cx) * 0.008;
        s.rot.x += (p.cy - s.prevMouse.cy) * 0.008;
        s.rot.x = Math.max(-1.5, Math.min(1.5, s.rot.x));
        s.prevMouse = { ...p };
        return;
      }

      if (s.dragType === "face" && s.dragStartScreen) {
        const dx = p.cx - s.dragStartScreen.cx;
        const dy = p.cy - s.dragStartScreen.cy;
        if (Math.sqrt(dx * dx + dy * dy) > 35) {
          const fi = s.dragFaceIdx;
          if (fi === null || fi === undefined) return;
          const info = faceInfoRef.current[fi];
          const faceNormal = info.normal.clone().applyEuler(new THREE.Euler(s.rot.x, s.rot.y, 0, "XYZ"));
          const faceCenter = info.center.clone().applyEuler(new THREE.Euler(s.rot.x, s.rot.y, 0, "XYZ"));
          const projected = faceCenter.clone().project(cameraRef.current);
          const rect = el.getBoundingClientRect();
          const srx = s.dragStartScreen.cx - rect.left - (projected.x + 1) / 2 * rect.width;
          const sry = s.dragStartScreen.cy - rect.top - (-projected.y + 1) / 2 * rect.height;
          const cross = srx * dy - sry * dx;
          const cw = faceNormal.z > 0 ? (cross > 0) : (cross < 0);

          if (s.tutorialMode) {
            handleTutRot(fi, cw);
          } else {
            if (!s.tutorialMode && !s.demoMode) s.history.push({ face: fi, cw });
            setMoves(m => m + 1);
            animateRotation(fi, cw, 250);
          }
          s.dragType = null;
          s.dragging = false;
          s.dragFaceIdx = null;
          s.dragStartScreen = null;
        }
      }
    };

    const onUp = (e) => {
      const s = S.current;
      if (s.solving || s.demoMode || animRef.current.active) { s.dragging = false; return; }
      const end = e.changedTouches ? e.changedTouches[0] : e;
      if (s.dragType === "face" && s.dragStartScreen) {
        const dx = Math.abs(end.clientX - s.dragStartScreen.cx);
        const dy = Math.abs(end.clientY - s.dragStartScreen.cy);
        if (dx < 10 && dy < 10 && !s.tutorialMode) {
          const fi = s.dragFaceIdx;
          if (fi !== null && fi !== undefined) {
            s.sel = s.sel === fi ? null : fi;
            highlightFace(s.sel);
            setUiSel(s.sel);
          }
        }
      }
      s.dragging = false;
      s.dragType = null;
      s.dragFaceIdx = null;
      s.dragStartScreen = null;
    };

    const onLeave = () => {
      S.current.dragging = false;
      S.current.dragType = null;
      clearHover();
    };

    el.addEventListener("mousedown", onDown);
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseup", onUp);
    el.addEventListener("mouseleave", onLeave);
    el.addEventListener("touchstart", onDown, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onUp);
    return () => {
      el.removeEventListener("mousedown", onDown);
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseup", onUp);
      el.removeEventListener("mouseleave", onLeave);
      el.removeEventListener("touchstart", onDown);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onUp);
    };
  }, [rebuild, highlightFace, syncUI, animateRotation, handleTutRot, showHover, clearHover]);

  /* ═══ Action Handlers ═══ */
  const handleShuffle = () => {
    if (animRef.current.active || S.current.demoMode) return;
    const { faces: f, history: h } = doShuffle();
    const s = S.current;
    s.faces = f; s.history = h; s.sel = null; s.solving = false;
    s.tutorialMode = false; s.tutorialSteps = []; s.tutorialIdx = 0; s.demoMode = false;
    clearArrow(); clearHover(); rebuild(f); highlightFace(null);
    camTargetRef.current.active = false;
    setUiFaces(cloneF(f)); setUiSel(null); setMoves(0); setShuffled(true);
    setCelebrating(false); setTime(0); setRunning(true); setSolving(false);
    setHasHist(true); setTutMode(false); setTutFeedback(null);
    setDemoActive(false); setDemoPhase(-1);
  };

  const handleReset = () => {
    if (animRef.current.active) return;
    const f = createSolved();
    const s = S.current;
    s.faces = f; s.history = []; s.sel = null; s.solving = false;
    s.tutorialMode = false; s.demoMode = false;
    clearArrow(); clearHover(); rebuild(f); highlightFace(null);
    camTargetRef.current.active = false;
    setUiFaces(cloneF(f)); setUiSel(null); setMoves(0); setShuffled(false);
    setCelebrating(false); setTime(0); setRunning(false); setSolving(false);
    setHasHist(false); setTutMode(false); setTutFeedback(null);
    setDemoActive(false); setDemoPhase(-1);
  };

  const handleRotBtn = (cw) => {
    const s = S.current;
    if (s.solving || s.demoMode || animRef.current.active) return;
    if (s.tutorialMode) { if (s.sel !== null) handleTutRot(s.sel, cw); return; }
    if (s.sel === null) return;
    s.history.push({ face: s.sel, cw });
    setMoves(m => m + 1);
    animateRotation(s.sel, cw, 280);
  };

  const handleAutoSolve = () => {
    const s = S.current;
    if (s.solving || s.history.length === 0 || animRef.current.active || s.tutorialMode || s.demoMode) return;
    s.solving = true; s.sel = null;
    clearArrow(); clearHover();
    setSolving(true); setRunning(false); setUiSel(null);
    const rev = [...s.history].reverse().map(m => ({ face: m.face, cw: !m.cw }));
    s.history = [];
    let idx = 0;
    const step = () => {
      if (idx >= rev.length) {
        s.solving = false; setSolving(false); setHasHist(false);
        syncUI(); highlightFace(null); setUiSel(null); return;
      }
      const mv = rev[idx];
      highlightFace(mv.face); setUiSel(mv.face); panTo(mv.face);
      setMoves(m => m + 1);
      animateRotation(mv.face, mv.cw, idx < 8 ? 320 : idx < 25 ? 200 : 120, () => { idx++; step(); });
    };
    setTimeout(step, 300);
  };

  const handleLearn = () => {
    const s = S.current;
    if (s.solving || s.history.length === 0 || animRef.current.active || s.demoMode) return;
    clearHover();
    const steps = [...s.history].reverse().map(m => ({ face: m.face, cw: !m.cw }));
    s.tutorialMode = true; s.tutorialSteps = steps; s.tutorialIdx = 0;
    s.sel = null; s.history = [];
    setTutMode(true); setTutStep(0); setTutTotal(steps.length);
    setRunning(false); setTutFeedback(null); setHasHist(false);
    setTimeout(() => showTutStep(), 200);
  };

  const handleExitTut = () => {
    S.current.tutorialMode = false;
    S.current.tutorialSteps = [];
    S.current.tutorialIdx = 0;
    clearArrow(); clearHover(); highlightFace(null);
    camTargetRef.current.active = false;
    setTutMode(false); setTutFeedback(null); setUiSel(null);
  };

  /* ═══ Derived values ═══ */
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const curTutMove = tutMode ? S.current.tutorialSteps[tutStep] : null;
  const isBusy = solving || tutMode || demoActive;
  const tutProgress = tutTotal > 0 ? tutStep / tutTotal : 0;
  const tutPhaseIdx = Math.min(Math.floor(tutProgress * 7), 6);
  const tutPhase = TUT_PHASES[tutPhaseIdx];

  /* ═══ RENDER ═══ */
  return (
    <div style={{ height: "100vh", width: "100vw", display: "flex", flexDirection: "column", background: "#0c0c18", color: "#d0d0e8", overflow: "hidden", fontFamily: "'DM Mono','IBM Plex Mono',monospace" }}>

      {/* ── Celebration ── */}
      {celebrating && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.85)", backdropFilter: "blur(10px)", animation: "fadeIn .4s" }}>
          <div style={{ textAlign: "center", animation: "popIn .5s cubic-bezier(.68,-.55,.265,1.55)" }}>
            <div style={{ fontSize: 72 }}>🏆</div>
            <h2 style={{ fontSize: 44, fontWeight: 900, margin: "8px 0 0", background: "linear-gradient(90deg,#F5D000,#EE6600,#CC1111)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>SOLVED!</h2>
            <p style={{ color: "#bbb", fontSize: 16, marginTop: 10 }}>{moves} moves · {fmt(time)}</p>
            <button onClick={() => setCelebrating(false)} style={{ marginTop: 16, padding: "10px 24px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, color: "#ddd", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>CLOSE</button>
          </div>
        </div>
      )}

      {/* ── How to Solve Guide ── */}
      {showGuide && (
        <div style={{ position: "fixed", inset: 0, zIndex: 150, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,.7)", backdropFilter: "blur(6px)", animation: "fadeIn .3s" }} onClick={() => setShowGuide(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 540, maxHeight: "80vh", background: "#14142a", borderRadius: "20px 20px 0 0", border: "1px solid rgba(255,255,255,0.12)", borderBottom: "none", padding: "20px 24px 30px", overflowY: "auto", animation: "slideUp .4s cubic-bezier(.16,1,.3,1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, background: "linear-gradient(90deg,#F5D000,#EE6600)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>How to Solve a Megaminx</h3>
              <button onClick={() => setShowGuide(false)} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: "#bbb", fontSize: 16, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>✕</button>
            </div>
            {GUIDE_STEPS.map((step, i) => (
              <div key={i} style={{ marginBottom: 16, padding: "12px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#EE6600", background: "rgba(238,102,0,0.18)", padding: "2px 7px", borderRadius: 6 }}>{i + 1}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#eee" }}>{step.t}</span>
                </div>
                <p style={{ fontSize: 12, color: "#aaa", lineHeight: 1.7, margin: "0 0 10px 0", paddingLeft: 32 }}>{step.d}</p>
                <div style={{ paddingLeft: 32 }}>
                  <button onClick={() => { setShowGuide(false); setTimeout(() => playDemo(i), 300); }} style={{ padding: "6px 14px", background: "rgba(0,204,102,0.1)", border: "1px solid rgba(0,204,102,0.25)", borderRadius: 8, color: "#44dd88", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
                    onMouseOver={e => { e.currentTarget.style.background = "rgba(0,204,102,0.2)"; }}
                    onMouseOut={e => { e.currentTarget.style.background = "rgba(0,204,102,0.1)"; }}
                  ><span style={{ fontSize: 14 }}>▶</span> Watch Demo</button>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 8, padding: "12px 16px", background: "rgba(245,208,0,0.08)", borderRadius: 12, border: "1px solid rgba(245,208,0,0.2)" }}>
              <p style={{ fontSize: 12, color: "#ccaa44", margin: 0, lineHeight: 1.7 }}>
                <strong style={{ color: "#F5D000" }}>Fun fact:</strong> The Megaminx has ~1.01 × 10⁶⁸ possible states. World record is under 25 seconds!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── HUD ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", zIndex: 10, flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, background: "linear-gradient(135deg,#F5D000,#EE6600,#CC1111)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>MEGAMINX <span style={{ fontSize: 13, fontWeight: 600, opacity: 0.7 }}>12-Sided Rubik's Cube</span></h1>
          <p style={{ fontSize: 10, color: "#8888a0", letterSpacing: 3, margin: 0 }}>DRAG TILES TO ROTATE · TAP TO SELECT</p>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#8888a0", letterSpacing: 2 }}>TIME</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#F5D000", fontVariantNumeric: "tabular-nums" }}>{fmt(time)}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#8888a0", letterSpacing: 2 }}>MOVES</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#EE6600", fontVariantNumeric: "tabular-nums" }}>{moves}</div>
          </div>
        </div>
      </div>

      {/* ── Tutorial Banner ── */}
      {tutMode && (
        <div style={{ padding: "12px 16px", zIndex: 20, flexShrink: 0, background: tutFeedback === "correct" ? "rgba(0,255,100,0.12)" : tutFeedback === "wrong" ? "rgba(255,50,50,0.12)" : "rgba(0,255,136,0.07)", borderBottom: `1px solid ${tutFeedback === "correct" ? "rgba(0,255,100,0.35)" : tutFeedback === "wrong" ? "rgba(255,50,50,0.35)" : "rgba(0,255,136,0.2)"}`, transition: "all .3s" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#F5D000", background: "rgba(245,208,0,0.15)", padding: "2px 7px", borderRadius: 5 }}>PHASE {tutPhaseIdx + 1}/7</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#ddddee" }}>{tutPhase.name}</span>
              </div>
              <div style={{ fontSize: 11, color: "#88aa99", marginBottom: 6 }}>{tutPhase.desc}</div>
              <div style={{ fontSize: 11, color: "#66cc88", letterSpacing: 2, fontWeight: 700, marginBottom: 3 }}>MOVE {tutStep + 1} OF {tutTotal}</div>
              <div style={{ fontSize: 14, color: "#eee", fontWeight: 600 }}>
                {curTutMove ? (<>Rotate the <span style={{ color: COLORS[curTutMove.face], fontWeight: 800, textShadow: COLORS[curTutMove.face] === "#FFFFFF" ? "0 0 6px rgba(200,200,255,0.7)" : "none" }}>{NAMES[curTutMove.face]}</span> face {curTutMove.cw ? "clockwise ↻" : "counter-clockwise ↺"}</>) : "Complete!"}
              </div>
              {tutFeedback === "wrong" && <div style={{ fontSize: 12, color: "#ff7766", marginTop: 4, fontWeight: 600 }}>Wrong face or direction — try again!</div>}
              {tutFeedback === "correct" && <div style={{ fontSize: 12, color: "#55ff99", marginTop: 4, fontWeight: 600 }}>Correct!</div>}
            </div>
            <button onClick={handleExitTut} style={{ padding: "7px 16px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "#bbb", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0, alignSelf: "flex-start" }}>EXIT</button>
          </div>
          <div style={{ display: "flex", gap: 3, marginTop: 10 }}>
            {TUT_PHASES.map((_, pi) => (
              <div key={pi} style={{ flex: 1, height: 4, borderRadius: 2, background: pi < tutPhaseIdx ? "rgba(0,255,136,0.5)" : pi === tutPhaseIdx ? "rgba(0,255,136,0.25)" : "rgba(255,255,255,0.06)", overflow: "hidden", position: "relative" }}>
                {pi === tutPhaseIdx && <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.max(0, Math.min(100, ((tutStep / tutTotal - tutPhaseIdx / 7) / (1 / 7)) * 100))}%`, background: "linear-gradient(90deg, #00ff88, #44ddaa)", borderRadius: 2, transition: "width .3s" }} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Demo Banner ── */}
      {demoActive && (
        <div style={{ padding: "12px 16px", zIndex: 20, flexShrink: 0, background: "rgba(100,100,255,0.08)", borderBottom: "1px solid rgba(100,100,255,0.2)", maxHeight: "35vh", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#8888ff", background: "rgba(100,100,255,0.15)", padding: "2px 8px", borderRadius: 5 }}>STEP {demoPhase + 1}/7</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#ccccee" }}>{demoTitle}</span>
              </div>
              <div style={{ fontSize: 12, color: "#bbc", lineHeight: 1.65, marginBottom: 8 }}>{demoLabel}</div>
              <div style={{ padding: "8px 12px", background: "rgba(245,208,0,0.06)", borderRadius: 8, border: "1px solid rgba(245,208,0,0.12)" }}>
                <span style={{ fontWeight: 700, color: "#F5D000", fontSize: 11 }}>Tip: </span>
                <span style={{ fontSize: 11, color: "#ccaa44" }}>{demoTip}</span>
              </div>
              <div style={{ fontSize: 10, color: "#6677aa", marginTop: 8, fontStyle: "italic" }}>Looping — watch the green arrow</div>
            </div>
            <button onClick={stopDemo} style={{ padding: "7px 16px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "#bbb", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>STOP</button>
          </div>
        </div>
      )}

      {/* ── 3D Viewport ── */}
      <div ref={mountRef} style={{ flex: 1, cursor: isBusy ? "not-allowed" : "grab", touchAction: "none", position: "relative" }}>
        {solving && (
          <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 20, padding: "8px 20px", background: "rgba(245,208,0,0.15)", border: "1px solid rgba(245,208,0,0.35)", borderRadius: 10, fontSize: 13, fontWeight: 700, color: "#F5D000", letterSpacing: 1, animation: "pulse 1s infinite alternate" }}>SOLVING...</div>
        )}
      </div>

      {/* ── Controls ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 12px 6px", zIndex: 10, flexShrink: 0, flexWrap: "wrap" }}>
        <CBtn onClick={handleShuffle} bg="linear-gradient(135deg,#CC1111,#EE6600)" shadow="#cc333355" disabled={isBusy}>SHUFFLE</CBtn>
        <CBtn onClick={handleAutoSolve} bg="linear-gradient(135deg,#F5D000,#EE9900)" shadow="#F5D00044" disabled={isBusy || !hasHist} faded={!hasHist || isBusy}>SOLVE</CBtn>
        <CBtn onClick={handleLearn} bg="linear-gradient(135deg,#00cc66,#009955)" shadow="#00cc6644" disabled={isBusy || !hasHist} faded={!hasHist || isBusy}>LEARN</CBtn>
        <CBtn onClick={handleReset} bg="rgba(255,255,255,0.1)" shadow="transparent" color="#bbb" border disabled={isBusy}>RESET</CBtn>
        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.15)", margin: "0 2px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 10, background: uiSel !== null ? "rgba(245,208,0,0.1)" : "transparent", border: `1px solid ${uiSel !== null ? "rgba(245,208,0,0.3)" : "rgba(255,255,255,0.08)"}`, transition: "all .3s" }}>
          <RBtn onClick={() => handleRotBtn(false)} disabled={uiSel === null || isBusy}>↺</RBtn>
          <span style={{ fontSize: 12, fontWeight: 700, minWidth: 55, textAlign: "center", color: uiSel !== null ? "#F5D000" : "#6a6a80" }}>{uiSel !== null ? NAMES[uiSel] : "—"}</span>
          <RBtn onClick={() => handleRotBtn(true)} disabled={uiSel === null || isBusy}>↻</RBtn>
        </div>
      </div>

      <div style={{ padding: "6px 16px 16px", zIndex: 10, flexShrink: 0, textAlign: "center" }}>
        <button onClick={() => setShowGuide(true)} style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, color: "#9999b0", fontSize: 12, fontWeight: 600, padding: "8px 20px", cursor: "pointer", fontFamily: "inherit", letterSpacing: 1 }}
          onMouseOver={e => { e.currentTarget.style.color = "#F5D000"; e.currentTarget.style.borderColor = "rgba(245,208,0,0.35)"; }}
          onMouseOut={e => { e.currentTarget.style.color = "#9999b0"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
        >HOW TO SOLVE</button>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes popIn { from { transform: scale(.4); opacity: 0 } to { transform: scale(1); opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @keyframes pulse { from { opacity: .6 } to { opacity: 1 } }
        button:active { transform: scale(.93) !important; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px; }
      `}</style>
    </div>
  );
}

/* ═══ UI Components ═══ */
function CBtn({ children, onClick, bg, shadow, color, border, disabled, faded }) {
  const dim = faded && disabled;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "9px 16px",
      background: dim ? "rgba(255,255,255,0.06)" : disabled ? "rgba(255,255,255,0.06)" : bg,
      border: border ? "1px solid rgba(255,255,255,0.15)" : dim ? "1px solid rgba(255,255,255,0.1)" : disabled ? "1px solid rgba(255,255,255,0.06)" : "none",
      borderRadius: 9, color: dim ? "#666" : disabled ? "#777" : (color || "#fff"),
      fontFamily: "inherit", fontSize: 12, fontWeight: 700, letterSpacing: 1.2,
      cursor: disabled ? "default" : "pointer", transition: "all .3s",
      boxShadow: disabled ? "none" : `0 4px 16px ${shadow}`,
      opacity: dim ? 0.55 : disabled ? 0.6 : 1,
    }}>{children}</button>
  );
}

function RBtn({ children, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
      background: disabled ? "rgba(255,255,255,0.04)" : "rgba(245,208,0,0.15)",
      border: `1px solid ${disabled ? "rgba(255,255,255,0.08)" : "rgba(245,208,0,0.35)"}`,
      borderRadius: 8, color: disabled ? "#555" : "#F5D000", fontSize: 18, fontWeight: 700,
      cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
    }}>{children}</button>
  );
}
