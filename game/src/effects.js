// Short-lived visuals: tracers, impact sparks, explosions and grenade markers.
// Everything is pooled and reused — no new objects are made in the hot loop.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MAX_TRACERS = 24;
const MAX_SPARKS = 10;
const SPARK_POINTS = 14;

export function createEffects(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const tracerMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, tracerMat.clone());
    line.visible = false;
    line.frustumCulled = false;
    group.add(line);
    tracers.push({ line, life: 0, maxLife: 0.07 });
  }
  let tracerCursor = 0;

  const sparks = [];
  const sparkMat = new THREE.PointsMaterial({
    color: new THREE.Color(PALETTE.accent), size: 0.09, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  for (let i = 0; i < MAX_SPARKS; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARK_POINTS * 3), 3));
    const points = new THREE.Points(geo, sparkMat.clone());
    points.visible = false;
    points.frustumCulled = false;
    group.add(points);
    sparks.push({ points, life: 0, vel: new Float32Array(SPARK_POINTS * 3) });
  }
  let sparkCursor = 0;

  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  boom.visible = false;
  group.add(boom);
  const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 18);
  group.add(boomLight);
  let boomLife = 0;

  const grenadeMeshes = [];
  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.enemy), roughness: 0.4, metalness: 0.4, emissive: new THREE.Color(PALETTE.enemy), emissiveIntensity: 0.6 });

  function tracer(from, to, life = 0.07) {
    const slot = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % MAX_TRACERS;
    const attr = slot.line.geometry.getAttribute('position');
    attr.setXYZ(0, from.x, from.y, from.z);
    attr.setXYZ(1, to.x, to.y, to.z);
    attr.needsUpdate = true;
    slot.line.visible = true;
    slot.life = life;
    slot.maxLife = life;
  }

  function impact(point, normal) {
    const slot = sparks[sparkCursor];
    sparkCursor = (sparkCursor + 1) % MAX_SPARKS;
    const attr = slot.points.geometry.getAttribute('position');
    for (let i = 0; i < SPARK_POINTS; i += 1) {
      attr.setXYZ(i, point.x, point.y, point.z);
      slot.vel[i * 3] = (Math.random() - 0.5) * 4 + (normal ? normal.x * 2 : 0);
      slot.vel[i * 3 + 1] = Math.random() * 3 + 1;
      slot.vel[i * 3 + 2] = (Math.random() - 0.5) * 4 + (normal ? normal.z * 2 : 0);
    }
    attr.needsUpdate = true;
    slot.points.visible = true;
    slot.life = 0.35;
  }

  function explosion(point) {
    boom.position.copy(point);
    boom.scale.setScalar(0.2);
    boom.visible = true;
    boomLife = 0.5;
    boomLight.position.copy(point);
    boomLight.position.y += 0.5;
    boomLight.intensity = 60;
  }

  function step(dt) {
    for (const slot of tracers) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      slot.line.material.opacity = Math.max(0, slot.life / slot.maxLife) * 0.9;
      if (slot.life <= 0) slot.line.visible = false;
    }
    for (const slot of sparks) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      const attr = slot.points.geometry.getAttribute('position');
      for (let i = 0; i < SPARK_POINTS; i += 1) {
        slot.vel[i * 3 + 1] -= 9 * dt;
        attr.setXYZ(i,
          attr.getX(i) + slot.vel[i * 3] * dt,
          Math.max(0.02, attr.getY(i) + slot.vel[i * 3 + 1] * dt),
          attr.getZ(i) + slot.vel[i * 3 + 2] * dt);
      }
      attr.needsUpdate = true;
      slot.points.material.opacity = Math.max(0, slot.life / 0.35);
      if (slot.life <= 0) slot.points.visible = false;
    }
    if (boomLife > 0) {
      boomLife -= dt;
      const t = 1 - Math.max(0, boomLife / 0.5);
      boom.scale.setScalar(0.2 + t * 5.5);
      boom.material.opacity = Math.max(0, 0.85 * (1 - t));
      boomLight.intensity = Math.max(0, 60 * (1 - t));
      if (boomLife <= 0) { boom.visible = false; boomLight.intensity = 0; }
    }
  }

  function syncGrenades(list) {
    while (grenadeMeshes.length < list.length) {
      const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
      group.add(mesh);
      grenadeMeshes.push(mesh);
    }
    for (let i = 0; i < grenadeMeshes.length; i += 1) {
      const mesh = grenadeMeshes[i];
      if (i < list.length) {
        mesh.visible = true;
        mesh.position.copy(list[i].pos);
      } else mesh.visible = false;
    }
  }

  return { tracer, impact, explosion, step, syncGrenades };
}
