// One weapon in hand: its view model, magazine, reload, bloom and kick. It owns
// the numbers from config.js; combat.js owns the ray and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export function createWeaponView(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.3 });

  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.42), grip);
  barrel.position.set(0, 0.025, -0.39);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
  stock.position.set(0, -0.02, 0.18);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.08), accent);
  sight.position.set(0, 0.075, -0.1);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.1), grip);
  mag.position.set(0, -0.12, -0.06);
  model.add(receiver, barrel, stock, sight, mag);
  model.position.set(0.26, -0.28, -0.75);
  model.scale.setScalar(0.6);
  camera.add(model);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.26, -0.26, -1.15);
  flash.visible = false;
  camera.add(flash);

  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.26, -0.24, -0.8);
  camera.add(flashLight);

  const state = {
    def: null, mag: 0, reserve: 0, cooldown: 0, reloadLeft: 0,
    reloadTime: 0, flash: 0, kick: 0, bloom: 0, aiming: false,
  };

  function equip(def) {
    state.def = def;
    state.mag = def.mag;
    state.reserve = def.reserve;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.reloadTime = def.reloadTime;
    state.flash = 0;
    state.kick = 0;
    state.bloom = 0;
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    state.bloom = Math.max(0, state.bloom - dt * 0.05);
    const aimBlend = state.aiming ? 1 : 0;
    model.position.x = 0.26 - aimBlend * 0.26;
    model.position.y = -0.28 + aimBlend * 0.045;
    model.position.z = -0.75 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (state.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = state.def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    equip,
    step,
    ready() {
      return state.def !== null && state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    pullTrigger() {
      state.cooldown = state.def.fireGap;
      state.flash = 0.06;
      state.kick = 0.055;
      state.bloom = Math.min(0.05, state.bloom + state.def.spreadBloom);
    },
    reload() {
      if (!state.def || state.reloadLeft > 0 || state.mag === state.def.mag || state.reserve === 0) return false;
      state.reloadLeft = state.reloadTime;
      return true;
    },
    spread(speed, onGround, crouching) {
      const def = state.def;
      if (!def) return 0.02;
      let s = def.spreadStill;
      s += Math.min(1, speed / 5.4) * def.spreadMove;
      if (!onGround) s += def.spreadAir;
      if (crouching) s *= 0.7;
      if (state.aiming) s *= def.scoped ? 0.25 : 0.55;
      return s + state.bloom;
    },
    setAiming(on) { state.aiming = on; },
    muzzleWorld(out) {
      out.set(0.26, -0.26, -1.15);
      return camera.localToWorld(out);
    },
  };
}
