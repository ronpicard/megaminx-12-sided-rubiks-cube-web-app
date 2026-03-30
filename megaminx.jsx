import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";

const COLORS = [
  "#FFFFFF","#CC1111","#007744","#F5D000","#0055BB","#EE6600",
  "#888888","#DD44AA","#77CC22","#DDBB77","#7711AA","#33AACC",
];
const NAMES = [
  "White","Red","Green","Yellow","Blue","Orange",
  "Gray","Pink","Lime","Cream","Purple","Cyan",
];

function createSolved() { return Array.from({ length: 12 }, (_, i) => Array(11).fill(COLORS[i])); }
function cloneF(f) { return f.map(r => [...r]); }

function getAdj(fi) {
  const m = {
    0:[[2,[1,10,9]],[11,[9,8,7]],[9,[3,2,1]],[10,[1,10,9]],[1,[3,2,1]]],
    1:[[0,[1,10,9]],[10,[9,8,7]],[3,[3,2,1]],[4,[1,10,9]],[2,[3,2,1]]],
    2:[[1,[1,10,9]],[4,[9,8,7]],[5,[3,2,1]],[11,[1,10,9]],[0,[3,2,1]]],
    3:[[1,[7,6,5]],[10,[7,6,5]],[8,[5,4,3]],[7,[9,8,7]],[4,[3,2,1]]],
    4:[[3,[1,10,9]],[7,[7,6,5]],[5,[5,4,3]],[2,[5,4,3]],[1,[9,8,7]]],
    5:[[2,[7,6,5]],[4,[7,6,5]],[7,[5,4,3]],[6,[9,8,7]],[11,[3,2,1]]],
    6:[[8,[1,10,9]],[9,[7,6,5]],[11,[5,4,3]],[5,[9,8,7]],[7,[3,2,1]]],
    7:[[6,[1,10,9]],[5,[7,6,5]],[4,[5,4,3]],[3,[9,8,7]],[8,[3,2,1]]],
    8:[[7,[1,10,9]],[3,[7,6,5]],[10,[5,4,3]],[9,[9,8,7]],[6,[3,2,1]]],
    9:[[0,[7,6,5]],[11,[7,6,5]],[6,[5,4,3]],[8,[9,8,7]],[10,[3,2,1]]],
    10:[[9,[1,10,9]],[8,[7,6,5]],[3,[5,4,3]],[1,[5,4,3]],[0,[9,8,7]]],
    11:[[5,[1,10,9]],[6,[7,6,5]],[9,[5,4,3]],[0,[5,4,3]],[2,[9,8,7]]],
  };
  return m[fi] || [];
}

function rotFace(faces, fi, cw) {
  const f = faces[fi], nf = [...f];
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
  const f = createSolved(), hist = [];
  for (let i = 0; i < 30; i++) {
    const fi = Math.floor(Math.random() * 12), cw = Math.random() > 0.5;
    rotFace(f, fi, cw); hist.push({ face: fi, cw });
  }
  return { faces: f, history: hist };
}

function checkSolved(f) { return f.every(face => face.every(t => t === face[0])); }

/* ── Three.js Geometry ── */
function getDodVerts() {
  const P = (1 + Math.sqrt(5)) / 2, ip = 1 / P;
  const raw = [
    [1,1,1],[1,1,-1],[1,-1,1],[1,-1,-1],[-1,1,1],[-1,1,-1],[-1,-1,1],[-1,-1,-1],
    [0,ip,P],[0,ip,-P],[0,-ip,P],[0,-ip,-P],[ip,P,0],[ip,-P,0],[-ip,P,0],[-ip,-P,0],
    [P,0,ip],[P,0,-ip],[-P,0,ip],[-P,0,-ip],
  ].map(v => new THREE.Vector3(v[0], v[1], v[2]).normalize().multiplyScalar(2.2));
  return [
    [0,8,10,2,16],[0,16,17,1,12],[0,12,14,4,8],[1,17,3,11,9],[1,9,5,14,12],[4,14,5,19,18],
    [7,15,6,18,19],[7,19,5,9,11],[7,11,3,13,15],[2,10,6,15,13],[2,13,3,17,16],[4,18,6,10,8],
  ].map(fi => fi.map(i => raw[i].clone()));
}

function computeFaceInfo() {
  return getDodVerts().map(verts => {
    const c = new THREE.Vector3(); verts.forEach(v => c.add(v)); c.divideScalar(5);
    const n = new THREE.Vector3().crossVectors(
      new THREE.Vector3().subVectors(verts[1], verts[0]),
      new THREE.Vector3().subVectors(verts[2], verts[0])
    ).normalize();
    if (n.dot(c) < 0) n.negate();
    return { center: c, normal: n };
  });
}

function shrinkPts(pts, c, a) { return pts.map(p => { const o = new THREE.Vector3().copy(p); o.lerp(c, a); return o; }); }

function fanTri(pts, off) {
  const pos = [], c = new THREE.Vector3(); pts.forEach(p => c.add(p)); c.divideScalar(pts.length);
  for (let i = 0; i < pts.length; i++) {
    const a = new THREE.Vector3().addVectors(c, off), b = new THREE.Vector3().addVectors(pts[i], off), d = new THREE.Vector3().addVectors(pts[(i + 1) % pts.length], off);
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
  const center = new THREE.Vector3(); verts.forEach(v => center.add(v)); center.divideScalar(5);
  const normal = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(verts[1], verts[0]), new THREE.Vector3().subVectors(verts[2], verts[0])).normalize();
  if (normal.dot(center) < 0) normal.negate();
  const bump = normal.clone().multiplyScalar(0.012);
  const GAP = 0.07;
  const outerV = verts.map(v => { const d = new THREE.Vector3().subVectors(v, center); return new THREE.Vector3().copy(center).add(d.multiplyScalar(0.97)); });
  const innerV = verts.map(v => { const d = new THREE.Vector3().subVectors(v, center); return new THREE.Vector3().copy(center).add(d.multiplyScalar(0.33)); });
  const outerMids = [];
  for (let i = 0; i < 5; i++) outerMids.push(new THREE.Vector3().lerpVectors(outerV[i], outerV[(i + 1) % 5], 0.5));

  const bp = [];
  for (let i = 0; i < 5; i++) bp.push(center.x, center.y, center.z, verts[i].x, verts[i].y, verts[i].z, verts[(i + 1) % 5].x, verts[(i + 1) % 5].y, verts[(i + 1) % 5].z);
  const bGeo = new THREE.BufferGeometry(); bGeo.setAttribute("position", new THREE.Float32BufferAttribute(bp, 3)); bGeo.computeVertexNormals();
  group.add(new THREE.Mesh(bGeo, new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.9, side: THREE.DoubleSide })));

  const cc = new THREE.Vector3(); innerV.forEach(v => cc.add(v)); cc.divideScalar(5);
  group.add(makeTile(shrinkPts(innerV, cc, GAP), tiles[0], fi, 0, bump));

  for (let i = 0; i < 5; i++) {
    const i2 = (i + 1) % 5, prevI = (i + 4) % 5;
    const cp = [innerV[i], outerMids[prevI], outerV[i], outerMids[i]];
    const ccc = new THREE.Vector3(); cp.forEach(p => ccc.add(p)); ccc.divideScalar(4);
    group.add(makeTile(shrinkPts(cp, ccc, GAP * 0.9), tiles[1 + i * 2], fi, 1 + i * 2, bump));
    const ep = [innerV[i], outerMids[i], innerV[i2]];
    const ecc = new THREE.Vector3(); ep.forEach(p => ecc.add(p)); ecc.divideScalar(3);
    group.add(makeTile(shrinkPts(ep, ecc, GAP * 1.1), tiles[2 + i * 2], fi, 2 + i * 2, bump));
  }
  return group;
}

/* ── 3D Arrow — FIXED: swapped CW direction ── */
function buildArrow(faceIdx, cw, faceInfo) {
  const group = new THREE.Group();
  const info = faceInfo[faceIdx];
  const center = info.center.clone();
  const normal = info.normal.clone();

  let up = new THREE.Vector3(0, 1, 0);
  if (Math.abs(normal.dot(up)) > 0.9) up = new THREE.Vector3(1, 0, 0);
  const tangent = new THREE.Vector3().crossVectors(normal, up).normalize();
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();

  const radius = 0.7;
  const liftOff = normal.clone().multiplyScalar(0.15);
  const arcPts = [];
  // FIXED: swapped arc directions
  const startA = cw ? 0.4 : -0.4;
  const endA = cw ? -2.6 : 2.6;
  const steps = 32;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = startA + (endA - startA) * t;
    const pt = center.clone().add(liftOff)
      .add(tangent.clone().multiplyScalar(Math.cos(angle) * radius))
      .add(bitangent.clone().multiplyScalar(Math.sin(angle) * radius));
    arcPts.push(pt);
  }

  const curve = new THREE.CatmullRomCurve3(arcPts);
  const tubeGeo = new THREE.TubeGeometry(curve, 40, 0.04, 8, false);
  const tubeMat = new THREE.MeshStandardMaterial({
    color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 0.6,
    roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.9,
  });
  group.add(new THREE.Mesh(tubeGeo, tubeMat));

  const coneGeo = new THREE.ConeGeometry(0.1, 0.25, 8);
  const coneMat = new THREE.MeshStandardMaterial({
    color: 0x00ff88, emissive: 0x00ff88, emissiveIntensity: 0.6,
    roughness: 0.3, transparent: true, opacity: 0.9,
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  const tip = arcPts[arcPts.length - 1];
  const prev = arcPts[arcPts.length - 3];
  const dir = new THREE.Vector3().subVectors(tip, prev).normalize();
  cone.position.copy(tip);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  group.add(cone);

  group.userData = { isArrow: true };
  return group;
}

function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

/* ── Component ── */
export default function Megaminx3D() {
  const mountRef = useRef(null);
  const cameraRef = useRef(null);
  const puzzleRef = useRef(null);
  const arrowRef = useRef(null);
  const ray = useRef(new THREE.Raycaster());
  const faceInfoRef = useRef(computeFaceInfo());

  const animRef = useRef({ active: false, pivot: null, axis: null, targetAngle: 0, startTime: 0, duration: 280, onComplete: null });

  // Camera smooth tracking for tutorial
  const camTargetRef = useRef({ x: 0.4, y: -0.3, active: false });

  const stateRef = useRef({
    faces: createSolved(), history: [], solving: false, sel: null,
    rot: { x: 0.4, y: -0.3 }, dragging: false, dragType: null,
    dragFaceIdx: null, dragStartScreen: null, prevMouse: { x: 0, y: 0 },
    tutorialMode: false, tutorialSteps: [], tutorialIdx: 0,
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
  const [tutMode, setTutMode] = useState(false);
  const [tutStep, setTutStep] = useState(0);
  const [tutTotal, setTutTotal] = useState(0);
  const [tutFeedback, setTutFeedback] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (running) timerRef.current = setInterval(() => setTime(t => t + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [running]);

  useEffect(() => {
    if (shuffled && !solving && !tutMode && checkSolved(uiFaces)) {
      setRunning(false); setCelebrating(true);
      setTimeout(() => setCelebrating(false), 5000);
    }
  }, [uiFaces, shuffled, solving, tutMode]);

  const rebuild = useCallback((fd) => {
    const g = puzzleRef.current; if (!g) return;
    const toRemove = [];
    g.children.forEach(c => { if (!c.userData?.isArrow) toRemove.push(c); });
    toRemove.forEach(c => { c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); g.remove(c); });
    getDodVerts().forEach((v, i) => g.add(buildFaceGroup(v, fd[i], i)));
  }, []);

  const syncUI = useCallback(() => {
    const s = stateRef.current;
    setUiFaces(cloneF(s.faces)); setUiSel(s.sel); setHasHist(s.history.length > 0);
  }, []);

  const highlightFace = useCallback((faceIdx, color) => {
    const g = puzzleRef.current; if (!g) return;
    const emCol = color || 0x443300;
    g.traverse(o => {
      if (o.isMesh && o.userData.tileIndex !== undefined && o.material && !o.userData?.isArrow) {
        const isSel = faceIdx !== null && o.userData.faceIndex === faceIdx;
        o.material.emissive = new THREE.Color(isSel ? emCol : 0x000000);
        o.material.emissiveIntensity = isSel ? 0.7 : 0;
      }
    });
  }, []);

  const clearArrow = useCallback(() => {
    const g = puzzleRef.current; if (!g) return;
    const arrows = [];
    g.children.forEach(c => { if (c.userData?.isArrow) arrows.push(c); });
    arrows.forEach(a => { a.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); g.remove(a); });
    arrowRef.current = null;
  }, []);

  const showArrow = useCallback((fi, cw) => {
    clearArrow();
    const g = puzzleRef.current; if (!g) return;
    const arrow = buildArrow(fi, cw, faceInfoRef.current);
    g.add(arrow);
    arrowRef.current = arrow;
  }, [clearArrow]);

  /* Smooth camera pan to face */
  const panCameraToFace = useCallback((fi) => {
    const info = faceInfoRef.current[fi];
    const ty = -Math.atan2(info.center.x, info.center.z);
    const tx = Math.atan2(info.center.y, Math.sqrt(info.center.x ** 2 + info.center.z ** 2));
    camTargetRef.current = { x: tx, y: ty, active: true };
  }, []);

  /* Animated rotation */
  const animateRotation = useCallback((fi, cw, duration, onDone) => {
    const anim = animRef.current;
    if (anim.active) return;
    const g = puzzleRef.current;
    const info = faceInfoRef.current[fi];
    const adj = getAdj(fi);
    const tilesToRotate = [];

    g.traverse(o => {
      if (!o.isMesh || o.userData.tileIndex === undefined || o.userData?.isArrow) return;
      const ofi = o.userData.faceIndex, oti = o.userData.tileIndex;
      if (ofi === fi) { tilesToRotate.push(o); return; }
      for (const [adjFi, adjTiles] of adj) {
        if (ofi === adjFi && adjTiles.includes(oti)) { tilesToRotate.push(o); break; }
      }
    });

    const pivot = new THREE.Group();
    pivot.position.copy(info.center);
    g.add(pivot);
    for (const mesh of tilesToRotate) {
      const parent = mesh.parent;
      parent.remove(mesh);
      pivot.add(mesh);
      mesh.position.sub(info.center);
    }

    const angle = cw ? -(2 * Math.PI / 5) : (2 * Math.PI / 5);
    anim.active = true; anim.pivot = pivot; anim.axis = info.normal.clone().normalize();
    anim.targetAngle = angle; anim.startTime = performance.now(); anim.duration = duration;
    anim.onComplete = () => {
      g.remove(pivot);
      while (pivot.children.length) { const c = pivot.children[0]; c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); pivot.remove(c); }
      rotFace(stateRef.current.faces, fi, cw);
      rebuild(stateRef.current.faces);
      highlightFace(stateRef.current.sel);
      syncUI(); anim.active = false;
      if (onDone) onDone();
    };
  }, [rebuild, highlightFace, syncUI]);

  const doRotation = useCallback((fi, cw, animated, duration, onDone) => {
    const s = stateRef.current;
    if (!s.tutorialMode) { s.history.push({ face: fi, cw }); }
    setMoves(m => m + 1);
    if (animated) { animateRotation(fi, cw, duration || 280, onDone); }
    else { rotFace(s.faces, fi, cw); rebuild(s.faces); highlightFace(s.sel); syncUI(); if (onDone) onDone(); }
  }, [animateRotation, rebuild, highlightFace, syncUI]);

  /* Tutorial: show current step */
  const showTutorialStep = useCallback(() => {
    const s = stateRef.current;
    if (!s.tutorialMode || s.tutorialIdx >= s.tutorialSteps.length) return;
    const step = s.tutorialSteps[s.tutorialIdx];
    highlightFace(step.face, 0x004422);
    showArrow(step.face, step.cw);
    setTutStep(s.tutorialIdx);
    // Pan camera to the target face
    panCameraToFace(step.face);
  }, [highlightFace, showArrow, panCameraToFace]);

  /* Handle rotation attempt during tutorial */
  const handleTutorialRotation = useCallback((fi, cw) => {
    const s = stateRef.current;
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
          setTutMode(false); setTutFeedback(null);
          setCelebrating(true);
          setTimeout(() => setCelebrating(false), 5000);
        } else {
          setTimeout(() => { setTutFeedback(null); showTutorialStep(); }, 300);
        }
      });
      return true;
    } else {
      setTutFeedback("wrong");
      setTimeout(() => setTutFeedback(null), 800);
      return true;
    }
  }, [animateRotation, clearArrow, showTutorialStep]);

  // Init Three.js
  useEffect(() => {
    const el = mountRef.current; if (!el) return;
    const w = el.clientWidth, h = el.clientHeight;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0c0c18);
    const camera = new THREE.PerspectiveCamera(36, w / h, 0.1, 100);
    camera.position.set(0, 0, 8); cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3;
    el.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x606080, 0.7));
    const kl = new THREE.DirectionalLight(0xfff0dd, 1.5); kl.position.set(5, 7, 6); scene.add(kl);
    const fl = new THREE.DirectionalLight(0x6688ff, 0.4); fl.position.set(-5, -3, 4); scene.add(fl);
    const rl = new THREE.PointLight(0xff8844, 0.5, 14); rl.position.set(0, -4, 4); scene.add(rl);

    const group = new THREE.Group(); puzzleRef.current = group; scene.add(group);
    rebuild(stateRef.current.faces);

    let raf;
    const animate = (now) => {
      raf = requestAnimationFrame(animate);
      const s = stateRef.current; const anim = animRef.current;
      if (!s.dragging && !s.solving && !anim.active) s.rot.y += 0.002;

      // Smooth camera tracking for tutorial
      const cam = camTargetRef.current;
      if (cam.active) {
        const dx = cam.x - s.rot.x;
        const dy = cam.y - s.rot.y;
        if (Math.abs(dx) < 0.005 && Math.abs(dy) < 0.005) {
          cam.active = false;
        } else {
          s.rot.x += dx * 0.06;
          s.rot.y += dy * 0.06;
        }
      }

      group.rotation.x = s.rot.x; group.rotation.y = s.rot.y;

      // Pulse arrow
      if (arrowRef.current) {
        const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);
        arrowRef.current.traverse(o => {
          if (o.material && o.material.emissiveIntensity !== undefined) o.material.emissiveIntensity = pulse;
        });
      }

      if (anim.active && anim.pivot) {
        const elapsed = now - anim.startTime;
        const t = Math.min(elapsed / anim.duration, 1);
        anim.pivot.quaternion.setFromAxisAngle(anim.axis, anim.targetAngle * easeInOutCubic(t));
        if (t >= 1) { const cb = anim.onComplete; anim.active = false; anim.pivot = null; if (cb) cb(); }
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(animate);

    const onR = () => { const w2 = el.clientWidth, h2 = el.clientHeight; camera.aspect = w2 / h2; camera.updateProjectionMatrix(); renderer.setSize(w2, h2); };
    window.addEventListener("resize", onR);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onR); renderer.dispose(); if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement); };
  }, [rebuild]);

  useEffect(() => { if (!animRef.current.active) { rebuild(uiFaces); highlightFace(uiSel); } }, [uiFaces, uiSel, rebuild, highlightFace]);

  // Pointer events
  useEffect(() => {
    const el = mountRef.current; if (!el) return;
    const getXY = (e) => { const cx = e.touches ? e.touches[0].clientX : e.clientX, cy = e.touches ? e.touches[0].clientY : e.clientY; return { cx, cy }; };
    const hitTest = (cx, cy) => {
      const rect = el.getBoundingClientRect();
      ray.current.setFromCamera(new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1), cameraRef.current);
      const hits = ray.current.intersectObjects(puzzleRef.current.children, true);
      for (const hit of hits) { if (hit.object.userData.faceIndex !== undefined && !hit.object.userData?.isArrow) return { faceIndex: hit.object.userData.faceIndex }; }
      return null;
    };

    const onDown = (e) => {
      e.preventDefault();
      const s = stateRef.current; if (s.solving || animRef.current.active) return;
      const p = getXY(e); s.dragStartScreen = { ...p }; s.prevMouse = { ...p }; s.dragging = true;
      camTargetRef.current.active = false; // stop auto-pan while user drags
      const hit = hitTest(p.cx, p.cy);
      if (hit) { s.dragType = "face"; s.dragFaceIdx = hit.faceIndex; } else { s.dragType = "orbit"; }
    };

    const onMove = (e) => {
      const s = stateRef.current; if (!s.dragging || s.solving || animRef.current.active) return;
      const p = getXY(e);
      if (s.dragType === "orbit") {
        s.rot.y += (p.cx - s.prevMouse.cx) * 0.008; s.rot.x += (p.cy - s.prevMouse.cy) * 0.008;
        s.rot.x = Math.max(-1.5, Math.min(1.5, s.rot.x)); s.prevMouse = { ...p }; return;
      }
      if (s.dragType === "face" && s.dragStartScreen) {
        const dx = p.cx - s.dragStartScreen.cx, dy = p.cy - s.dragStartScreen.cy;
        if (Math.sqrt(dx * dx + dy * dy) > 35) {
          const fi = s.dragFaceIdx; if (fi === null || fi === undefined) return;
          const info = faceInfoRef.current[fi];
          const faceNormal = info.normal.clone().applyEuler(new THREE.Euler(s.rot.x, s.rot.y, 0, "XYZ"));
          const faceCenter = info.center.clone().applyEuler(new THREE.Euler(s.rot.x, s.rot.y, 0, "XYZ"));
          const projected = faceCenter.clone().project(cameraRef.current);
          const rect = el.getBoundingClientRect();
          const srx = s.dragStartScreen.cx - rect.left - (projected.x + 1) / 2 * rect.width;
          const sry = s.dragStartScreen.cy - rect.top - (-projected.y + 1) / 2 * rect.height;
          const cross = srx * dy - sry * dx;
          const cw = faceNormal.z > 0 ? (cross > 0) : (cross < 0);

          if (s.tutorialMode) { handleTutorialRotation(fi, cw); }
          else { doRotation(fi, cw, true, 250); }
          s.dragType = null; s.dragging = false; s.dragFaceIdx = null; s.dragStartScreen = null;
        }
      }
    };

    const onUp = (e) => {
      const s = stateRef.current; if (s.solving || animRef.current.active) { s.dragging = false; return; }
      const end = e.changedTouches ? e.changedTouches[0] : e;
      if (s.dragType === "face" && s.dragStartScreen) {
        const dx = Math.abs(end.clientX - s.dragStartScreen.cx), dy = Math.abs(end.clientY - s.dragStartScreen.cy);
        if (dx < 10 && dy < 10 && !s.tutorialMode) {
          const fi = s.dragFaceIdx;
          if (fi !== null && fi !== undefined) { s.sel = s.sel === fi ? null : fi; highlightFace(s.sel); setUiSel(s.sel); }
        }
      }
      s.dragging = false; s.dragType = null; s.dragFaceIdx = null; s.dragStartScreen = null;
    };

    el.addEventListener("mousedown", onDown); el.addEventListener("mousemove", onMove); el.addEventListener("mouseup", onUp);
    el.addEventListener("mouseleave", () => { stateRef.current.dragging = false; stateRef.current.dragType = null; });
    el.addEventListener("touchstart", onDown, { passive: false }); el.addEventListener("touchmove", onMove, { passive: false }); el.addEventListener("touchend", onUp);
    return () => {
      el.removeEventListener("mousedown", onDown); el.removeEventListener("mousemove", onMove); el.removeEventListener("mouseup", onUp);
      el.removeEventListener("touchstart", onDown); el.removeEventListener("touchmove", onMove); el.removeEventListener("touchend", onUp);
    };
  }, [rebuild, highlightFace, syncUI, doRotation, handleTutorialRotation]);

  /* Actions */
  const handleShuffle = () => {
    if (animRef.current.active) return;
    const { faces: f, history: h } = doShuffle();
    const s = stateRef.current;
    s.faces = f; s.history = h; s.sel = null; s.solving = false; s.tutorialMode = false; s.tutorialSteps = []; s.tutorialIdx = 0;
    clearArrow(); rebuild(f); highlightFace(null); camTargetRef.current.active = false;
    setUiFaces(cloneF(f)); setUiSel(null); setMoves(0); setShuffled(true);
    setCelebrating(false); setTime(0); setRunning(true); setSolving(false); setHasHist(true);
    setTutMode(false); setTutFeedback(null);
  };

  const handleReset = () => {
    if (animRef.current.active) return;
    const f = createSolved(); const s = stateRef.current;
    s.faces = f; s.history = []; s.sel = null; s.solving = false; s.tutorialMode = false; s.tutorialSteps = []; s.tutorialIdx = 0;
    clearArrow(); rebuild(f); highlightFace(null); camTargetRef.current.active = false;
    setUiFaces(cloneF(f)); setUiSel(null); setMoves(0); setShuffled(false);
    setCelebrating(false); setTime(0); setRunning(false); setSolving(false); setHasHist(false);
    setTutMode(false); setTutFeedback(null);
  };

  const handleRotBtn = (cw) => {
    const s = stateRef.current;
    if (s.solving || animRef.current.active) return;
    if (s.tutorialMode) { if (s.sel !== null) handleTutorialRotation(s.sel, cw); return; }
    if (s.sel === null) return;
    doRotation(s.sel, cw, true, 280);
  };

  const handleAutoSolve = () => {
    const s = stateRef.current;
    if (s.solving || s.history.length === 0 || animRef.current.active || s.tutorialMode) return;
    s.solving = true; s.sel = null; clearArrow();
    setSolving(true); setRunning(false); setUiSel(null);
    const reverseMoves = [...s.history].reverse().map(m => ({ face: m.face, cw: !m.cw }));
    s.history = []; let idx = 0;
    const step = () => {
      if (idx >= reverseMoves.length) {
        s.solving = false; setSolving(false); setHasHist(false); syncUI(); highlightFace(null); setUiSel(null); return;
      }
      const mv = reverseMoves[idx];
      highlightFace(mv.face); setUiSel(mv.face);
      panCameraToFace(mv.face);
      setMoves(m => m + 1);
      const speed = idx < 8 ? 320 : idx < 25 ? 200 : 120;
      animateRotation(mv.face, mv.cw, speed, () => { idx++; step(); });
    };
    setTimeout(step, 300);
  };

  const handleLearnToSolve = () => {
    const s = stateRef.current;
    if (s.solving || s.history.length === 0 || animRef.current.active) return;
    const steps = [...s.history].reverse().map(m => ({ face: m.face, cw: !m.cw }));
    s.tutorialMode = true; s.tutorialSteps = steps; s.tutorialIdx = 0; s.sel = null; s.history = [];
    setTutMode(true); setTutStep(0); setTutTotal(steps.length); setRunning(false); setTutFeedback(null); setHasHist(false);
    setTimeout(() => showTutorialStep(), 200);
  };

  const handleExitTutorial = () => {
    const s = stateRef.current;
    s.tutorialMode = false; s.tutorialSteps = []; s.tutorialIdx = 0;
    clearArrow(); highlightFace(null); camTargetRef.current.active = false;
    setTutMode(false); setTutFeedback(null); setUiSel(null);
  };

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const curTutMove = tutMode && stateRef.current.tutorialSteps[tutStep];

  return (
    <div style={{ height: "100vh", width: "100vw", display: "flex", flexDirection: "column", background: "#0c0c18", color: "#d0d0e8", overflow: "hidden", fontFamily: "'DM Mono','IBM Plex Mono',monospace" }}>

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

      {showGuide && (
        <div style={{ position: "fixed", inset: 0, zIndex: 150, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,.7)", backdropFilter: "blur(6px)", animation: "fadeIn .3s" }} onClick={() => setShowGuide(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 540, maxHeight: "75vh", background: "#14142a", borderRadius: "20px 20px 0 0", border: "1px solid rgba(255,255,255,0.12)", borderBottom: "none", padding: "20px 24px 30px", overflowY: "auto", animation: "slideUp .4s cubic-bezier(.16,1,.3,1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, background: "linear-gradient(90deg,#F5D000,#EE6600)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>How to Solve a Megaminx</h3>
              <button onClick={() => setShowGuide(false)} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, color: "#bbb", fontSize: 16, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>✕</button>
            </div>
            <GS n="1" t="First Face — Build the Star" d="Pick a starting face (usually white). Find its 5 edge pieces and slot them into place around the center to form a star. This step is mostly intuitive." />
            <GS n="2" t="First Face — Insert Corners" d="Find corner pieces with the starting face's color. Position each above its slot and use a simple insert trigger to place it without disturbing solved edges." />
            <GS n="3" t="Second Layer (F2L Pairs)" d="Work downward. Pair each edge piece with its matching corner, then insert both into the correct slot. Use 3–4 move sequences." />
            <GS n="4" t="Continue Down Each Band" d="Repeat F2L for each successive ring. Keep solved portions on top. Stay methodical — one face at a time." />
            <GS n="5" t="Last Face — Edge Orientation" d="Orient the last face's 5 edges so their top color matches the center, forming a star pattern." />
            <GS n="6" t="Last Face — Edge Permutation" d="Cycle edges into correct positions using a 3-edge swap algorithm." />
            <GS n="7" t="Last Face — Corners" d="Orient each corner with R' D' R D, then permute with a 3-corner cycle to finish." />
            <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(245,208,0,0.08)", borderRadius: 12, border: "1px solid rgba(245,208,0,0.2)" }}>
              <p style={{ fontSize: 12, color: "#ccaa44", margin: 0, lineHeight: 1.7 }}>
                <strong style={{ color: "#F5D000" }}>Fun fact:</strong> The Megaminx has ~1.01 × 10⁶⁸ possible states. World record is under 25 seconds!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* HUD */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", zIndex: 10, flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, background: "linear-gradient(135deg,#F5D000,#EE6600,#CC1111)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>MEGAMINX</h1>
          <p style={{ fontSize: 10, color: "#8888a0", letterSpacing: 3, margin: 0 }}>DRAG TILES TO ROTATE · TAP TO SELECT</p>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: "#8888a0", letterSpacing: 2 }}>TIME</div><div style={{ fontSize: 18, fontWeight: 700, color: "#F5D000", fontVariantNumeric: "tabular-nums" }}>{fmt(time)}</div></div>
          <div style={{ textAlign: "center" }}><div style={{ fontSize: 10, color: "#8888a0", letterSpacing: 2 }}>MOVES</div><div style={{ fontSize: 18, fontWeight: 700, color: "#EE6600", fontVariantNumeric: "tabular-nums" }}>{moves}</div></div>
        </div>
      </div>

      {/* Tutorial Banner */}
      {tutMode && (() => {
        const PHASES = [
          { name: "Build the Star", desc: "Place the 5 edge pieces around the first face center" },
          { name: "Insert Corners", desc: "Fill in the 5 corners of the first face" },
          { name: "Second Layer (F2L)", desc: "Pair edges with corners and insert into the second ring" },
          { name: "Continue Down", desc: "Repeat F2L for each successive ring of faces" },
          { name: "Last Face Edges — Orient", desc: "Flip edges so their top color matches the center" },
          { name: "Last Face Edges — Permute", desc: "Cycle edges into correct positions" },
          { name: "Last Face Corners", desc: "Orient and permute the final corners" },
        ];
        const progress = tutTotal > 0 ? tutStep / tutTotal : 0;
        const phaseIdx = Math.min(Math.floor(progress * 7), 6);
        const phase = PHASES[phaseIdx];
        return (
        <div style={{
          padding: "12px 16px", zIndex: 20, flexShrink: 0,
          background: tutFeedback === "correct" ? "rgba(0,255,100,0.12)" : tutFeedback === "wrong" ? "rgba(255,50,50,0.12)" : "rgba(0,255,136,0.07)",
          borderBottom: `1px solid ${tutFeedback === "correct" ? "rgba(0,255,100,0.35)" : tutFeedback === "wrong" ? "rgba(255,50,50,0.35)" : "rgba(0,255,136,0.2)"}`,
          transition: "all .3s",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Phase label */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "#F5D000", background: "rgba(245,208,0,0.15)", padding: "2px 7px", borderRadius: 5, flexShrink: 0 }}>PHASE {phaseIdx + 1}/7</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#ddddee" }}>{phase.name}</span>
              </div>
              {/* Phase description */}
              <div style={{ fontSize: 11, color: "#88aa99", marginBottom: 6 }}>{phase.desc}</div>
              {/* Move instruction */}
              <div style={{ fontSize: 11, color: "#66cc88", letterSpacing: 2, fontWeight: 700, marginBottom: 3 }}>
                MOVE {tutStep + 1} OF {tutTotal}
              </div>
              <div style={{ fontSize: 14, color: "#eee", fontWeight: 600 }}>
                {curTutMove ? (
                  <>Rotate the <span style={{ color: COLORS[curTutMove.face], fontWeight: 800, textShadow: COLORS[curTutMove.face] === "#FFFFFF" ? "0 0 6px rgba(200,200,255,0.7)" : "none" }}>{NAMES[curTutMove.face]}</span> face {curTutMove.cw ? "clockwise ↻" : "counter-clockwise ↺"}</>
                ) : "Complete!"}
              </div>
              {tutFeedback === "wrong" && <div style={{ fontSize: 12, color: "#ff7766", marginTop: 4, fontWeight: 600 }}>Wrong face or direction — try again!</div>}
              {tutFeedback === "correct" && <div style={{ fontSize: 12, color: "#55ff99", marginTop: 4, fontWeight: 600 }}>Correct!</div>}
            </div>
            <button onClick={handleExitTutorial} style={{ padding: "7px 16px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "#bbb", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", letterSpacing: 1, flexShrink: 0, alignSelf: "flex-start" }}>EXIT</button>
          </div>
          {/* Phase progress (7 segments) */}
          <div style={{ display: "flex", gap: 3, marginTop: 10 }}>
            {PHASES.map((_, pi) => (
              <div key={pi} style={{ flex: 1, height: 4, borderRadius: 2, background: pi < phaseIdx ? "rgba(0,255,136,0.5)" : pi === phaseIdx ? "rgba(0,255,136,0.25)" : "rgba(255,255,255,0.06)", overflow: "hidden", position: "relative" }}>
                {pi === phaseIdx && (
                  <div style={{
                    position: "absolute", left: 0, top: 0, height: "100%",
                    width: `${((tutStep / tutTotal - phaseIdx / 7) / (1 / 7)) * 100}%`,
                    background: "linear-gradient(90deg, #00ff88, #44ddaa)", borderRadius: 2,
                    transition: "width .3s",
                  }} />
                )}
              </div>
            ))}
          </div>
        </div>
        );
      })()}

      {/* 3D Viewport */}
      <div ref={mountRef} style={{ flex: 1, cursor: solving ? "not-allowed" : "grab", touchAction: "none", position: "relative" }}>
        {solving && (
          <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 20, padding: "8px 20px", background: "rgba(245,208,0,0.15)", border: "1px solid rgba(245,208,0,0.35)", borderRadius: 10, fontSize: 13, fontWeight: 700, color: "#F5D000", letterSpacing: 1, animation: "pulse 1s infinite alternate" }}>SOLVING...</div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 12px 6px", zIndex: 10, flexShrink: 0, flexWrap: "wrap" }}>
        <CBtn onClick={handleShuffle} bg="linear-gradient(135deg,#CC1111,#EE6600)" shadow="#cc333355" disabled={solving || tutMode}>SHUFFLE</CBtn>
        <CBtn onClick={handleAutoSolve} bg="linear-gradient(135deg,#F5D000,#EE9900)" shadow="#F5D00044" disabled={solving || !hasHist || tutMode} faded={!hasHist || solving || tutMode}>SOLVE</CBtn>
        <CBtn onClick={handleLearnToSolve} bg="linear-gradient(135deg,#00cc66,#009955)" shadow="#00cc6644" disabled={solving || !hasHist || tutMode} faded={!hasHist || solving || tutMode}>LEARN</CBtn>
        <CBtn onClick={handleReset} bg="rgba(255,255,255,0.1)" shadow="transparent" color="#bbb" border disabled={solving || tutMode}>RESET</CBtn>
        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.15)", margin: "0 2px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 10, background: uiSel !== null ? "rgba(245,208,0,0.1)" : "transparent", border: `1px solid ${uiSel !== null ? "rgba(245,208,0,0.3)" : "rgba(255,255,255,0.08)"}`, transition: "all .3s" }}>
          <RBtn onClick={() => handleRotBtn(false)} disabled={uiSel === null || solving}>↺</RBtn>
          <span style={{ fontSize: 12, fontWeight: 700, minWidth: 55, textAlign: "center", color: uiSel !== null ? "#F5D000" : "#6a6a80" }}>{uiSel !== null ? NAMES[uiSel] : "—"}</span>
          <RBtn onClick={() => handleRotBtn(true)} disabled={uiSel === null || solving}>↻</RBtn>
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
        ::-webkit-scrollbar { width: 5px }
        ::-webkit-scrollbar-track { background: transparent }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 3px }
      `}</style>
    </div>
  );
}

function CBtn({ children, onClick, bg, shadow, color, border, disabled, faded }) {
  const isFaded = faded && disabled;
  return <button onClick={onClick} disabled={disabled} style={{
    padding: "9px 16px",
    background: isFaded ? "rgba(255,255,255,0.06)" : disabled ? "rgba(255,255,255,0.06)" : bg,
    border: border ? "1px solid rgba(255,255,255,0.15)" : isFaded ? "1px solid rgba(255,255,255,0.1)" : disabled ? "1px solid rgba(255,255,255,0.06)" : "none",
    borderRadius: 9, color: isFaded ? "#666" : disabled ? "#777" : (color || "#fff"),
    fontFamily: "inherit", fontSize: 12, fontWeight: 700, letterSpacing: 1.2,
    cursor: disabled ? "default" : "pointer", transition: "all .3s",
    boxShadow: disabled ? "none" : `0 4px 16px ${shadow}`,
    opacity: isFaded ? 0.55 : disabled ? 0.6 : 1,
  }}>{children}</button>;
}

function RBtn({ children, onClick, disabled }) {
  return <button onClick={onClick} disabled={disabled} style={{
    width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
    background: disabled ? "rgba(255,255,255,0.04)" : "rgba(245,208,0,0.15)",
    border: `1px solid ${disabled ? "rgba(255,255,255,0.08)" : "rgba(245,208,0,0.35)"}`,
    borderRadius: 8, color: disabled ? "#555" : "#F5D000", fontSize: 18, fontWeight: 700,
    cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
  }}>{children}</button>;
}

function GS({ n, t, d }) {
  return <div style={{ marginBottom: 14 }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: "#EE6600", background: "rgba(238,102,0,0.18)", padding: "2px 7px", borderRadius: 6 }}>{n}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: "#eee" }}>{t}</span>
    </div>
    <p style={{ fontSize: 12, color: "#aaa", lineHeight: 1.7, margin: 0, paddingLeft: 32 }}>{d}</p>
  </div>;
}
