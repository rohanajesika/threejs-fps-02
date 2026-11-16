// The DOM HUD: health and armour, ammo, the round timer and score, money, the
// alive pips, the kill feed, the crosshair, the buy menu, the round banners and
// a live minimap. It never touches the simulation; main.js pushes numbers in
// and reads callbacks out.
import { PALETTE } from './palette.js';

const OVERLAY_COPY = {
  start: {
    title: 'EMBERLINE',
    copy: 'Kestrel Yard at dusk. Five against five, one charge, two sites. Win the round by elimination, by detonating the charge, or by holding the sites when the clock runs out.',
    action: 'Click to play',
  },
  paused: {
    title: 'EMBERLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  match: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud(map) {
  const el = (id) => document.getElementById(id);
  const overlay = el('overlay');
  const overlayTitle = el('overlay-title');
  const overlayCopy = el('overlay-copy');
  const playBtn = el('play');
  const timerEl = el('timer');
  const roundEl = el('round-label');
  const scoreV = el('score-v');
  const scoreE = el('score-e');
  const hpBar = el('hp-fill');
  const hpNum = el('hp-num');
  const armorBar = el('armor-fill');
  const armorNum = el('armor-num');
  const moneyEl = el('money');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const weaponName = el('weapon-name');
  const crosshair = el('crosshair');
  const hitmarker = el('hitmarker');
  const killfeed = el('killfeed');
  const banner = el('banner');
  const bannerTitle = el('banner-title');
  const bannerSub = el('banner-sub');
  const promptEl = el('prompt');
  const buyMenu = el('buy-menu');
  const buyMoney = el('buy-money');
  const buyList = el('buy-list');
  const pipsV = el('pips-v');
  const pipsE = el('pips-e');
  const vignette = el('vignette');
  const minimap = el('minimap');
  const mm = minimap.getContext('2d');
  const bombEl = el('bomb-status');
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};

  function setText(node, value, key) {
    if (last[key] === value) return;
    last[key] = value;
    node.textContent = value;
  }

  function fmtTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    setHealth(hp, armor) {
      hpBar.style.width = `${Math.max(0, hp)}%`;
      setText(hpNum, String(Math.round(hp)), 'hp');
      armorBar.style.width = `${Math.max(0, armor)}%`;
      setText(armorNum, String(Math.round(armor)), 'armor');
      hpBar.style.background = hp <= 30 ? PALETTE.enemy : PALETTE.team;
    },
    setMoney(value) {
      setText(moneyEl, `$${value}`, 'money');
      setText(buyMoney, `$${value}`, 'buymoney');
    },
    setAmmo(mag, reserve, name) {
      setText(ammoMag, String(mag), 'mag');
      setText(ammoReserve, `/ ${reserve}`, 'reserve');
      setText(weaponName, name, 'weapon');
      el('ammo').classList.toggle('empty', mag === 0);
    },
    setTimer(seconds, phase) {
      setText(timerEl, fmtTime(seconds), 'timer');
      timerEl.classList.toggle('urgent', phase === 'live' && seconds <= 10);
      timerEl.classList.toggle('buy', phase === 'buy');
    },
    setRound(round, score, phaseLabel) {
      setText(roundEl, `ROUND ${round} · ${phaseLabel}`, 'round');
      setText(scoreV, String(score.vanguard), 'sv');
      setText(scoreE, String(score.ember), 'se');
    },
    setPips(vanguardAlive, emberAlive) {
      const key = `${vanguardAlive}-${emberAlive}`;
      if (last.pips === key) return;
      last.pips = key;
      pipsV.innerHTML = '';
      pipsE.innerHTML = '';
      for (let i = 0; i < 5; i += 1) {
        const a = document.createElement('i');
        a.className = i < vanguardAlive ? 'on v' : 'off';
        pipsV.appendChild(a);
        const b = document.createElement('i');
        b.className = i < emberAlive ? 'on e' : 'off';
        pipsE.appendChild(b);
      }
    },
    setCrosshair(spread) {
      const gap = 4 + spread * 900;
      crosshair.style.setProperty('--gap', `${Math.min(26, gap).toFixed(1)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    killFeed(killer, victim, headshot) {
      const row = document.createElement('div');
      row.className = 'feed-row';
      row.innerHTML = `<b class="${killer.team}">${killer.name}</b><span>${headshot ? ' ⌖ ' : ' ✕ '}</span><b class="${victim.team}">${victim.name}</b>`;
      killfeed.prepend(row);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => row.remove(), 6000);
    },
    banner(title, sub, ms = 4000) {
      bannerTitle.textContent = title;
      bannerSub.textContent = sub;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, ms);
    },
    hideBanner() {
      banner.hidden = true;
    },
    setPrompt(text) {
      setText(promptEl, text, 'prompt');
      promptEl.style.opacity = text ? '1' : '0';
    },
    damageFlash(strength) {
      vignette.style.opacity = String(Math.min(0.85, strength));
      setTimeout(() => { vignette.style.opacity = '0'; }, 180);
    },
    setBomb(text, urgent) {
      setText(bombEl, text, 'bomb');
      bombEl.classList.toggle('urgent', !!urgent);
      bombEl.style.display = text ? 'block' : 'none';
    },
    showBuy(options, money) {
      buyList.innerHTML = '';
      for (const opt of options) {
        const row = document.createElement('div');
        row.className = 'buy-row';
        const name = opt.def ? opt.def.name : opt.name;
        const price = opt.def ? opt.def.price : opt.price;
        row.innerHTML = `<kbd>${opt.key}</kbd><span class="buy-name">${name}</span><span class="buy-price">$${price}</span>`;
        buyList.appendChild(row);
      }
      setText(buyMoney, `$${money}`, 'buymoney');
      buyMenu.hidden = false;
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    showOverlay(mode, scoreText) {
      const text = OVERLAY_COPY[mode];
      overlayTitle.textContent = text.title;
      overlayCopy.textContent = mode === 'match' ? scoreText : text.copy;
      playBtn.textContent = text.action;
      overlay.hidden = false;
      playBtn.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      playBtn.addEventListener('click', handler);
    },
    drawMinimap(player, characters, bomb) {
      const W = minimap.width;
      const H = minimap.height;
      const { minX, maxX, minZ, maxZ } = map.bounds;
      const sx = (x) => ((x - minX) / (maxX - minX)) * W;
      const sz = (z) => ((z - minZ) / (maxZ - minZ)) * H;
      mm.clearRect(0, 0, W, H);
      mm.fillStyle = 'rgba(20, 17, 14, 0.72)';
      mm.fillRect(0, 0, W, H);
      mm.fillStyle = 'rgba(154, 143, 125, 0.5)';
      for (const c of map.colliders) {
        const w = (c.max.x - c.min.x) / (maxX - minX) * W;
        const h = (c.max.z - c.min.z) / (maxZ - minZ) * H;
        if (c.max.y < 1.5) continue;
        mm.fillRect(sx(c.min.x), sz(c.min.z), Math.max(1, w), Math.max(1, h));
      }
      mm.font = 'bold 11px system-ui, sans-serif';
      mm.textAlign = 'center';
      mm.fillStyle = PALETTE.accent;
      mm.fillText('A', sx(-15), sz(-12) + 4);
      mm.fillText('B', sx(15), sz(-12) + 4);
      for (const ch of characters) {
        if (!ch.alive) continue;
        mm.fillStyle = ch.team === 'vanguard' ? PALETTE.team : PALETTE.enemy;
        mm.beginPath();
        mm.arc(sx(ch.body.position.x), sz(ch.body.position.z), ch.isPlayer ? 4 : 3, 0, Math.PI * 2);
        mm.fill();
      }
      if (player) {
        const px = sx(player.body.position.x);
        const py = sz(player.body.position.z);
        mm.strokeStyle = PALETTE.team;
        mm.lineWidth = 2;
        mm.beginPath();
        mm.moveTo(px, py);
        mm.lineTo(px - Math.sin(player.body.yaw) * 9, py - Math.cos(player.body.yaw) * 9);
        mm.stroke();
      }
      if (bomb.planted && bomb.plantedAt) {
        mm.fillStyle = '#ffffff';
        mm.beginPath();
        mm.arc(sx(bomb.plantedAt.x), sz(bomb.plantedAt.z), 4, 0, Math.PI * 2);
        mm.fill();
      }
    },
  };
}
