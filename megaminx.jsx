import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";

const COLORS = [
  "#EEEEEE","#CC1111","#007744","#F5D000","#0055BB","#EE6600",
  "#888888","#DD44AA","#77CC22","#DDBB77","#7711AA","#33AACC",
];
const NAMES = [
  "White","Red","Green","Yellow","Blue","Orange",
  "Gray","Pink","Lime","Cream","Purple","Cyan",
];

function createSolved() {
  return Array.from({ length: 12 }, (_, i) => Array(11).fill(COLORS[i]));
}
function cloneF(f) { return f.map(r => [...r]); }

/*
  CORRECTED adjacency map — computed from actual dodecahedron vertex sharing.
  
  Face vertex definitions:
    0:[0,8,10,2,16]  1:[0,16,17,1,12]  2:[0,12,14,4,8]
    3:[1,17,3,11,9]   4:[1,9,5,14,12]   5:[4,14,5,19,18]
    6:[7,15,6,18,19]  7:[7,19,5,9,11]   8:[7,11,3,13,15]
    9:[2,10,6,15,13] 10:[2,13,3,17,16] 11:[4,18,6,10,8]

  Tile layout per face:
    0=center, odd 1,3,5,7,9=corners at vertices 0-4, even 2,4,6,8,10=edges between vertices.
  
  For each face, 5 entries [adjFace, [t1,t2,t3]] listed in edge order (edge 0,1,2,3,4).
  Tiles are ordered: [corner near start, edge piece, corner near end] matching the rotating face's CW direction.
  Adjacent edges always run opposite to the main face's edge, so the tile order is reversed.
*/
function getAdj(fi) {
  const m = {
    0:  [[2,[1,10,9]],  [11,[9,8,7]], [9,[3,2,1]],  [10,[1,10,9]], [1,[3,2,1]]],
    1:  [[0,[1,10,9]],  [10,[9,8,7]], [3,[3,2,1]],   [4,[1,10,9]],  [2,[3,2,1]]],
    2:  [[1,[1,10,9]],  [4,[9,8,7]],  [5,[3,2,1]],   [11,[1,10,9]], [0,[3,2,1]]],
    3:  [[1,[7,6,5]],   [10,[7,6,5]], [8,[5,4,3]],    [7,[9,8,7]],   [4,[3,2,1]]],
    4:  [[3,[1,10,9]],  [7,[7,6,5]],  [5,[5,4,3]],    [2,[5,4,3]],   [1,[9,8,7]]],
    5:  [[2,[7,6,5]],   [4,[7,6,5]],  [7,[5,4,3]],    [6,[9,8,7]],   [11,[3,2,1]]],
    6:  [[8,[1,10,9]],  [9,[7,6,5]],  [11,[5,4,3]],   [5,[9,8,7]],   [7,[3,2,1]]],
    7:  [[6,[1,10,9]],  [5,[7,6,5]],  [4,[5,4,3]],    [3,[9,8,7]],   [8,[3,2,1]]],
    8:  [[7,[1,10,9]],  [3,[7,6,5]],  [10,[5,4,3]],   [9,[9,8,7]],   [6,[3,2,1]]],
    9:  [[0,[7,6,5]],   [11,[7,6,5]], [6,[5,4,3]],    [8,[9,8,7]],   [10,[3,2,1]]],
    10: [[9,[1,10,9]],  [8,[7,6,5]],  [3,[5,4,3]],    [1,[5,4,3]],   [0,[9,8,7]]],
    11: [[5,[1,10,9]],  [6,[7,6,5]],  [9,[5,4,3]],    [0,[5,4,3]],   [2,[9,8,7]]],
  };
  return m[fi] || [];
}

function rotFace(faces, fi, cw) {
  const f = faces[fi];
  const nf = [...f];
  if (cw) { for (let i = 0; i < 10; i++) nf[1 + ((i + 8) % 10)] = f[1 + i]; }
  else    { for (let i = 0; i < 10; i++) nf[1 + ((i + 2) % 10)] = f[1 + i]; }
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
  const f = createSolved();
  const hist = [];
  for (let i = 0; i < 80; i++) {
    const fi = Math.floor(Math.random() * 12);
    const cw = Math.random() > 0.5;
    rotFace(f, fi, cw);
    hist.push({ face: fi, cw });
  }
  return { faces: f, history: hist };
}

function checkSolved(f) { return f.every(face => face.every(t => t === face[0])); }

/* ── Three.js geometry ── */
function getDodVerts() {
  const P = (1 + Math.sqrt(5)) / 2;
  const ip = 1 / P;
  const raw = [
    [1,1,1],[1,1,-1],[1,-1,1],[1,-1,-1],
    [-1,1,1],[-1,1,-1],[-1,-1,1],[-1,-1,-1],
    [0,ip,P],[0,ip,-P],[0,-ip,P],[0,-ip,-P],
    [ip,P,0],[ip,-P,0],[-ip,P,0],[-ip,-P,0],
    [P,0,ip],[P,0,-ip],[-P,0,ip],[-P,0,-ip],
  ].map(v => new THREE.Vector3(v[0], v[1], v[2]).normalize().multiplyScalar(2.2));
  return [
    [0,8,10,2,16],[0,16,17,1,12],[0,12,14,4,8],
    [1,17,3,11,9],[1,9,5,14,12],[4,14,5,19,18],
    [7,15,6,18,19],[7,19,5,9,11],[7,11,3,13,15],
    [2,10,6,15,13],[2,13,3,17,16],[4,18,6,10,8],
  ].map(fi => fi.map(i => raw[i].clone()));
}

function computeFaceCenters() {
  return getDodVerts().map(verts => {
    const c = new THREE.Vector3(0, 0, 0);
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
  return pts.map(p => { const o = new THREE.Vector3().copy(p); o.lerp(center, amt); return o; });
}

function fanTri(pts, off) {
  const pos = [];
  const c = new THREE.Vector3(0, 0, 0);
  pts.forEach(p => c.add(p)); c.divideScalar(pts.length);
  for (let i = 0; i < pts.length; i++) {
    const a = new THREE.Vector3().addVectors(c, off);
    const b = new THREE.Vector3().addVectors(pts[i], off);
    const d = new THREE.Vector3().addVectors(pts[(i + 1) % pts.length], off);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
  }
  return pos;
}

function makeTile(pts, color, fi, ti, off) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(fanTri(pts, off), 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.32, metalness: 0.02, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData = { faceIndex: fi, tileIndex: ti };
  return mesh;
}

function buildFaceGroup(verts, tiles, fi) {
  const group = new THREE.Group();
  const center = new THREE.Vector3(0, 0, 0);
  verts.forEach(v => center.add(v)); center.divideScalar(5);
  const normal = new THREE.Vector3().crossVectors(
    new THREE.Vector3().subVectors(verts[1], verts[0]),
    new THREE.Vector3().subVectors(verts[2], verts[0])
  ).normalize();
  if (normal.dot(center) < 0) normal.negate();
  const bump = normal.clone().multiplyScalar(0.012);
  const GAP = 0.07;
  const outerV = verts.map(v => { const d = new THREE.Vector3().subVectors(v, center); return new THREE.Vector3().copy(center).add(d.multiplyScalar(0.97)); });
  const innerV = verts.map(v => { const d = new THREE.Vector3().subVectors(v, center); return new THREE.Vector3().copy(center).add(d.multiplyScalar(0.33)); });
  const outerMids = [];
  for (let i = 0; i < 5; i++) outerMids.push(new THREE.Vector3().lerpVectors(outerV[i], outerV[(i + 1) % 5], 0.5));

  // Black base
  const bp = [];
  for (let i = 0; i < 5; i++) bp.push(center.x, center.y, center.z, verts[i].x, verts[i].y, verts[i].z, verts[(i + 1) % 5].x, verts[(i + 1) % 5].y, verts[(i + 1) % 5].z);
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute("position", new THREE.Float32BufferAttribute(bp, 3));
  bGeo.computeVertexNormals();
  group.add(new THREE.Mesh(bGeo, new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.9, side: THREE.DoubleSide })));

  // Center pentagon (tile 0)
  const cc = new THREE.Vector3(0, 0, 0);
  innerV.forEach(v => cc.add(v)); cc.divideScalar(5);
  group.add(makeTile(shrinkPts(innerV, cc, GAP), tiles[0], fi, 0, bump));

  for (let i = 0; i < 5; i++) {
    const i2 = (i + 1) % 5;
    const prevI = (i + 4) % 5;
    // Corner kite (odd tiles: 1,3,5,7,9)
    const cp = [innerV[i], outerMids[prevI], outerV[i], outerMids[i]];
    const ccc = new THREE.Vector3(0, 0, 0); cp.forEach(p => ccc.add(p)); ccc.divideScalar(4);
    group.add(makeTile(shrinkPts(cp, ccc, GAP * 0.9), tiles[1 + i * 2], fi, 1 + i * 2, bump));
    // Edge triangle (even tiles: 2,4,6,8,10)
    const ep = [innerV[i], outerMids[i], innerV[i2]];
    const ecc = new THREE.Vector3(0, 0, 0); ep.forEach(p => ecc.add(p)); ecc.divideScalar(3);
    group.add(makeTile(shrinkPts(ep, ecc, GAP * 1.1), tiles[2 + i * 2], fi, 2 + i * 2, bump));
  }
  return group;
}

/* ── Component ── */
export default function Megaminx3D() {
  const mountRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const puzzleRef = useRef(null);
  const ray = useRef(new THREE.Raycaster());
  const faceCentersRef = useRef(computeFaceCenters());

  const stateRef = useRef({
    faces: createSolved(),
    history: [],
    solving: false,
    sel: null,
    rot: { x: 0.4, y: -0.3 },
    dragging: false,
    dragType: null,
    dragFaceIdx: null,
    dragStartScreen: null,
    prevMouse: { x: 0, y: 0 },
  });

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
  const timerRef = useRef(null);

  useEffect(() => {
    if (running) timerRef.current = setInterval(() => setTime(t => t + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [running]);

  useEffect(() => {
    if (shuffled && !solving && checkSolved(uiFaces)) {
      setRunning(false); setCelebrating(true);
      setTimeout(() => setCelebrating(false), 5000);
    }
  }, [uiFaces, shuffled, solving]);

  const rebuild = useCallback((fd) => {
    const g = puzzleRef.current; if (!g) return;
    while (g.children.length) {
      const c = g.children[0];
      c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      g.remove(c);
    }
    getDodVerts().forEach((v, i) => g.add(buildFaceGroup(v, fd[i], i)));
  }, []);

  const syncUI = useCallback(() => {
    const s = stateRef.current;
    setUiFaces(cloneF(s.faces));
    setUiSel(s.sel);
    setHasHist(s.history.length > 0);
  }, []);

  const highlightFace = useCallback((faceIdx) => {
    const g = puzzleRef.current; if (!g) return;
    g.traverse(o => {
      if (o.isMesh && o.userData.tileIndex !== undefined && o.material) {
        const isSel = faceIdx !== null && o.userData.faceIndex === faceIdx;
        o.material.emissive = new THREE.Color(isSel ? 0x443300 : 0x000000);
        o.material.emissiveIntensity = isSel ? 0.7 : 0;
      }
    });
  }, []);

  // Init Three.js
  useEffect(() => {
    const el = mountRef.current; if (!el) return;
    const w = el.clientWidth, h = el.clientHeight;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0c18);
    const camera = new THREE.PerspectiveCamera(36, w / h, 0.1, 100);
    camera.position.set(0, 0, 8); cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3;
    el.appendChild(renderer.domElement); rendererRef.current = renderer;

    scene.add(new THREE.AmbientLight(0x606080, 0.6));
    const kl = new THREE.DirectionalLight(0xfff0dd, 1.5); kl.position.set(5, 7, 6); scene.add(kl);
    const fl = new THREE.DirectionalLight(0x6688ff, 0.4); fl.position.set(-5, -3, 4); scene.add(fl);
    const rl = new THREE.PointLight(0xff8844, 0.5, 14); rl.position.set(0, -4, 4); scene.add(rl);

    const group = new THREE.Group(); puzzleRef.current = group; scene.add(group);
    rebuild(stateRef.current.faces);

    let raf;
    const anim = () => {
      raf = requestAnimationFrame(anim);
      const s = stateRef.current;
      if (!s.dragging && !s.solving) s.rot.y += 0.002;
      group.rotation.x = s.rot.x; group.rotation.y = s.rot.y;
      renderer.render(scene, camera);
    };
    anim();

    const onR = () => { const w2 = el.clientWidth, h2 = el.clientHeight; camera.aspect = w2 / h2; camera.updateProjectionMatrix(); renderer.setSize(w2, h2); };
    window.addEventListener("resize", onR);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onR); renderer.dispose(); if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement); };
  }, [rebuild]);

  useEffect(() => { rebuild(uiFaces); highlightFace(uiSel); }, [uiFaces, uiSel, rebuild, highlightFace]);

  // Pointer events
  useEffect(() => {
    const el = mountRef.current; if (!el) return;
    const getXY = (e) => {
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      const cy = e.touches ? e.touches[0].clientY : e.clientY;
      return { cx, cy };
    };
    const hitTest = (cx, cy) => {
      const rect = el.getBoundingClientRect();
      const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
      ray.current.setFromCamera(ndc, cameraRef.current);
      const hits = ray.current.intersectObjects(puzzleRef.current.children, true);
      for (const hit of hits) { if (hit.object.userData.faceIndex !== undefined) return { faceIndex: hit.object.userData.faceIndex }; }
      return null;
    };

    const onDown = (e) => {
      e.preventDefault();
      const s = stateRef.current; if (s.solving) return;
      const p = getXY(e);
      s.dragStartScreen = { ...p }; s.prevMouse = { ...p }; s.dragging = true;
      const hit = hitTest(p.cx, p.cy);
      if (hit) { s.dragType = "face"; s.dragFaceIdx = hit.faceIndex; }
      else { s.dragType = "orbit"; }
    };

    const onMove = (e) => {
      const s = stateRef.current; if (!s.dragging || s.solving) return;
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
          const info = faceCentersRef.current[fi];
          const faceNormal = info.normal.clone();
          const euler = new THREE.Euler(s.rot.x, s.rot.y, 0, "XYZ");
          faceNormal.applyEuler(euler);
          const faceCenter = info.center.clone().applyEuler(euler);
          const projected = faceCenter.clone().project(cameraRef.current);
          const rect = el.getBoundingClientRect();
          const fcSX = (projected.x + 1) / 2 * rect.width;
          const fcSY = (-projected.y + 1) / 2 * rect.height;
          const srx = s.dragStartScreen.cx - rect.left - fcSX;
          const sry = s.dragStartScreen.cy - rect.top - fcSY;
          const cross = srx * dy - sry * dx;
          const cw = faceNormal.z > 0 ? (cross > 0) : (cross < 0);

          rotFace(s.faces, fi, cw);
          s.history.push({ face: fi, cw });
          rebuild(s.faces); highlightFace(s.sel); syncUI();
          setMoves(m => m + 1);
          s.dragType = null; s.dragging = false; s.dragFaceIdx = null; s.dragStartScreen = null;
        }
      }
    };

    const onUp = (e) => {
      const s = stateRef.current; if (s.solving) { s.dragging = false; return; }
      const end = e.changedTouches ? e.changedTouches[0] : e;
      if (s.dragType === "face" && s.dragStartScreen) {
        const dx = Math.abs(end.clientX - s.dragStartScreen.cx);
        const dy = Math.abs(end.clientY - s.dragStartScreen.cy);
        if (dx < 10 && dy < 10) {
          const fi = s.dragFaceIdx;
          if (fi !== null && fi !== undefined) {
            s.sel = s.sel === fi ? null : fi;
            highlightFace(s.sel); setUiSel(s.sel);
          }
        }
      }
      s.dragging = false; s.dragType = null; s.dragFaceIdx = null; s.dragStartScreen = null;
    };

    const onLeave = () => { const s = stateRef.current; s.dragging = false; s.dragType = null; };

    el.addEventListener("mousedown", onDown);
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseup", onUp);
    el.addEventListener("mouseleave", onLeave);
    el.addEventListener("touchstart", onDown, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onUp);
    return () => {
      el.removeEventListener("mousedown", onDown); el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseup", onUp); el.removeEventListener("mouseleave", onLeave);
      el.removeEventListener("touchstart", onDown); el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onUp);
    };
  }, [rebuild, highlightFace, syncUI]);

  /* Actions */
  const handleShuffle = () => {
    const { faces: f, history: h } = doShuffle();
    const s = stateRef.current;
    s.faces = f; s.history = h; s.sel = null; s.solving = false;
    rebuild(f); highlightFace(null);
    setUiFaces(cloneF(f)); setUiSel(null); setMoves(0); setShuffled(true);
    setCelebrating(false); setTime(0); setRunning(true); setSolving(false); setHasHist(true);
  };

  const handleReset = () => {
    const f = createSolved();
    const s = stateRef.current;
    s.faces = f; s.history = []; s.sel = null; s.solving = false;
    rebuild(f); highlightFace(null);
    setUiFaces(cloneF(f)); setUiSel(null); setMoves(0); setShuffled(false);
    setCelebrating(false); setTime(0); setRunning(false); setSolving(false); setHasHist(false);
  };

  const handleRotBtn = (cw) => {
    const s = stateRef.current;
    if (s.sel === null || s.solving) return;
    rotFace(s.faces, s.sel, cw);
    s.history.push({ face: s.sel, cw });
    rebuild(s.faces); highlightFace(s.sel); syncUI(); setMoves(m => m + 1);
  };

  const handleAutoSolve = () => {
    const s = stateRef.current;
    if (s.solving || s.history.length === 0) return;
    s.solving = true; s.sel = null;
    setSolving(true); setRunning(false); setUiSel(null);
    const reverseMoves = [...s.history].reverse().map(m => ({ face: m.face, cw: !m.cw }));
    let idx = 0;

    const step = () => {
      if (idx >= reverseMoves.length) {
        s.solving = false; s.history = [];
        setSolving(false); setHasHist(false); syncUI();
        return;
      }
      const mv = reverseMoves[idx];
      highlightFace(mv.face); setUiSel(mv.face);

      // Nudge camera toward face
      const info = faceCentersRef.current[mv.face];
      const ty = Math.atan2(info.center.x, info.center.z);
      const tx = Math.atan2(-info.center.y, Math.sqrt(info.center.x ** 2 + info.center.z ** 2));
      s.rot.y += (ty - s.rot.y) * 0.12;
      s.rot.x += (tx - s.rot.x) * 0.12;

      rotFace(s.faces, mv.face, mv.cw);
      rebuild(s.faces); highlightFace(mv.face);
      setUiFaces(cloneF(s.faces)); setMoves(m => m + 1);
      idx++;
      const speed = idx < 10 ? 150 : idx < 30 ? 90 : 45;
      setTimeout(step, speed);
    };
    setTimeout(step, 300);
  };

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div style={{ height: "100vh", width: "100vw", display: "flex", flexDirection: "column", background: "#0c0c18", color: "#d0d0e8", overflow: "hidden", fontFamily: "'DM Mono','IBM Plex Mono',monospace" }}>

      {celebrating && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.85)", backdropFilter: "blur(10px)", animation: "fadeIn .4s" }}>
          <div style={{ textAlign: "center", animation: "popIn .5s cubic-bezier(.68,-.55,.265,1.55)" }}>
            <div style={{ fontSize: 72 }}>🏆</div>
            <h2 style={{ fontSize: 44, fontWeight: 900, margin: "8px 0 0", background: "linear-gradient(90deg,#F5D000,#EE6600,#CC1111)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>SOLVED!</h2>
            <p style={{ color: "#777", fontSize: 16, marginTop: 10 }}>{moves} moves · {fmt(time)}</p>
          </div>
        </div>
      )}

      {showGuide && (
        <div style={{ position: "fixed", inset: 0, zIndex: 150, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,.7)", backdropFilter: "blur(6px)", animation: "fadeIn .3s" }} onClick={() => setShowGuide(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 540, maxHeight: "75vh", background: "#14142a", borderRadius: "20px 20px 0 0", border: "1px solid rgba(255,255,255,0.08)", borderBottom: "none", padding: "20px 24px 30px", overflowY: "auto", animation: "slideUp .4s cubic-bezier(.16,1,.3,1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, background: "linear-gradient(90deg,#F5D000,#EE6600)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>How to Solve a Megaminx</h3>
              <button onClick={() => setShowGuide(false)} style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, color: "#888", fontSize: 16, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>✕</button>
            </div>
            <GS n="1" t="First Face — Build the Star" d="Pick a starting face (usually white). Find its 5 edge pieces and slot them into place around the center to form a star. This step is mostly intuitive." />
            <GS n="2" t="First Face — Insert Corners" d="Find corner pieces with the starting face's color. Position each above its target slot and use a simple insert trigger (bring corner down, rotate face, bring it back) to place it without disturbing solved edges." />
            <GS n="3" t="Second Layer (F2L Pairs)" d="Work downward from the first face. Pair each edge piece with its matching corner, then insert both into the correct slot. Use 3–4 move sequences. This is the longest phase but very repetitive." />
            <GS n="4" t="Continue Down Each Band" d="Repeat F2L for each successive ring of faces. Keep solved portions on top. The Megaminx has more layers than a cube, so patience is key. Stay methodical — one face at a time." />
            <GS n="5" t="Last Face — Edge Orientation (Star)" d="Orient the last face's 5 edges so their top color matches the center. Apply an edge-flip algorithm repeatedly until all 5 edges show the right color, forming a star pattern." />
            <GS n="6" t="Last Face — Edge Permutation" d="With the star done, cycle edges into the correct positions. A 3-edge swap algorithm handles this — hold the one correctly placed edge at back and repeat until all 5 match their neighbors." />
            <GS n="7" t="Last Face — Corners" d="Orient each corner in place using R' D' R D (the rest of the puzzle temporarily scrambles — that's normal, it restores). Then permute any swapped corners with a 3-corner cycle to finish." />
            <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(245,208,0,0.06)", borderRadius: 12, border: "1px solid rgba(245,208,0,0.12)" }}>
              <p style={{ fontSize: 11, color: "#aa9944", margin: 0, lineHeight: 1.7 }}>
                <strong style={{ color: "#F5D000" }}>Fun fact:</strong> The Megaminx has ~1.01 × 10⁶⁸ possible states — dwarfing the Rubik's Cube's 4.3 × 10¹⁹. World-class solvers finish in under 25 seconds!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* HUD */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", zIndex: 10, flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, background: "linear-gradient(135deg,#F5D000,#EE6600,#CC1111)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>MEGAMINX</h1>
          <p style={{ fontSize: 8, color: "#3a3a50", letterSpacing: 3, margin: 0 }}>DRAG TILES TO ROTATE · TAP TO SELECT</p>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 8, color: "#3a3a50", letterSpacing: 2 }}>TIME</div><div style={{ fontSize: 18, fontWeight: 700, color: "#F5D000", fontVariantNumeric: "tabular-nums" }}>{fmt(time)}</div></div>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 8, color: "#3a3a50", letterSpacing: 2 }}>MOVES</div><div style={{ fontSize: 18, fontWeight: 700, color: "#EE6600", fontVariantNumeric: "tabular-nums" }}>{moves}</div></div>
        </div>
      </div>

      {/* 3D Viewport */}
      <div ref={mountRef} style={{ flex: 1, cursor: solving ? "not-allowed" : "grab", touchAction: "none", position: "relative" }}>
        {solving && (
          <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 20, padding: "8px 20px", background: "rgba(245,208,0,0.12)", border: "1px solid rgba(245,208,0,0.25)", borderRadius: 10, fontSize: 12, fontWeight: 700, color: "#F5D000", letterSpacing: 1, animation: "pulse 1s infinite alternate" }}>
            SOLVING...
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 12px 6px", zIndex: 10, flexShrink: 0, flexWrap: "wrap" }}>
        <CBtn onClick={handleShuffle} bg="linear-gradient(135deg,#CC1111,#EE6600)" shadow="#cc333355" disabled={solving}>SHUFFLE</CBtn>
        <CBtn onClick={handleAutoSolve} bg="linear-gradient(135deg,#F5D000,#EE9900)" shadow="#F5D00044" disabled={solving || !hasHist}>SOLVE</CBtn>
        <CBtn onClick={handleReset} bg="rgba(255,255,255,0.06)" shadow="transparent" color="#777" border disabled={solving}>RESET</CBtn>
        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.06)", margin: "0 2px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 10, background: uiSel !== null ? "rgba(245,208,0,0.08)" : "transparent", border: `1px solid ${uiSel !== null ? "rgba(245,208,0,0.2)" : "rgba(255,255,255,0.04)"}`, transition: "all .3s" }}>
          <RBtn onClick={() => handleRotBtn(false)} disabled={uiSel === null || solving}>↺</RBtn>
          <span style={{ fontSize: 11, fontWeight: 700, minWidth: 55, textAlign: "center", color: uiSel !== null ? "#F5D000" : "#2a2a40" }}>
            {uiSel !== null ? NAMES[uiSel] : "—"}
          </span>
          <RBtn onClick={() => handleRotBtn(true)} disabled={uiSel === null || solving}>↻</RBtn>
        </div>
      </div>

      <div style={{ padding: "6px 16px 16px", zIndex: 10, flexShrink: 0, textAlign: "center" }}>
        <button onClick={() => setShowGuide(true)} style={{ background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#555", fontSize: 11, fontWeight: 600, padding: "8px 20px", cursor: "pointer", fontFamily: "inherit", letterSpacing: 1, transition: "all .2s" }}
          onMouseOver={e => { e.currentTarget.style.color = "#F5D000"; e.currentTarget.style.borderColor = "rgba(245,208,0,0.25)"; }}
          onMouseOut={e => { e.currentTarget.style.color = "#555"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
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
        ::-webkit-scrollbar { width: 5px }
        ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px }
      `}</style>
    </div>
  );
}

function CBtn({ children, onClick, bg, shadow, color, border, disabled }) {
  return <button onClick={onClick} disabled={disabled} style={{ padding: "9px 16px", background: disabled ? "rgba(255,255,255,0.03)" : bg, border: border ? "1px solid rgba(255,255,255,0.1)" : "none", borderRadius: 9, color: disabled ? "#333" : (color || "#fff"), fontFamily: "inherit", fontSize: 11, fontWeight: 700, letterSpacing: 1.2, cursor: disabled ? "default" : "pointer", transition: "all .2s", boxShadow: disabled ? "none" : `0 4px 16px ${shadow}`, opacity: disabled ? 0.5 : 1 }}>{children}</button>;
}

function RBtn({ children, onClick, disabled }) {
  return <button onClick={onClick} disabled={disabled} style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", background: disabled ? "rgba(255,255,255,0.02)" : "rgba(245,208,0,0.12)", border: `1px solid ${disabled ? "rgba(255,255,255,0.04)" : "rgba(245,208,0,0.25)"}`, borderRadius: 8, color: disabled ? "#222" : "#F5D000", fontSize: 18, fontWeight: 700, cursor: disabled ? "default" : "pointer", fontFamily: "inherit", transition: "all .2s" }}>{children}</button>;
}

function GS({ n, t, d }) {
  return <div style={{ marginBottom: 14 }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 800, color: "#EE6600", background: "rgba(238,102,0,0.12)", padding: "2px 7px", borderRadius: 6 }}>{n}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: "#ddd" }}>{t}</span>
    </div>
    <p style={{ fontSize: 11, color: "#777", lineHeight: 1.7, margin: 0, paddingLeft: 32 }}>{d}</p>
  </div>;
}
