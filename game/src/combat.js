// Hitscan combat: one ray from a muzzle, stopped by the nearest wall, tested
// against every living character's head sphere and body spheres. Headshots pay
// triple; damage falls off with range; armour absorbs half of what is left.
// Grenades fly as small ballistic bodies and burst after their fuse.
import * as THREE from 'three';
import { rayHitBoxes } from './map.js';
import { GRENADE } from './config.js';

const HEAD_R = 0.16;
const CHEST_R = 0.3;
const PELVIS_R = 0.27;

function raySphere(origin, dir, center, radius) {
  const ox = center.x - origin.x;
  const oy = center.y - origin.y;
  const oz = center.z - origin.z;
  const tca = ox * dir.x + oy * dir.y + oz * dir.z;
  if (tca < 0) return null;
  const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
  const r2 = radius * radius;
  if (d2 > r2) return null;
  return tca - Math.sqrt(r2 - d2);
}

// characters: [{ body, alive, health, armor, team, isPlayer, name }]
// Returns { hit, char, part, point, distance } — hit is null when the ray misses
// every character (point is then the wall hit or the ray's end).
export function fireHitscan(origin, dir, maxDist, colliders, characters, ignore) {
  const wallDist = rayHitBoxes(origin, dir, maxDist, colliders);
  const limit = wallDist === null ? maxDist : wallDist;
  let best = null;
  const tmp = new THREE.Vector3();
  for (const char of characters) {
    if (!char.alive || char === ignore) continue;
    const pos = char.body.position;
    const eyeY = pos.y + char.body.eye;
    const tests = [
      { part: 'head', center: tmp.set(pos.x, eyeY - 0.12, pos.z), r: HEAD_R },
      { part: 'torso', center: tmp.set(pos.x, pos.y + 1.05, pos.z), r: CHEST_R },
      { part: 'legs', center: tmp.set(pos.x, pos.y + 0.5, pos.z), r: PELVIS_R },
    ];
    for (const test of tests) {
      const t = raySphere(origin, dir, test.center, test.r);
      if (t !== null && t < limit && (best === null || t < best.distance)) {
        best = { hit: true, char, part: test.part, distance: t };
      }
    }
  }
  const endDist = best ? best.distance : limit;
  const point = new THREE.Vector3(
    origin.x + dir.x * endDist,
    origin.y + dir.y * endDist,
    origin.z + dir.z * endDist,
  );
  if (best) {
    best.point = point;
    return best;
  }
  return { hit: false, char: null, part: null, point, distance: endDist, wall: wallDist !== null };
}

export function damageFor(def, part, distance) {
  let dmg = def.damage;
  if (part === 'head') dmg *= def.headMult;
  else if (part === 'legs') dmg *= def.legMult;
  if (distance > def.falloffStart) {
    const t = Math.min(1, (distance - def.falloffStart) / Math.max(1, def.falloffEnd - def.falloffStart));
    dmg *= 1 - (1 - def.falloffMin) * t;
  }
  return dmg;
}

// Apply damage to a character, armour first. Returns the health damage dealt.
export function applyDamage(char, raw) {
  let left = raw;
  if (char.armor > 0) {
    const absorbed = Math.min(char.armor, left * 0.5);
    char.armor -= absorbed;
    left -= absorbed;
  }
  char.health -= left;
  if (char.health <= 0) {
    char.health = 0;
    char.alive = false;
  }
  return left;
}

// A thrown grenade: a small ballistic body with a fuse, bounced off colliders.
export function createGrenades(colliders, onExplode) {
  const list = [];
  const probe = new THREE.Box3();
  return {
    list,
    throw(from, dir, rng) {
      const g = {
        pos: from.clone(),
        vel: dir.clone().multiplyScalar(GRENADE.throwSpeed),
        fuse: GRENADE.fuse,
        alive: true,
        spin: rng ? rng.range(0, 6) : 0,
      };
      g.vel.y += 3.2;
      list.push(g);
      return g;
    },
    step(dt) {
      for (const g of list) {
        if (!g.alive) continue;
        g.fuse -= dt;
        g.vel.y -= 14 * dt;
        const next = g.pos.clone().addScaledVector(g.vel, dt);
        probe.min.set(next.x - 0.09, next.y - 0.09, next.z - 0.09);
        probe.max.set(next.x + 0.09, next.y + 0.09, next.z + 0.09);
        let blocked = false;
        for (const c of colliders) {
          if (probe.intersectsBox(c)) { blocked = true; break; }
        }
        if (blocked) {
          g.vel.multiplyScalar(-0.35);
          g.vel.y = Math.abs(g.vel.y) * 0.4 + 1.5;
          g.pos.y = Math.max(0.1, g.pos.y);
        } else {
          g.pos.copy(next);
        }
        if (g.pos.y < 0.09) {
          g.pos.y = 0.09;
          g.vel.y = Math.abs(g.vel.y) * 0.4;
          g.vel.x *= 0.7;
          g.vel.z *= 0.7;
        }
        if (g.fuse <= 0) {
          g.alive = false;
          onExplode(g.pos.clone());
        }
      }
      for (let i = list.length - 1; i >= 0; i -= 1) if (!list[i].alive) list.splice(i, 1);
    },
  };
}
