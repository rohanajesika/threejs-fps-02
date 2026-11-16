// The match: buy phase, live round, banner, next round. Rounds are won by
// elimination, by the charge detonating, by a defuse, or by the clock (the
// defenders win a timeout when nothing is planted). Money follows the
// Counter-Strike shape: kills pay, wins pay more than losses, and a losing
// streak grows the loss bonus. The player's team attacks on odd rounds and
// defends on even ones.
import { ROUND, ECONOMY, SITES, WEAPONS, GRENADE, ARMOR } from './config.js';

export function createRounds(hooks) {
  const state = {
    round: 1,
    phase: 'buy', // buy | live | ended | match
    phaseTime: ROUND.buySeconds,
    score: { vanguard: 0, ember: 0 },
    attackerTeam: 'vanguard',
    losses: { vanguard: 0, ember: 0 },
    winner: null,
    winReason: '',
    matchWinner: null,
    bomb: {
      planted: false,
      site: null,
      fuse: 0,
      plantProgress: 0,
      defuseProgress: 0,
      carrier: null, // character holding the charge
      plantedAt: null,
      beepAt: 0,
    },
  };

  function other(team) {
    return team === 'vanguard' ? 'ember' : 'vanguard';
  }

  function startRound() {
    state.phase = 'buy';
    state.phaseTime = ROUND.buySeconds;
    state.attackerTeam = state.round % 2 === 1 ? 'vanguard' : 'ember';
    state.bomb.planted = false;
    state.bomb.site = null;
    state.bomb.fuse = 0;
    state.bomb.plantProgress = 0;
    state.bomb.defuseProgress = 0;
    state.bomb.plantedAt = null;
    state.winner = null;
    state.winReason = '';
    hooks.onRoundStart(state.round, state.attackerTeam);
  }

  function endRound(winner, reason) {
    if (state.phase === 'ended' || state.phase === 'match') return;
    state.phase = 'ended';
    state.phaseTime = ROUND.endBannerSeconds;
    state.winner = winner;
    state.winReason = reason;
    state.score[winner] += 1;
    const loser = other(winner);
    state.losses[winner] = 0;
    state.losses[loser] += 1;
    hooks.onRoundEnd(winner, reason, { ...state.score });
    if (state.score[winner] >= ROUND.winTo || state.round >= ROUND.maxRounds) {
      state.matchWinner = state.score.vanguard === state.score.ember
        ? 'draw'
        : (state.score.vanguard > state.score.ember ? 'vanguard' : 'ember');
    }
  }

  function nextRound() {
    if (state.matchWinner) {
      state.phase = 'match';
      state.phaseTime = Infinity;
      hooks.onMatchEnd(state.matchWinner, { ...state.score });
      return;
    }
    state.round += 1;
    startRound();
  }

  // Money: called by the game when a kill, a plant or a round ends.
  function awardKill(killer) {
    if (!killer) return;
    killer.money = (killer.money ?? 0) + ECONOMY.killReward;
  }

  function awardPlant(carrier) {
    if (!carrier) return;
    carrier.money = (carrier.money ?? 0) + ECONOMY.plantReward;
  }

  function awardRoundEnd() {
    for (const char of hooks.characters()) {
      if (char.team === state.winner) char.money = (char.money ?? 0) + ECONOMY.roundWin;
      else {
        const streak = Math.min(5, state.losses[char.team]);
        char.money = (char.money ?? 0) + ECONOMY.roundLoss + (streak - 1) * ECONOMY.lossBonusStep;
      }
    }
  }

  function inSite(pos, site) {
    return pos.x >= site.minX && pos.x <= site.maxX && pos.z >= site.minZ && pos.z <= site.maxZ;
  }

  const bomb = {
    get planted() { return state.bomb.planted; },
    get site() { return state.bomb.site; },
    get fuse() { return state.bomb.fuse; },
    get plantProgress() { return state.bomb.plantProgress; },
    get defuseProgress() { return state.bomb.defuseProgress; },
    get carrier() { return state.bomb.carrier; },
    plantSiteAt(pos) {
      for (const site of Object.values(SITES)) if (inSite(pos, site)) return site.id;
      return null;
    },
    tryPlant(char, dt) {
      if (state.phase !== 'live' || state.bomb.planted) return;
      if (state.bomb.carrier !== char) return;
      const siteId = this.plantSiteAt(char.body.position);
      if (!siteId) { state.bomb.plantProgress = 0; return; }
      state.bomb.plantProgress += dt / ROUND.plantSeconds;
      if (state.bomb.plantProgress >= 1) {
        state.bomb.planted = true;
        state.bomb.site = siteId;
        state.bomb.fuse = ROUND.fuseSeconds;
        state.bomb.plantProgress = 0;
        state.bomb.plantedAt = { x: char.body.position.x, y: 0, z: char.body.position.z };
        awardPlant(char);
        hooks.onPlanted(siteId, char);
      }
    },
    tryDefuse(char, dt) {
      if (state.phase !== 'live' || !state.bomb.planted) return;
      if (char.team === state.attackerTeam) return;
      if (!inSite(char.body.position, SITES[state.bomb.site])) { state.bomb.defuseProgress = 0; return; }
      state.bomb.defuseProgress += dt / ROUND.defuseSeconds;
      if (state.bomb.defuseProgress >= 1) {
        state.bomb.defuseProgress = 0;
        endRound(other(state.attackerTeam), `Charge defused at Site ${state.bomb.site}`);
        hooks.onDefused(state.bomb.site, char);
      }
    },
    // The player plants/defuses by holding E; the channel is the same clock.
    playerChannel(char, dt, holding) {
      if (state.phase !== 'live') return;
      if (!state.bomb.planted && state.bomb.carrier === char && holding) this.tryPlant(char, dt);
      else if (state.bomb.planted && char.team !== state.attackerTeam && holding) this.tryDefuse(char, dt);
      else {
        if (!state.bomb.planted) state.bomb.plantProgress = 0;
        else state.bomb.defuseProgress = 0;
      }
    },
    reassignCarrier() {
      const attackers = hooks.characters().filter((c) => c.alive && c.team === state.attackerTeam);
      if (!attackers.length) return;
      const carrier = attackers[0];
      state.bomb.carrier = carrier;
      for (const c of attackers) c.carrier = c === carrier;
    },
  };

  function step(dt) {
    if (state.phase === 'buy' || state.phase === 'live') {
      state.phaseTime -= dt;
      if (state.phase === 'buy' && state.phaseTime <= 0) {
        state.phase = 'live';
        state.phaseTime = ROUND.roundSeconds;
        hooks.onLive();
      } else if (state.phase === 'live') {
        if (state.bomb.planted) {
          state.bomb.fuse -= dt;
          state.bomb.beepAt -= dt;
          if (state.bomb.beepAt <= 0) {
            state.bomb.beepAt = Math.max(0.25, state.bomb.fuse / ROUND.fuseSeconds) * 1.1;
            hooks.onBombBeep(state.bomb.fuse);
          }
          if (state.bomb.fuse <= 0) {
            hooks.onDetonate(state.bomb.plantedAt);
            endRound(state.attackerTeam, `Charge detonated at Site ${state.bomb.site}`);
          }
        } else if (state.phaseTime <= 0) {
          endRound(other(state.attackerTeam), 'Time expired — site held');
        }
      }
    } else if (state.phase === 'ended') {
      state.phaseTime -= dt;
      if (state.phaseTime <= 0) nextRound();
    }
  }

  function checkElimination() {
    if (state.phase !== 'live') return;
    const alive = { vanguard: 0, ember: 0 };
    for (const c of hooks.characters()) if (c.alive) alive[c.team] += 1;
    if (alive.vanguard === 0 && alive.ember === 0) endRound(other(state.attackerTeam), 'Both teams eliminated');
    else if (alive.vanguard === 0) endRound('ember', 'Vanguard eliminated');
    else if (alive.ember === 0) endRound('vanguard', 'Ember eliminated');
  }

  return {
    state,
    bomb,
    startRound,
    endRound,
    nextRound,
    step,
    checkElimination,
    awardKill,
    awardRoundEnd,
    other,
    buyOptions() {
      return [
        { key: '1', def: WEAPONS.vex9 },
        { key: '2', def: WEAPONS.ar77 },
        { key: '3', def: WEAPONS.longshot },
        { key: '4', def: null, name: 'Kevlar Vest', price: ARMOR.price },
        { key: '5', def: null, name: GRENADE.name, price: GRENADE.price },
      ];
    },
    buy(player, key) {
      if (state.phase !== 'buy') return 'Buy phase is over.';
      const option = this.buyOptions().find((o) => o.key === key);
      if (!option) return null;
      if (option.def) {
        if (player.weaponDef && player.weaponDef.id === option.def.id) return 'Already carrying it.';
        if (player.money < option.def.price) return 'Not enough money.';
        player.money -= option.def.price;
        player.weaponDef = option.def;
        hooks.onPlayerBuy(option.def);
        return `Bought ${option.def.name}.`;
      }
      if (option.name === 'Kevlar Vest') {
        if (player.armor >= 100) return 'Armour already full.';
        if (player.money < ARMOR.price) return 'Not enough money.';
        player.money -= ARMOR.price;
        player.armor = 100;
        hooks.onPlayerBuy(null);
        return 'Bought Kevlar Vest.';
      }
      if (player.grenades >= 2) return 'Carrying the maximum grenades.';
      if (player.money < GRENADE.price) return 'Not enough money.';
      player.money -= GRENADE.price;
      player.grenades += 1;
      hooks.onPlayerBuy(null);
      return 'Bought SPARK-4 Frag.';
    },
  };
}
