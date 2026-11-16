// Bot brains: five Ember attackers/defenders and three Vanguard teammates.
// Each bot is a small state machine — advance, hold, engage, plant, defuse,
// rotate, retreat — routed over the map's waypoint graph, with line-of-sight
// checks, a reaction delay, burst fire with aim error, and hearing: a gunshot
// within earshot pulls nearby bots toward it.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { BOT, WEAPONS, SITES } from './config.js';
import { hasLineOfSight } from './map.js';

const ALLY_NAMES = ['KITE', 'ROOK', 'SABLE'];
const ENEMY_NAMES = ['ASH', 'CINDER', 'FLINT', 'ONYX', 'VEX'];

function botMesh(team) {
  const group = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({
    color: new THREE.Color(team === 'vanguard' ? PALETTE.team : PALETTE.enemy),
    roughness: 0.75, metalness: 0.05,
  });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.muted), roughness: 0.7 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.62, 0.24), dark);
  legs.position.y = 0.31;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.3), cloth);
  torso.position.y = 0.93;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.28, 0.3), skin);
  head.position.y = 1.52;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.32), cloth);
  band.position.y = 1.62;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), dark);
  gun.position.set(0.2, 1.05, -0.25);
  group.add(legs, torso, head, band, gun);
  group.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  group.userData.parts = { legs, torso, head, gun };
  return group;
}

export function createBots(scene, map, mover, rng) {
  const bots = [];
  const colliders = map.colliders;

  function makeBot(team, name, index, spawn) {
    const body = mover.makeBody(spawn.x, spawn.z, spawn.yaw);
    const mesh = botMesh(team);
    mesh.position.copy(body.position);
    scene.add(mesh);
    return {
      id: `${team}-${index}`,
      name,
      team,
      body,
      mesh,
      health: 100,
      armor: 0,
      alive: true,
      isPlayer: false,
      weaponDef: WEAPONS.p9,
      mag: 12,
      reserve: 48,
      cooldown: 0,
      reloadLeft: 0,
      grenades: 0,
      money: 800,
      state: 'advance',
      path: [],
      pathIndex: 0,
      target: null,
      lastSeen: null,
      lastSeenAt: -99,
      reactAt: 0,
      burstLeft: 0,
      burstPause: 0,
      thinkAt: rng.range(0, 0.15),
      holdPos: null,
      holdUntil: 0,
      site: null,
      strafeDir: 1,
      strafeAt: 0,
      walkPhase: 0,
      fall: 0,
      carrier: false,
      plantProgress: 0,
      defuseProgress: 0,
    };
  }

  function spawnAll(attackerTeam) {
    for (const bot of bots) {
      const spawns = bot.team === attackerTeam ? map.attackerSpawns : map.defenderSpawns;
      const spawn = spawns[bots.filter((b) => b.team === bot.team).indexOf(bot) % spawns.length];
      bot.body.position.set(spawn.x, 0, spawn.z);
      bot.body.velocity.set(0, 0, 0);
      bot.body.yaw = spawn.yaw;
      bot.body.pitch = 0;
      bot.health = 100;
      bot.armor = 0;
      bot.alive = true;
      bot.fall = 0;
      bot.mesh.rotation.set(0, 0, 0);
      bot.mesh.visible = true;
      bot.state = 'advance';
      bot.path = [];
      bot.pathIndex = 0;
      bot.target = null;
      bot.lastSeen = null;
      bot.carrier = false;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      bot.holdPos = null;
    }
  }

  function init() {
    for (let i = 0; i < BOT.countAllies; i += 1) {
      bots.push(makeBot('vanguard', ALLY_NAMES[i], i, map.attackerSpawns[i]));
    }
    for (let i = 0; i < BOT.countEnemies; i += 1) {
      bots.push(makeBot('ember', ENEMY_NAMES[i], i, map.defenderSpawns[i]));
    }
  }
  init();

  // Economy: bots buy what they can afford, rifles first.
  function buyFor(bot) {
    let money = bot.money;
    let def = WEAPONS.p9;
    if (money >= 3900 && rng.chance(0.25)) def = WEAPONS.longshot;
    else if (money >= 2600) def = WEAPONS.ar77;
    else if (money >= 1100) def = WEAPONS.vex9;
    money -= def.price;
    bot.weaponDef = def;
    bot.mag = def.mag;
    bot.reserve = def.reserve;
    if (money >= ARMOR_PRICE) { bot.armor = 100; money -= ARMOR_PRICE; }
    bot.grenades = money >= 300 && rng.chance(0.6) ? 1 : 0;
    if (bot.grenades) money -= 300;
    bot.money = money;
  }
  const ARMOR_PRICE = 650;

  function eyePos(char) {
    return { x: char.body.position.x, y: char.body.position.y + char.body.eye, z: char.body.position.z };
  }

  function canSee(bot, other, now) {
    const a = eyePos(bot);
    const b = eyePos(other);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > BOT.sightRange) return null;
    // Field of view: only what is in front of the bot counts.
    const fx = -Math.sin(bot.body.yaw);
    const fz = -Math.cos(bot.body.yaw);
    if ((dx * fx + dz * fz) / Math.max(0.001, dist) < BOT.fovCos && dist > 2) return null;
    if (!hasLineOfSight(a.x, a.y, a.z, b.x, b.y, b.z, colliders)) return null;
    return { dist, point: b };
  }

  function pickTarget(bot, characters, now) {
    let best = null;
    let bestDist = Infinity;
    for (const other of characters) {
      if (!other.alive || other.team === bot.team) continue;
      const seen = canSee(bot, other, now);
      if (seen && seen.dist < bestDist) { best = other; bestDist = seen.dist; }
    }
    return best;
  }

  function siteCenter(site) {
    return { x: (site.minX + site.maxX) / 2, z: (site.minZ + site.maxZ) / 2 };
  }

  function inSite(pos, site) {
    return pos.x >= site.minX && pos.x <= site.maxX && pos.z >= site.minZ && pos.z <= site.maxZ;
  }

  function think(bot, world, now) {
    const { characters, bomb, attackerTeam, phase } = world;
    const target = pickTarget(bot, characters, now);
    if (target) {
      if (bot.target !== target) {
        bot.target = target;
        bot.reactAt = now + BOT.reactionMin + rng.range(0, BOT.reactionMax - BOT.reactionMin);
        bot.burstLeft = 0;
        bot.burstPause = 0;
      }
      bot.lastSeen = { x: target.body.position.x, y: target.body.position.y, z: target.body.position.z };
      bot.lastSeenAt = now;
    } else if (bot.target && now - bot.lastSeenAt > 1.2) {
      bot.target = null;
    }

    // Objective overrides.
    if (phase === 'live') {
      if (bomb.planted && bot.team !== attackerTeam) {
        if (inSite(bot.body.position, SITES[bomb.site])) bot.state = 'defuse';
        else {
          bot.state = 'rotate';
          bot.site = bomb.site;
        }
      } else if (bot.carrier && bot.team === attackerTeam && !bomb.planted) {
        const site = SITES[bot.site];
        if (inSite(bot.body.position, site)) bot.state = 'plant';
        else bot.state = 'advance';
      } else if (bot.health < 35 && bot.target) {
        bot.state = 'retreat';
      } else if (bot.target) {
        bot.state = 'engage';
      } else if (bot.team === attackerTeam) {
        bot.state = 'advance';
      } else if (bot.holdPos && now < bot.holdUntil) {
        bot.state = 'hold';
      } else {
        bot.state = 'advance';
      }
    } else {
      bot.state = 'advance';
    }

    // Choose a destination for advance/hold/rotate/retreat.
    if (bot.state === 'advance' || bot.state === 'rotate') {
      let dest;
      if (bot.state === 'rotate') {
        dest = siteCenter(SITES[bot.site]);
      } else if (bot.team === attackerTeam) {
        dest = siteCenter(SITES[bot.site]);
      } else if (bot.holdPos) {
        dest = bot.holdPos;
      } else {
        // Defenders hold near their site or mid; pick once per round.
        const site = SITES[bot.site];
        dest = { x: siteCenter(site).x + rng.range(-4, 4), z: siteCenter(site).z + rng.range(2, 6) };
        bot.holdPos = dest;
        bot.holdUntil = now + rng.range(18, 30);
      }
      const d = Math.hypot(dest.x - bot.body.position.x, dest.z - bot.body.position.z);
      if (d < 1.2) {
        bot.path = [];
        if (bot.team !== attackerTeam) bot.state = 'hold';
      } else if (bot.path.length === 0 || bot.pathIndex >= bot.path.length) {
        bot.path = map.route(bot.body.position.x, bot.body.position.z, dest.x, dest.z);
        bot.pathIndex = 0;
      }
    } else if (bot.state === 'retreat') {
      const away = bot.lastSeen || { x: 0, z: 0 };
      const dx = bot.body.position.x - away.x;
      const dz = bot.body.position.z - away.z;
      const len = Math.hypot(dx, dz) || 1;
      const dest = { x: bot.body.position.x + (dx / len) * 8, z: bot.body.position.z + (dz / len) * 8 };
      bot.path = map.route(bot.body.position.x, bot.body.position.z, dest.x, dest.z);
      bot.pathIndex = 0;
      bot.state = 'advance';
    }
  }

  function aimAt(bot, point, error) {
    const eye = eyePos(bot);
    const dx = point.x - eye.x + (rng.next() * 2 - 1) * error;
    const dy = point.y - eye.y + (rng.next() * 2 - 1) * error;
    const dz = point.z - eye.z + (rng.next() * 2 - 1) * error;
    const len = Math.hypot(dx, dy, dz) || 1;
    bot.body.yaw = Math.atan2(-dx, -dz);
    bot.body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
    return { x: dx / len, y: dy / len, z: dz / len };
  }

  function step(bot, world, dt, now) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.mesh.rotation.x = -bot.fall * 1.45;
      bot.mesh.position.y = -bot.fall * 0.08;
      return;
    }
    bot.cooldown = Math.max(0, bot.cooldown - dt);
    if (bot.reloadLeft > 0) {
      bot.reloadLeft = Math.max(0, bot.reloadLeft - dt);
      if (bot.reloadLeft === 0) {
        const need = bot.weaponDef.mag - bot.mag;
        const take = Math.min(need, bot.reserve);
        bot.mag += take;
        bot.reserve -= take;
      }
    }

    bot.thinkAt -= dt;
    if (bot.thinkAt <= 0) {
      bot.thinkAt = 0.15;
      think(bot, world, now);
    }

    const wish = { forward: 0, strafe: 0, crouch: false };
    let speed = BOT.walkSpeed;

    if (bot.state === 'engage' && bot.target) {
      const t = bot.target.body.position;
      const dist = Math.hypot(t.x - bot.body.position.x, t.z - bot.body.position.z);
      if (now > bot.reactAt) {
        const aimPoint = { x: t.x, y: t.y + 1.1 + (bot.target.isPlayer ? 0 : 0), z: t.z };
        if (rng.chance(0.06)) aimPoint.y = t.y + 1.48; // go for the head sometimes
        const error = BOT.aimErrorBase + BOT.aimErrorPerMetre * dist + mover.groundSpeed(bot.target.body) * 0.001;
        const dir = aimAt(bot, aimPoint, error);
        if (bot.burstPause > 0) {
          bot.burstPause -= dt;
        } else if (bot.burstLeft > 0) {
          if (bot.cooldown === 0 && bot.reloadLeft === 0 && bot.mag > 0) {
            bot.cooldown = bot.weaponDef.fireGap;
            bot.mag -= 1;
            bot.burstLeft -= 1;
            world.onBotShoot(bot, dir);
            if (bot.burstLeft === 0) bot.burstPause = BOT.burstPauseMin + rng.range(0, BOT.burstPauseMax - BOT.burstPauseMin);
          }
        } else {
          bot.burstLeft = BOT.burstMin + rng.int(0, BOT.burstMax - BOT.burstMin);
        }
        if (bot.mag === 0 && bot.reloadLeft === 0 && bot.reserve > 0) bot.reloadLeft = bot.weaponDef.reloadTime;
      }
      // Strafe sideways, keep a fighting distance.
      if (now > bot.strafeAt) { bot.strafeAt = now + rng.range(0.7, 1.6); bot.strafeDir *= -1; }
      wish.strafe = bot.strafeDir * 0.7;
      wish.forward = dist > 20 ? 0.7 : dist < 7 ? -0.6 : 0;
      if (bot.health < 50) wish.crouch = true;
    } else if (bot.state === 'plant') {
      wish.crouch = false;
      world.bomb.tryPlant(bot, dt);
    } else if (bot.state === 'defuse') {
      wish.crouch = false;
      world.bomb.tryDefuse(bot, dt);
    } else if (bot.state === 'hold') {
      // Scan: slow yaw sweep while holding.
      bot.body.yaw += Math.sin(now * 0.5 + bot.body.position.x) * dt * 0.35;
      wish.crouch = rng.chance(0.3);
    } else if (bot.path.length > 0 && bot.pathIndex < bot.path.length) {
      const node = bot.path[bot.pathIndex];
      const dx = node.x - bot.body.position.x;
      const dz = node.z - bot.body.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.7) {
        bot.pathIndex += 1;
      } else {
        const want = Math.atan2(-dx, -dz);
        let diff = want - bot.body.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        bot.body.yaw += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
        wish.forward = Math.abs(diff) < 0.9 ? 1 : 0.25;
      }
    }

    // Grenade: a visible enemy at mid range, once in a while.
    if (bot.grenades > 0 && bot.target && bot.state === 'engage') {
      const t = bot.target.body.position;
      const dist = Math.hypot(t.x - bot.body.position.x, t.z - bot.body.position.z);
      if (dist > 8 && dist < 25 && rng.chance(dt * 0.05)) {
        bot.grenades -= 1;
        world.onBotThrow(bot, { x: t.x, y: t.y + 0.5, z: t.z });
      }
    }

    mover.step(bot.body, dt, wish, speed, false);

    // Mesh follows the body; legs swing with the stride.
    const moving = mover.groundSpeed(bot.body);
    bot.walkPhase += dt * moving * 2.2;
    bot.mesh.position.set(bot.body.position.x, bot.body.position.y, bot.body.position.z);
    bot.mesh.rotation.y = bot.body.yaw;
    const parts = bot.mesh.userData.parts;
    const swing = Math.min(0.5, moving * 0.09) * Math.sin(bot.walkPhase);
    parts.legs.rotation.x = swing;
    parts.gun.rotation.x = bot.body.pitch * 0.5;
    parts.torso.rotation.x = bot.body.pitch * 0.25;
  }

  return {
    bots,
    spawnAll,
    buyFor,
    step,
    resetMatch(attackerTeam) {
      for (const bot of bots) {
        bot.money = 800;
        bot.site = bot.team === attackerTeam
          ? (bots.indexOf(bot) % 2 === 0 ? 'A' : 'B')
          : (bots.indexOf(bot) % 2 === 0 ? 'A' : 'B');
        bot.holdPos = null;
        buyFor(bot);
      }
    },
  };
}
