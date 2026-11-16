// Kestrel Yard: an original solar-refinery yard at dusk. Two lanes (west pipe lane,
// east container lane) and a mid courtyard under a solar gantry, with a Reactor site
// (A, north-west) and a Silo site (B, north-east). Attackers spawn south, defenders
// north. Every box is a collider for characters and a surface a bullet stops on.
// Plain geometry only, no models and no textures.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { SITES } from './config.js';

const BOUNDS = { minX: -22, maxX: 22, minZ: -18, maxZ: 18 };

// [width, height, depth, x, y, z, material, kind?] — kind 'tall' blocks sight fully.
const BOXES = [
  // Floor and perimeter.
  [44.6, 0.4, 36.6, 0, -0.2, 0, 'surface'],
  [44.6, 4.4, 0.6, 0, 2.2, -18.3, 'surface'],
  [44.6, 4.4, 0.6, 0, 2.2, 18.3, 'surface'],
  [0.6, 4.4, 36.6, -22.3, 2.2, 0, 'surface'],
  [0.6, 4.4, 36.6, 22.3, 2.2, 0, 'surface'],
  // Solar gantry over mid: two pillars and a panel slab to walk under.
  [0.7, 3.4, 0.7, -3.2, 1.7, 0, 'hairline'],
  [0.7, 3.4, 0.7, 3.2, 1.7, 0, 'hairline'],
  [7.6, 0.35, 3.8, 0, 3.55, 0, 'accent'],
  [7.6, 0.15, 3.8, 0, 3.3, 0, 'hairline'],
  // Mid crates (crouch cover).
  [1.2, 1.1, 1.2, -4.6, 0.55, -4.2, 'hairline'],
  [1.2, 1.1, 1.2, 4.6, 0.55, -4.2, 'hairline'],
  [1.2, 1.1, 1.2, -4.6, 0.55, 4.2, 'hairline'],
  [1.2, 1.1, 1.2, 4.6, 0.55, 4.2, 'hairline'],
  [1.2, 1.1, 1.2, 0, 0.55, -8.4, 'hairline'],
  [1.2, 1.1, 1.2, 0, 0.55, 8.4, 'hairline'],
  // West pipe lane: a low pipe rack splitting the lane.
  [1.0, 1.2, 12, -14.5, 0.6, 0, 'hairline'],
  [1.4, 0.5, 12, -14.5, 1.45, 0, 'muted'],
  [1.2, 1.1, 1.2, -10.5, 0.55, 8.5, 'hairline'],
  [1.2, 1.1, 1.2, -18.5, 0.55, -5.5, 'hairline'],
  // East container lane: stacked containers.
  [2.4, 2.6, 6, 16, 1.3, -6, 'accent'],
  [2.4, 2.6, 6, 16, 1.3, 6, 'hairline'],
  [2.4, 2.6, 4, 19.5, 1.3, 0.5, 'muted'],
  [1.2, 1.1, 1.2, 10.5, 0.55, -8.5, 'hairline'],
  [1.2, 1.1, 1.2, 12, 0.55, 8.5, 'hairline'],
  // Connector walls: corners worth playing around.
  [0.8, 2.6, 6, -8, 1.3, -6.5, 'surface'],
  [0.8, 2.6, 6, 8, 1.3, 6.5, 'surface'],
  [6, 2.6, 0.8, -8, 1.3, 6.5, 'surface'],
  [6, 2.6, 0.8, 8, 1.3, -6.5, 'surface'],
  // Site A — Reactor: a low platform and the reactor block.
  [6, 0.5, 5, -15, 0.25, -12, 'surface'],
  [3, 2.4, 3, -15, 1.7, -13.5, 'accent'],
  [2, 1.2, 2, -15, 3.5, -13.5, 'hairline'],
  [1.2, 1.1, 1.2, -12, 0.55, -9.5, 'hairline'],
  // Site B — Silo: a tall silo and feed crates.
  [3.4, 5.2, 3.4, 15, 2.6, -13, 'muted'],
  [3.8, 0.4, 3.8, 15, 5.4, -13, 'accent'],
  [1.2, 1.1, 1.2, 12, 0.55, -9.5, 'hairline'],
  [1.2, 1.1, 1.2, 18, 0.55, -9.5, 'hairline'],
  // Spawn cover, both ends.
  [4, 1.1, 0.8, -8, 0.55, 13.5, 'hairline'],
  [4, 1.1, 0.8, 8, 0.55, 13.5, 'hairline'],
  [4, 1.1, 0.8, 0, 0.55, -16.8, 'hairline'],
];

// Waypoint nodes: [x, z]. Edges are built automatically between nodes whose
// straight segment stays clear of colliders (sampled), so bots route around cover.
const NODES = [
  [0, 15.5], [-4, 15.5], [4, 15.5], [-8, 14], [8, 14],
  [0, -15.5], [-4, -15.5], [4, -15.5], [-8, -14], [8, -14],
  [0, 10], [-6, 10], [6, 10], [0, 5], [-10, 5], [10, 5],
  [0, 0], [-7, 0], [7, 0], [-12, 0], [12, 0],
  [0, -5], [-6, -5], [6, -5], [0, -9], [-10, -9], [10, -9],
  [-15, -12], [-12, -12], [-18, -12], [-15, -6], [-18, -2],
  [15, -12], [12, -12], [18, -12], [15, -6], [18, -2],
  [-18, 6], [-18, 12], [18, 6], [18, 12], [-12, 12], [12, 12],
];

const ATTACKER_SPAWNS = [
  { x: 0, z: 15.5, yaw: 0 }, { x: -4, z: 15.5, yaw: 0 }, { x: 4, z: 15.5, yaw: 0 },
  { x: -8, z: 14, yaw: 0 }, { x: 8, z: 14, yaw: 0 },
];
const DEFENDER_SPAWNS = [
  { x: 0, z: -15.5, yaw: Math.PI }, { x: -4, z: -15.5, yaw: Math.PI }, { x: 4, z: -15.5, yaw: Math.PI },
  { x: -8, z: -14, yaw: Math.PI }, { x: 8, z: -14, yaw: Math.PI },
];

export function createMap(scene) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' ? 0.55 : 0.92,
      metalness: name === 'accent' ? 0.35 : 0.03,
    });
  }
  const colliders = [];
  const shootables = [];
  for (const [w, h, d, x, y, z, mat] of BOXES) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[mat]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    colliders.push(box);
    shootables.push(mesh);
  }

  // Site markers: flat glowing pads on the floor so a site reads at a glance.
  const sitePads = {};
  for (const site of Object.values(SITES)) {
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(site.maxX - site.minX, site.maxZ - site.minZ),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.10,
        depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set((site.minX + site.maxX) / 2, 0.02, (site.minZ + site.maxZ) / 2);
    group.add(pad);
    sitePads[site.id] = pad;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.3, 32),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set((site.minX + site.maxX) / 2, 0.03, (site.minZ + site.maxZ) / 2);
    group.add(ring);
  }

  // Dusk lighting: a low amber key, a cool fill, and a sky/ground gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color('#8a7a68'), new THREE.Color(PALETTE.canvas), 1.6);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffb45e'), 3.2);
  key.position.set(-12, 16, 10);
  key.target.position.set(0, 0, -3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7d8aa8'), 0.7);
  fill.position.set(10, 9, -12);
  scene.add(fill);

  // Waypoint graph: nodes plus edges where the segment is clear at body height.
  const nodes = NODES.map(([x, z]) => ({ x, z, edges: [] }));
  const probe = new THREE.Box3();
  function segmentClear(ax, az, bx, bz) {
    const steps = 12;
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      probe.min.set(x - 0.45, 0.3, z - 0.45);
      probe.max.set(x + 0.45, 1.7, z + 0.45);
      for (const c of colliders) if (probe.intersectsBox(c)) return false;
    }
    return true;
  }
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      if (dist > 13) continue;
      if (!segmentClear(a.x, a.z, b.x, b.z)) continue;
      a.edges.push(j);
      b.edges.push(i);
    }
  }

  return {
    colliders, shootables, group, nodes, sitePads,
    bounds: BOUNDS,
    attackerSpawns: ATTACKER_SPAWNS,
    defenderSpawns: DEFENDER_SPAWNS,
    nearestNode(x, z) {
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < nodes.length; i += 1) {
        const d = (nodes[i].x - x) ** 2 + (nodes[i].z - z) ** 2;
        if (d < bestDist) { bestDist = d; best = i; }
      }
      return best;
    },
    // Breadth-first route through the waypoint graph.
    route(fromX, fromZ, toX, toZ) {
      const start = this.nearestNode(fromX, fromZ);
      const goal = this.nearestNode(toX, toZ);
      if (start === goal) return [{ x: toX, z: toZ }];
      const prev = new Array(nodes.length).fill(-1);
      const queue = [start];
      prev[start] = start;
      while (queue.length) {
        const cur = queue.shift();
        if (cur === goal) break;
        for (const next of nodes[cur].edges) {
          if (prev[next] === -1) { prev[next] = cur; queue.push(next); }
        }
      }
      if (prev[goal] === -1) return [{ x: toX, z: toZ }];
      const path = [];
      let cur = goal;
      while (cur !== start) { path.unshift(nodes[cur]); cur = prev[cur]; }
      path.push({ x: toX, z: toZ });
      return path;
    },
  };
}

// Ray against a list of AABBs (slab test): returns the nearest hit distance or null.
export function rayHitBoxes(origin, dir, maxDist, boxes) {
  let best = null;
  for (const box of boxes) {
    let tMin = 0;
    let tMax = maxDist;
    let ok = true;
    for (const axis of ['x', 'y', 'z']) {
      const o = origin[axis];
      const d = dir[axis];
      const lo = box.min[axis];
      const hi = box.max[axis];
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) { ok = false; break; }
      } else {
        let t1 = (lo - o) / d;
        let t2 = (hi - o) / d;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) { ok = false; break; }
      }
    }
    if (ok && tMin < maxDist && (best === null || tMin < best)) best = tMin;
  }
  return best;
}

// Line of sight between two eye points: no wall AABB between them.
export function hasLineOfSight(ax, ay, az, bx, by, bz, colliders) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  const dir = { x: dx / len, y: dy / len, z: dz / len };
  const origin = { x: ax, y: ay, z: az };
  const hit = rayHitBoxes(origin, dir, len, colliders);
  return hit === null;
}
