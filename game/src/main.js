// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. EMBERLINE: Kestrel Yard — a round-based tactical FPS.
// ?shot=start|play|end|site with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createMap } from './map.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createMover } from './mover.js';
import { createWeaponView } from './weapons.js';
import { createBots } from './bots.js';
import { createRounds } from './rounds.js';
import { createHud } from './hud.js';
import { createEffects } from './effects.js';
import { fireHitscan, damageFor, applyDamage, createGrenades } from './combat.js';
import { WEAPONS, GRENADE, ROUND, ECONOMY, PLAYER, SITES } from './config.js';
import { makeRng } from './rng.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const rng = makeRng(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 34, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const map = createMap(scene);
const audio = createAudio();
const effects = createEffects(scene);
const hud = createHud(map);
const mover = createMover(map.colliders, {
  radius: PLAYER.radius,
  standHeight: PLAYER.standHeight,
  crouchHeight: PLAYER.crouchHeight,
  standEye: PLAYER.standEye,
  crouchEye: PLAYER.crouchEye,
  groundAccel: PLAYER.groundAccel,
  airAccel: PLAYER.airAccel,
  friction: PLAYER.friction,
  gravity: PLAYER.gravity,
  jumpSpeed: PLAYER.jumpSpeed,
});

const playerBody = mover.makeBody(0, 15.5, 0);
const player = {
  name: 'YOU',
  team: 'vanguard',
  body: playerBody,
  health: PLAYER.health,
  armor: 0,
  alive: true,
  isPlayer: true,
  money: ECONOMY.startMoney,
  weaponDef: WEAPONS.p9,
  grenades: 0,
  carrier: false,
  kills: 0,
  deaths: 0,
};
const weaponView = createWeaponView(camera);
weaponView.equip(WEAPONS.p9);
const input = createInput(renderer.domElement, onLockChange);
const bots = createBots(scene, map, mover, rng);
const characters = [player, ...bots.bots];

let elapsed = 0;
let started = false;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
let shake = 0;
let spectateTarget = null;

const grenades = createGrenades(map.colliders, (g) => {
  effects.explosion(g.pos);
  audio.explosion(player.body.position.distanceTo(g.pos));
  shake = Math.max(shake, 0.5);
  for (const ch of characters) {
    if (!ch.alive) continue;
    const d = ch.body.position.distanceTo(g.pos);
    if (d > GRENADE.radius) continue;
    const dmg = GRENADE.maxDamage * (1 - d / GRENADE.radius);
    const dealt = applyDamage(ch, dmg);
    if (ch.isPlayer) {
      hud.damageFlash(0.5 + dealt / 100);
      audio.hurt();
    }
    if (!ch.alive) onKill(g.thrower, ch, false);
  }
});

function eyePosition(char) {
  return new THREE.Vector3(char.body.position.x, char.body.position.y + char.body.eye, char.body.position.z);
}

function onKill(killer, victim, headshot) {
  victim.deaths += 1;
  if (killer) {
    killer.kills += 1;
    rounds.awardKill(killer);
  }
  hud.killFeed(killer || { name: 'THE CHARGE', team: rounds.state.attackerTeam }, victim, headshot);
  if (victim === player) {
    player.deaths += 1;
    input.releaseLock();
    spectateTarget = bots.bots.find((b) => b.alive && b.team === 'vanguard') || null;
    hud.setPrompt(spectateTarget ? `You are down — spectating ${spectateTarget.name}` : 'You are down');
  }
  if (victim.carrier) {
    victim.carrier = false;
    rounds.bomb.reassignCarrier();
  }
  rounds.checkElimination();
}

function resolveShot(shooter, origin, dir, def) {
  const result = fireHitscan(origin, dir, 90, map.colliders, characters, shooter);
  effects.tracer(origin, result.point, shot ? 5 : 0.07);
  if (result.hit) {
    const raw = damageFor(def, result.part, result.distance);
    const dealt = applyDamage(result.char, raw);
    if (result.char.isPlayer) {
      hud.damageFlash(0.35 + dealt / 120);
      audio.hurt();
    }
    if (shooter.isPlayer) {
      const killed = !result.char.alive;
      hud.hitMarker(killed, shot ? 60000 : 90);
      audio.hit(killed);
      if (killed) onKill(shooter, result.char, result.part === 'head');
    }
  } else if (result.wall) {
    effects.impact(result.point, null);
  }
  return result;
}

function noiseAt(pos, shooter) {
  const hear = 30;
  for (const bot of bots.bots) {
    if (!bot.alive || bot === shooter) continue;
    const d = bot.body.position.distanceTo(pos);
    if (d < hear && (!bot.target || bot.state === 'hold')) {
      bot.path = map.route(bot.body.position.x, bot.body.position.z, pos.x, pos.z);
      bot.pathIndex = 0;
    }
  }
}

function playerShoot() {
  const def = player.weaponDef;
  if (!weaponView.takeRound()) {
    audio.dryFire();
    return;
  }
  const spread = weaponView.spread(mover.groundSpeed(player.body), player.body.onGround, player.body.crouching);
  camera.getWorldDirection(tmpDir);
  tmpDir.x += (rng.next() * 2 - 1) * spread;
  tmpDir.y += (rng.next() * 2 - 1) * spread;
  tmpDir.z += (rng.next() * 2 - 1) * spread;
  tmpDir.normalize();
  const muzzle = weaponView.muzzleWorld(new THREE.Vector3());
  const origin = eyePosition(player);
  resolveShot(player, origin, tmpDir.clone(), def);
  effects.tracer(muzzle, origin.clone().addScaledVector(tmpDir, 8), shot ? 5 : 0.07);
  audio.shot(def.id, 0);
  weaponView.pullTrigger();
  mover.recoil(player.body, def.kick * (0.9 + rng.next() * 0.3), (rng.next() * 2 - 1) * def.kick * 0.4);
  noiseAt(player.body.position, player);
  hud.setAmmo(weaponView.state.mag, weaponView.state.reserve, def.name);
}

const tmpDir = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

function botShoot(bot, dir) {
  const def = bot.weaponDef;
  const origin = eyePosition(bot);
  const distToPlayer = origin.distanceTo(player.body.position);
  resolveShot(bot, origin, dir, def);
  audio.shot(def.id, distToPlayer);
  noiseAt(bot.body.position, bot);
}

function botThrow(bot, targetPos) {
  const from = eyePosition(bot);
  const dir = new THREE.Vector3(targetPos.x - from.x, targetPos.y - from.y + 2.5, targetPos.z - from.z).normalize();
  const g = grenades.throw(from, dir, rng);
  g.thrower = bot;
}

const rounds = createRounds({
  characters: () => characters,
  onRoundStart(round, attackerTeam) {
    bots.spawnAll(attackerTeam);
    player.body.position.set(attackerTeam === 'vanguard' ? 0 : 0, 0, attackerTeam === 'vanguard' ? 15.5 : -15.5);
    player.body.velocity.set(0, 0, 0);
    player.body.yaw = attackerTeam === 'vanguard' ? 0 : Math.PI;
    player.body.pitch = 0;
    player.health = PLAYER.health;
    player.armor = 0;
    player.alive = true;
    player.grenades = 0;
    player.weaponDef = WEAPONS.p9;
    weaponView.equip(WEAPONS.p9);
    player.money = Math.max(player.money, 0);
    spectateTarget = null;
    // Bots buy, pick a site, and the charge goes to the player when attacking.
    for (const bot of bots.bots) {
      bots.buyFor(bot);
      bot.site = (bots.bots.indexOf(bot) % 2 === 0) ? 'A' : 'B';
      bot.holdPos = null;
    }
    if (attackerTeam === 'vanguard') {
      rounds.state.bomb.carrier = player;
      player.carrier = true;
      for (const bot of bots.bots) bot.carrier = false;
    } else {
      const carrier = bots.bots.find((b) => b.team === 'ember' && b.alive);
      rounds.state.bomb.carrier = carrier || null;
      player.carrier = false;
      for (const bot of bots.bots) bot.carrier = bot === carrier;
    }
    hud.hideBanner();
    hud.hideBuy();
    if (!shot) hud.showBuy(rounds.buyOptions(), player.money);
    hud.setPrompt(attackerTeam === 'vanguard' ? 'You carry the charge — plant it at Site A or B' : 'Hold the sites — stop the charge');
    hud.banner(`ROUND ${round}`, attackerTeam === 'vanguard' ? 'Attack — plant the charge' : 'Defend — hold both sites', shot ? 60000 : 2600);
    audio.buy();
  },
  onLive() {
    hud.hideBuy();
    hud.setPrompt('');
  },
  onRoundEnd(winner, reason, score) {
    rounds.awardRoundEnd();
    const won = winner === 'vanguard';
    hud.banner(won ? 'VANGUARD WINS THE ROUND' : 'EMBER WINS THE ROUND', reason, shot ? 60000 : 4200);
    if (won) audio.roundWin(); else audio.roundLose();
  },
  onPlanted(siteId, char) {
    hud.banner('CHARGE PLANTED', `Site ${siteId} — ${ROUND.fuseSeconds}s to detonation`, shot ? 60000 : 3000);
    audio.plant();
  },
  onDefused(siteId, char) {
    audio.defuse();
  },
  onDetonate(pos) {
    effects.explosion(new THREE.Vector3(pos.x, 0.6, pos.z));
    audio.explosion(player.body.position.distanceTo(new THREE.Vector3(pos.x, 0, pos.z)));
    shake = 1;
    for (const ch of characters) {
      if (!ch.alive) continue;
      const d = ch.body.position.distanceTo(new THREE.Vector3(pos.x, 0, pos.z));
      if (d > 9) continue;
      applyDamage(ch, 170 * (1 - d / 9));
      if (!ch.alive) onKill(null, ch, false);
    }
  },
  onBombBeep(fuse) {
    if (fuse > 0) audio.beep(fuse < 10);
  },
  onMatchEnd(winner, score) {
    const text = winner === 'draw'
      ? `Dead even — ${score.vanguard} to ${score.ember}.`
      : `${winner === 'vanguard' ? 'VANGUARD' : 'EMBER'} takes the match ${score.vanguard}–${score.ember}.`;
    hud.showOverlay('match', text);
    input.releaseLock();
  },
  onPlayerBuy(def) {
    audio.buy();
    if (def) {
      weaponView.equip(def);
      hud.setAmmo(weaponView.state.mag, weaponView.state.reserve, def.name);
    }
  },
});

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (rounds.state.phase === 'match') {
    restartMatch();
    return;
  }
  if (!player.alive) return;
  input.requestLock();
});

function restartMatch() {
  rounds.state.round = 1;
  rounds.state.score = { vanguard: 0, ember: 0 };
  rounds.state.losses = { vanguard: 0, ember: 0 };
  rounds.state.matchWinner = null;
  player.money = ECONOMY.startMoney;
  player.kills = 0;
  player.deaths = 0;
  for (const bot of bots.bots) {
    bot.money = ECONOMY.startMoney;
    bot.kills = 0;
    bot.deaths = 0;
  }
  rounds.startRound();
  hud.hideOverlay();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (rounds.state.phase !== 'match' && player.alive) {
    hud.showOverlay(started ? 'paused' : 'start');
  }
}

function syncCamera() {
  if (!player.alive && spectateTarget) {
    const t = spectateTarget.body;
    camera.position.set(t.position.x, t.position.y + t.eye, t.position.z);
    camera.rotation.set(t.pitch, t.yaw, 0, 'YXZ');
    return;
  }
  const shakeX = shake > 0 ? (rng.next() * 2 - 1) * shake * 0.03 : 0;
  const shakeY = shake > 0 ? (rng.next() * 2 - 1) * shake * 0.03 : 0;
  camera.position.set(
    player.body.position.x + shakeX,
    player.body.position.y + player.body.eye + shakeY,
    player.body.position.z,
  );
  camera.rotation.set(player.body.pitch, player.body.yaw, 0, 'YXZ');
}

function step(dt) {
  elapsed += dt;
  shake = Math.max(0, shake - dt * 1.8);
  rounds.step(dt);
  if (rounds.state.phase === 'live' || rounds.state.phase === 'buy') {
    const keys = input.state.keys;
    const aiming = input.state.aiming && player.alive;
    weaponView.setAiming(aiming);
    const targetFov = aiming ? (player.weaponDef.scoped ? 40 : 55) : 74;
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
    if (player.alive) {
      const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const crouch = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
      let speed = player.body.crouching ? PLAYER.crouchSpeed : PLAYER.walkSpeed;
      if (aiming) speed *= PLAYER.adsSpeed;
      mover.step(player.body, dt, { forward, strafe, crouch }, speed, keys.has('Space'));
      if (keys.has('Space') && player.body.onGround) audio.step();
      const pressed = input.takePressed();
      if (pressed.has('KeyR') && weaponView.reload()) audio.reload();
      if (pressed.has('KeyB') && rounds.state.phase === 'buy') {
        if (document.getElementById('buy-menu').hidden) hud.showBuy(rounds.buyOptions(), player.money);
        else hud.hideBuy();
      }
      if (!document.getElementById('buy-menu').hidden && rounds.state.phase === 'buy') {
        for (const k of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5']) {
          if (pressed.has(k)) {
            const msg = rounds.buy(player, k.replace('Digit', ''));
            if (msg) hud.setPrompt(msg);
            hud.setMoney(player.money);
          }
        }
      }
      if (pressed.has('KeyG') && player.grenades > 0 && rounds.state.phase === 'live') {
        player.grenades -= 1;
        camera.getWorldDirection(tmpDir);
        const g = grenades.throw(eyePosition(player), tmpDir.clone(), rng);
        g.thrower = player;
        audio.shot('p9', 0);
      }
      // Plant / defuse channel while E is held.
      const holdingE = keys.has('KeyE');
      rounds.bomb.playerChannel(player, dt, holdingE);
      // Fire.
      const wantFire = input.state.firing && player.alive;
      const semi = !player.weaponDef.auto;
      if (wantFire && weaponView.ready() && (!semi || !prevFiring)) playerShoot();
      prevFiring = wantFire;
    }
    // Bots hold still during the buy phase, then play the round.
    if (rounds.state.phase === 'live') {
      const world = {
        characters,
        bomb: rounds.bomb,
        attackerTeam: rounds.state.attackerTeam,
        phase: rounds.state.phase,
        onBotShoot: botShoot,
        onBotThrow: botThrow,
      };
      for (const bot of bots.bots) bots.step(bot, world, dt, elapsed);
    }
    grenades.step(dt);
    effects.syncGrenades(grenades.list);
  }
  weaponView.step(dt);
  effects.step(dt);
  syncHud();
}

function syncHud() {
  const rs = rounds.state;
  const phaseLabel = rs.phase === 'buy' ? 'BUY PHASE' : rs.phase === 'live' ? (rs.bomb.planted ? 'CHARGE PLANTED' : 'LIVE') : rs.phase.toUpperCase();
  const time = rs.phase === 'live' && rs.bomb.planted ? rs.bomb.fuse : rs.phaseTime;
  hud.setTimer(time, rs.phase);
  hud.setRound(rs.round, rs.score, phaseLabel);
  hud.setHealth(player.health, player.armor);
  hud.setMoney(player.money);
  hud.setAmmo(weaponView.state.mag, weaponView.state.reserve, player.weaponDef.name);
  hud.setCrosshair(weaponView.spread(mover.groundSpeed(player.body), player.body.onGround, player.body.crouching));
  const aliveV = characters.filter((c) => c.alive && c.team === 'vanguard').length;
  const aliveE = characters.filter((c) => c.alive && c.team === 'ember').length;
  hud.setPips(aliveV, aliveE);
  if (rs.phase === 'live' && rs.bomb.planted) {
    hud.setBomb(`CHARGE PLANTED · SITE ${rs.bomb.site} · ${Math.ceil(rs.bomb.fuse)}s`, rs.bomb.fuse <= 10);
  } else if (rs.phase === 'live' && rs.bomb.carrier === player) {
    hud.setBomb('YOU CARRY THE CHARGE — HOLD E AT A SITE TO PLANT', false);
  } else if (rs.phase === 'live' && rs.bomb.carrier) {
    hud.setBomb(`CHARGE WITH ${rs.bomb.carrier.name}`, false);
  } else {
    hud.setBomb('', false);
  }
  if (rs.phase !== 'live') {
    hud.setPrompt('');
  } else if (player.alive) {
    if (rs.bomb.planted && player.team !== rs.attackerTeam) {
      hud.setPrompt('Defuse the charge — hold E at the site');
    } else if (!rs.bomb.planted && rs.bomb.carrier === player) {
      hud.setPrompt('Hold E at Site A or B to plant the charge');
    } else if (!document.getElementById('buy-menu').hidden) {
      hud.setPrompt('');
    }
  }
  hud.drawMinimap(player, characters, rs.bomb);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (player.alive) mover.look(player.body, look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAtPoint(point) {
  const eye = eyePosition(player);
  const dx = point.x - eye.x;
  const dy = point.y - eye.y;
  const dz = point.z - eye.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  player.body.yaw = Math.atan2(-dx, -dz);
  player.body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBanner();
  if (name === 'start') {
    // Round 1, buy phase, menu open, spawn view down the mid lane.
    player.body.position.set(0, 0, 15.5);
    player.body.yaw = 0;
    player.body.pitch = 0;
    settle(30);
    aimAtPoint(new THREE.Vector3(0, 1.6, -10));
    hud.banner('ROUND 1', 'Attack — plant the charge', 60000);
    hud.showBuy(rounds.buyOptions(), player.money);
  } else if (name === 'play') {
    // Mid-round firefight: round 2, 1–0 up, player hurt, mid lane, an Ember
    // bot in the open with a tracer already on its way.
    rounds.state.round = 2;
    rounds.state.score = { vanguard: 1, ember: 0 };
    rounds.state.phase = 'live';
    rounds.state.phaseTime = 64;
    player.money = 2400;
    player.health = 78;
    player.weaponDef = WEAPONS.ar77;
    weaponView.equip(WEAPONS.ar77);
    weaponView.state.mag = 24;
    weaponView.state.reserve = 60;
    player.body.position.set(0, 0, 9);
    const foe = bots.bots.find((b) => b.name === 'ASH');
    foe.body.position.set(1.5, 0, 1);
    foe.body.yaw = Math.PI;
    foe.alive = true;
    foe.health = 100;
    const mate = bots.bots.find((b) => b.name === 'KITE');
    mate.body.position.set(-6, 0, 11);
    mate.body.yaw = 0;
    settle(20);
    aimAtPoint(new THREE.Vector3(foe.body.position.x, 1.1, foe.body.position.z));
    playerShoot();
    settle(6);
    aimAtPoint(new THREE.Vector3(foe.body.position.x, 1.1, foe.body.position.z));
  } else if (name === 'end') {
    // Round 3 just won, banner up, score 2–1, player by Site A.
    rounds.state.round = 3;
    rounds.state.score = { vanguard: 2, ember: 1 };
    rounds.state.phase = 'ended';
    rounds.state.phaseTime = 4;
    rounds.state.winner = 'vanguard';
    player.body.position.set(0, 0, 9);
    settle(20);
    aimAtPoint(new THREE.Vector3(0, 1.6, -10));
    hud.banner('VANGUARD WINS THE ROUND', 'Ember eliminated', 60000);
    syncCamera();
  } else if (name === 'site') {
    // Charge planted at Site A, 12 seconds on the fuse, player defending the
    // site against a bot pushing in.
    rounds.state.round = 4;
    rounds.state.score = { vanguard: 2, ember: 1 };
    rounds.state.phase = 'live';
    rounds.state.phaseTime = 40;
    rounds.state.attackerTeam = 'ember';
    rounds.state.bomb.planted = true;
    rounds.state.bomb.site = 'A';
    rounds.state.bomb.fuse = 12;
    rounds.state.bomb.plantedAt = { x: -15, y: 0, z: -12 };
    rounds.state.bomb.carrier = null;
    player.body.position.set(-9.5, 0, -5.5);
    player.weaponDef = WEAPONS.ar77;
    weaponView.equip(WEAPONS.ar77);
    const foe = bots.bots.find((b) => b.name === 'FLINT');
    foe.body.position.set(-14.5, 0, -10.5);
    foe.body.yaw = 2.4;
    foe.alive = true;
    settle(20);
    aimAtPoint(new THREE.Vector3(foe.body.position.x, 1.1, foe.body.position.z));
    hud.setBomb('CHARGE PLANTED · SITE A · 12s', true);
  }
  hud.setHealth(player.health, player.armor);
  hud.setMoney(player.money);
  hud.setAmmo(weaponView.state.mag, weaponView.state.reserve, player.weaponDef.name);
  hud.setRound(rounds.state.round, rounds.state.score, rounds.state.phase === 'live' ? 'LIVE' : rounds.state.phase.toUpperCase());
  syncHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('error', (event) => {
  window.__gameError = String(event.message || event.error || 'unknown error');
});

// A small handle for automated play-testing (and the finalist review): the
// live player, the round state, the bots and every character.
window.__emberline = { player, rounds, bots, characters, grenades };

syncCamera();
rounds.startRound();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
