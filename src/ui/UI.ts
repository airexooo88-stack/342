import * as THREE from 'three';
import { GAME, TEAM_NAME } from '../core/Config';
import { Settings, type GraphicsQuality } from '../core/Settings';
import { Audio } from '../core/AudioSynth';
import type { DifficultyId } from '../core/Config';
import { WEAPON_DEFS, BUY_PRIMARIES, BUY_SECONDARIES } from '../weapons/WeaponDefs';

export interface UIHandlers {
  onPlay: () => void;
  onResume: () => void;
  onQuitToMenu: () => void;
  onRestart: () => void;
  onBuy: (weaponId: string) => void;
  onDeploy: () => void;
}

export interface HUDState {
  health: number;
  armor: number;
  weaponName: string;
  ammo: number;
  reserve: number;
  isMelee: boolean;
  reloading: boolean;
  slot: 1 | 2 | 3;
  primaryName: string;
  secondaryName: string;
  money: number;
  crewScore: number;
  guardScore: number;
  crewAlive: number;
  guardAlive: number;
  time: number;
  phaseLabel: string;
  bombActive: boolean;
  objective: string;
}

export interface ScorePlayer {
  name: string;
  team: 'crew' | 'guard';
  kills: number;
  deaths: number;
  assists: number;
  alive: boolean;
  isMe: boolean;
  role: string;
}

export interface RadarEntity {
  x: number;
  z: number;
  yaw: number;
  team: 'crew' | 'guard';
  alive: boolean;
  isMe: boolean;
}

const TIPS = [
  'Hold SHIFT to walk silently — running gives away your position.',
  'Crouch (CTRL) to reduce recoil and your profile.',
  'Tap fire at range; the Spray-47 climbs fast on full auto.',
  'Plant the Banana Core on a site, then hold the angles.',
  'Defenders: listen for the plant beep and rotate to defuse.',
  'Headshots with the Click-9 are lethal — aim small.',
  'Use the balcony for an off-angle on Site A.',
];

/**
 * Builds and controls every DOM overlay (menu, settings, HUD, scoreboard,
 * pause, game-over, loading) plus the canvas-based radar.
 */
export class UI {
  private root: HTMLElement;
  private handlers: UIHandlers;
  private el: Record<string, HTMLElement> = {};
  private radarCtx: CanvasRenderingContext2D | null = null;
  private crosshairGap = 4;

  constructor(root: HTMLElement, handlers: UIHandlers) {
    this.root = root;
    this.handlers = handlers;
    this.build();
    this.bind();
  }

  private q<T extends HTMLElement = HTMLElement>(id: string): T {
    return this.root.querySelector('#' + id) as T;
  }

  private build() {
    this.root.innerHTML = `
      ${this.loadingHTML()}
      ${this.menuHTML()}
      ${this.hudHTML()}
      ${this.buyMenuHTML()}
      ${this.scoreboardHTML()}
      ${this.pauseHTML()}
      ${this.gameoverHTML()}
      <div class="build-tag">${GAME.title}: ${GAME.subtitle} • ${GAME.build}</div>
    `;
    const radar = this.q<HTMLCanvasElement>('radar-canvas');
    radar.width = 168;
    radar.height = 168;
    this.radarCtx = radar.getContext('2d');
  }

  // ----------------------------------------------------------------- markup
  private loadingHTML() {
    return `
    <div id="loading" class="overlay">
      <div class="loader-box">
        <div class="loader-title">${GAME.title}: <span>${GAME.subtitle}</span></div>
        <div class="loader-bar"><div class="loader-fill" id="loader-fill"></div></div>
        <div class="loader-tip" id="loader-tip">Booting Banana Protocol…</div>
      </div>
    </div>`;
  }

  private menuHTML() {
    return `
    <div id="menu" class="overlay hidden">
      <div class="menu-brand">
        <div class="menu-kicker">Tactical Parody FPS Prototype</div>
        <h1 class="menu-title"><span class="l1">${GAME.title}</span><span class="l2">${GAME.subtitle}</span></h1>
        <p class="menu-sub">Plant the Banana Core or defend the yard. 5v5 against smart bots in an original cyber-industrial arena. Fully procedural — no third-party assets.</p>
        <div class="menu-buttons">
          <button class="btn primary" id="btn-play">▶ Play vs Bots</button>
          <button class="btn" id="btn-settings">Settings</button>
          <button class="btn" id="btn-controls">Controls</button>
          <button class="btn" id="btn-credits">Credits</button>
        </div>
      </div>
      ${this.settingsPanelHTML('settings-panel')}
      ${this.controlsPanelHTML()}
      ${this.creditsPanelHTML()}
      <div class="menu-footer"><span>v${GAME.build}</span><span>WASD • Mouse • Original parody — not affiliated with any real title</span></div>
    </div>`;
  }

  private settingsPanelHTML(id: string) {
    const s = Settings.get();
    return `
    <div class="panel hidden" id="${id}">
      <h2>Settings</h2>
      <div class="panel-desc">Tune feel & performance. Saved automatically.</div>
      <div class="field">
        <label>Mouse Sensitivity <span class="val" id="v-sens">${s.sensitivity.toFixed(2)}</span></label>
        <input type="range" id="set-sens" min="0.2" max="3" step="0.05" value="${s.sensitivity}">
      </div>
      <div class="field">
        <label>Field of View <span class="val" id="v-fov">${s.fov}°</span></label>
        <input type="range" id="set-fov" min="70" max="110" step="1" value="${s.fov}">
      </div>
      <div class="field">
        <label>Master Volume <span class="val" id="v-vol">${Math.round(s.masterVolume * 100)}%</span></label>
        <input type="range" id="set-vol" min="0" max="1" step="0.01" value="${s.masterVolume}">
      </div>
      <div class="field">
        <label>Graphics Quality</label>
        <div class="seg" id="set-gfx">
          <button data-v="low" class="${s.graphics === 'low' ? 'active' : ''}">Low</button>
          <button data-v="medium" class="${s.graphics === 'medium' ? 'active' : ''}">Medium</button>
          <button data-v="high" class="${s.graphics === 'high' ? 'active' : ''}">High</button>
          <button data-v="ultra" class="${s.graphics === 'ultra' ? 'active' : ''}">Ultra</button>
        </div>
      </div>
      <div class="field">
        <label>Bot Difficulty</label>
        <div class="seg" id="set-diff">
          <button data-v="easy" class="${s.difficulty === 'easy' ? 'active' : ''}">Easy</button>
          <button data-v="normal" class="${s.difficulty === 'normal' ? 'active' : ''}">Normal</button>
          <button data-v="hard" class="${s.difficulty === 'hard' ? 'active' : ''}">Hard</button>
        </div>
      </div>
      <div class="panel-actions">
        <button class="btn ghost" id="set-reset">Reset</button>
        <button class="btn" id="set-close">Close</button>
      </div>
    </div>`;
  }

  private controlsPanelHTML() {
    const rows: [string, string][] = [
      ['Move', 'W A S D'],
      ['Look', 'Mouse'],
      ['Fire', 'Left Mouse'],
      ['Aim (ADS)', 'Right Mouse'],
      ['Reload', 'R'],
      ['Weapons', '1 / 2 / 3 / Wheel'],
      ['Jump', 'Space'],
      ['Crouch', 'Ctrl / C'],
      ['Walk (quiet)', 'Shift'],
      ['Plant / Defuse', 'Hold E'],
      ['Scoreboard', 'Tab'],
      ['Pause', 'Esc'],
    ];
    return `
    <div class="panel hidden" id="controls-panel">
      <h2>Controls</h2>
      <div class="panel-desc">Standard tactical FPS layout.</div>
      <div class="controls-grid">
        ${rows.map(([d, k]) => `<span class="k">${k}</span><span class="d">${d}</span>`).join('')}
      </div>
      <div class="panel-actions"><button class="btn" id="controls-close">Close</button></div>
    </div>`;
  }

  private creditsPanelHTML() {
    return `
    <div class="panel hidden credits" id="credits-panel">
      <h2>Credits</h2>
      <p><b>${GAME.title}: ${GAME.subtitle}</b> is an original parody prototype.</p>
      <p>Design, code, art & sound: <b>procedurally generated</b> with TypeScript, Vite and Three.js.</p>
      <p>All weapons, maps, characters, UI and audio are original. Not affiliated with, nor derived from, any existing commercial game, brand or asset.</p>
      <p>Built as an extensible playable core — fork it and make it yours. 🍌</p>
      <div class="panel-actions"><button class="btn" id="credits-close">Close</button></div>
    </div>`;
  }

  private hudHTML() {
    return `
    <div id="hud">
      <div id="radar"><canvas id="radar-canvas"></canvas></div>

      <div class="hud-top">
        <div class="hud-team-score crew">
          <div><div class="name">Protocol Crew</div><div class="alive" id="crew-alive">5 alive</div></div>
          <div class="score" id="crew-score">0</div>
        </div>
        <div class="hud-timer" id="hud-timer">
          <div class="t" id="timer-text">1:35</div>
          <div class="phase" id="phase-text">BUY</div>
        </div>
        <div class="hud-team-score guard">
          <div><div class="name">Null Guards</div><div class="alive" id="guard-alive">5 alive</div></div>
          <div class="score" id="guard-score">0</div>
        </div>
      </div>

      <div class="hud-objective" id="hud-objective">Reach a site &amp; plant the Banana Core</div>

      <div id="killfeed"></div>

      <div class="hud-vitals">
        <div class="vital-bars">
          <div class="vital health">
            <div class="lab"><span>Health</span><span class="num" id="hp-num">100</span></div>
            <div class="track"><div class="bar" id="hp-bar"></div></div>
          </div>
          <div class="vital armor">
            <div class="lab"><span>Armor</span><span class="num" id="ar-num">100</span></div>
            <div class="track"><div class="bar" id="ar-bar"></div></div>
          </div>
        </div>
      </div>

      <div class="hud-ammo">
        <div class="hud-money">$<span id="hud-money">0</span></div>
        <div class="wname" id="weap-name">Spray-47</div>
        <div class="count"><span class="mag" id="ammo-mag">30</span><span class="reserve" id="ammo-res"> / 90</span></div>
        <div class="hud-slots">
          <div class="slot" data-slot="1" id="slot-1">1 —</div>
          <div class="slot" data-slot="2" id="slot-2">2 Click-9</div>
          <div class="slot" data-slot="3" id="slot-3">3 Knife</div>
        </div>
      </div>

      <div id="crosshair">
        <div class="ch dot"></div>
        <div class="ch t"></div><div class="ch b"></div><div class="ch l"></div><div class="ch r"></div>
      </div>
      <div id="hitmarker"><span class="a"></span><span class="b"></span><span class="c"></span><span class="d"></span></div>

      <div class="dmg-ind" id="dmg-ind"></div>

      <div id="center-hint"></div>
      <div id="progress-ring"><div class="lab" id="ring-lab">PLANTING</div><div class="track"><div class="fill" id="ring-fill"></div></div></div>
      <div id="round-banner"><div class="big" id="banner-big">ROUND WON</div><div class="small" id="banner-small"></div></div>
    </div>`;
  }

  private scoreboardHTML() {
    return `
    <div id="scoreboard" class="hidden">
      <div class="sb-card">
        <div class="sb-head">
          <div class="title">Banana Yard</div>
          <div class="scoreline"><span class="c" id="sb-crew">0</span> : <span class="g" id="sb-guard">0</span></div>
        </div>
        <div class="sb-team crew">
          <h3>Protocol Crew</h3>
          <div class="sb-row header"><span>Player</span><span class="num">K</span><span class="num">D</span><span class="num">A</span><span class="num">St</span></div>
          <div id="sb-crew-rows"></div>
        </div>
        <div class="sb-team guard">
          <h3>Null Guards</h3>
          <div class="sb-row header"><span>Player</span><span class="num">K</span><span class="num">D</span><span class="num">A</span><span class="num">St</span></div>
          <div id="sb-guard-rows"></div>
        </div>
      </div>
    </div>`;
  }

  private pauseHTML() {
    return `
    <div id="pause" class="overlay hidden">
      <div class="pause-card">
        <h2>Paused</h2>
        <div class="menu-buttons">
          <button class="btn primary" id="pause-resume">Resume</button>
          <button class="btn" id="pause-settings">Settings</button>
          <button class="btn" id="pause-quit">Quit to Menu</button>
        </div>
      </div>
      ${this.settingsPanelHTML('settings-panel-2')}
    </div>`;
  }

  private gameoverHTML() {
    return `
    <div id="gameover" class="overlay hidden">
      <div class="go-card">
        <div class="go-result" id="go-result">VICTORY</div>
        <div class="go-score"><span class="c" id="go-crew">0</span> : <span class="g" id="go-guard">0</span></div>
        <div class="menu-buttons">
          <button class="btn primary" id="go-again">Play Again</button>
          <button class="btn" id="go-menu">Main Menu</button>
        </div>
      </div>
    </div>`;
  }

  private buyCard(id: string) {
    const d = WEAPON_DEFS[id];
    const dmg = d.pellets ? `${d.damage}×${d.pellets}` : `${d.damage}`;
    return `
      <button class="buy-item" data-id="${id}">
        <div class="bi-top"><span class="bi-name">${d.name}</span><span class="bi-price">${d.price > 0 ? '$' + d.price : 'FREE'}</span></div>
        <div class="bi-cat">${d.category}</div>
        <div class="bi-stats">DMG ${dmg} · RPM ${d.rpm} · MAG ${d.magazine || '∞'}</div>
        <div class="bi-owned">EQUIPPED</div>
      </button>`;
  }

  private buyMenuHTML() {
    return `
    <div id="buymenu" class="overlay hidden">
      <div class="buy-card">
        <div class="buy-head">
          <div class="buy-title">ARMORY <span>— gear up before deployment</span></div>
          <div class="buy-meta">
            <span class="buy-money">$<b id="buy-money">0</b></span>
            <span class="buy-timer">Auto-deploy in <b id="buy-timer">15</b>s</span>
          </div>
        </div>
        <div class="buy-cols">
          <div class="buy-col">
            <h4>Primary</h4>
            <div class="buy-grid" id="buy-primaries">${BUY_PRIMARIES.map((id) => this.buyCard(id)).join('')}</div>
          </div>
          <div class="buy-col">
            <h4>Secondary</h4>
            <div class="buy-grid" id="buy-secondaries">${BUY_SECONDARIES.map((id) => this.buyCard(id)).join('')}</div>
          </div>
        </div>
        <div class="buy-foot">
          <div class="buy-hint">Click an item to buy · weapons carry to next round · Click-9 &amp; Bonk Knife are free</div>
          <button class="btn primary" id="buy-deploy">Deploy ▶</button>
        </div>
      </div>
    </div>`;
  }

  // ------------------------------------------------------------------- bind
  private bind() {
    const click = (id: string, fn: () => void) => {
      const e = this.q(id);
      if (!e) return;
      e.addEventListener('click', () => {
        Audio.uiClick();
        fn();
      });
      e.addEventListener('mouseenter', () => Audio.uiHover());
    };

    click('btn-play', () => this.handlers.onPlay());
    click('btn-settings', () => this.togglePanel('settings-panel'));
    click('btn-controls', () => this.togglePanel('controls-panel'));
    click('btn-credits', () => this.togglePanel('credits-panel'));
    click('set-close', () => this.hidePanels());
    click('controls-close', () => this.hidePanels());
    click('credits-close', () => this.hidePanels());
    click('set-reset', () => {
      Settings.reset();
      this.refreshSettingsInputs();
    });

    click('pause-resume', () => this.handlers.onResume());
    click('pause-settings', () => this.q('settings-panel-2').classList.toggle('hidden'));
    click('pause-quit', () => this.handlers.onQuitToMenu());

    click('go-again', () => this.handlers.onRestart());
    click('go-menu', () => this.handlers.onQuitToMenu());

    click('buy-deploy', () => this.handlers.onDeploy());
    this.root.querySelectorAll('.buy-item').forEach((it) =>
      it.addEventListener('click', () => {
        Audio.uiClick();
        this.handlers.onBuy((it as HTMLElement).dataset.id!);
      })
    );

    this.bindSettingsInputs();
  }

  private bindSettingsInputs() {
    // there can be two settings panels (menu + pause); bind both copies by class scan
    const sens = this.root.querySelectorAll<HTMLInputElement>('#set-sens');
    const fov = this.root.querySelectorAll<HTMLInputElement>('#set-fov');
    const vol = this.root.querySelectorAll<HTMLInputElement>('#set-vol');

    sens.forEach((i) =>
      i.addEventListener('input', () => {
        Settings.set('sensitivity', parseFloat(i.value));
        this.setText('v-sens', parseFloat(i.value).toFixed(2));
      })
    );
    fov.forEach((i) =>
      i.addEventListener('input', () => {
        Settings.set('fov', parseInt(i.value));
        this.setText('v-fov', i.value + '°');
      })
    );
    vol.forEach((i) =>
      i.addEventListener('input', () => {
        Settings.set('masterVolume', parseFloat(i.value));
        this.setText('v-vol', Math.round(parseFloat(i.value) * 100) + '%');
        Audio.resume();
      })
    );

    this.root.querySelectorAll('#set-gfx').forEach((seg) =>
      this.bindSeg(seg as HTMLElement, (v) => Settings.set('graphics', v as GraphicsQuality))
    );
    this.root.querySelectorAll('#set-diff').forEach((seg) =>
      this.bindSeg(seg as HTMLElement, (v) => Settings.set('difficulty', v as DifficultyId))
    );
  }

  private bindSeg(seg: HTMLElement, fn: (v: string) => void) {
    seg.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        Audio.uiClick();
        seg.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        fn((b as HTMLElement).dataset.v!);
        // sync the other panel's segments
        this.syncSegs(seg.id, (b as HTMLElement).dataset.v!);
      })
    );
  }

  private syncSegs(id: string, v: string) {
    this.root.querySelectorAll('#' + id).forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('active', (b as HTMLElement).dataset.v === v);
      });
    });
  }

  private refreshSettingsInputs() {
    const s = Settings.get();
    this.root.querySelectorAll<HTMLInputElement>('#set-sens').forEach((i) => (i.value = String(s.sensitivity)));
    this.root.querySelectorAll<HTMLInputElement>('#set-fov').forEach((i) => (i.value = String(s.fov)));
    this.root.querySelectorAll<HTMLInputElement>('#set-vol').forEach((i) => (i.value = String(s.masterVolume)));
    this.setText('v-sens', s.sensitivity.toFixed(2));
    this.setText('v-fov', s.fov + '°');
    this.setText('v-vol', Math.round(s.masterVolume * 100) + '%');
    this.syncSegs('set-gfx', s.graphics);
    this.syncSegs('set-diff', s.difficulty);
  }

  private togglePanel(id: string) {
    const target = this.q(id);
    const wasHidden = target.classList.contains('hidden');
    this.hidePanels();
    if (wasHidden) target.classList.remove('hidden');
  }

  private hidePanels() {
    ['settings-panel', 'controls-panel', 'credits-panel'].forEach((id) => this.q(id)?.classList.add('hidden'));
  }

  private setText(id: string, text: string) {
    const e = this.q(id);
    if (e) e.textContent = text;
  }

  private show(id: string) {
    this.q(id)?.classList.remove('hidden');
  }
  private hide(id: string) {
    this.q(id)?.classList.add('hidden');
  }

  // --------------------------------------------------------------- screens
  setLoadingProgress(p: number, tip?: string) {
    const fill = this.q('loader-fill');
    if (fill) fill.style.width = Math.round(p * 100) + '%';
    if (tip) this.setText('loader-tip', tip);
  }
  randomTip() {
    return TIPS[Math.floor(Math.random() * TIPS.length)];
  }
  hideLoading() {
    this.hide('loading');
  }
  showMenu() {
    this.hideLoading();
    this.hide('hud');
    this.hide('pause');
    this.hide('gameover');
    this.hide('buymenu');
    this.hidePanels();
    this.show('menu');
    this.q('hud').classList.remove('live');
  }
  hideMenu() {
    this.hide('menu');
  }
  showHUD() {
    this.hideMenu();
    this.hide('pause');
    this.hide('gameover');
    this.show('hud');
    requestAnimationFrame(() => this.q('hud').classList.add('live'));
  }
  showPause() {
    this.show('pause');
  }
  hidePause() {
    this.hide('pause');
    this.q('settings-panel-2')?.classList.add('hidden');
  }
  showGameOver(playerWon: boolean, crew: number, guard: number) {
    const res = this.q('go-result');
    res.textContent = playerWon ? 'VICTORY' : 'DEFEAT';
    res.className = 'go-result ' + (playerWon ? 'win' : 'lose');
    this.setText('go-crew', String(crew));
    this.setText('go-guard', String(guard));
    this.q('hud').classList.remove('live');
    this.show('gameover');
    if (playerWon) Audio.roundWin();
    else Audio.roundLose();
  }

  toggleScoreboard(show: boolean) {
    this.q('scoreboard').classList.toggle('hidden', !show);
  }

  // --------------------------------------------------------------- buy menu
  showBuyMenu() {
    this.show('buymenu');
  }
  hideBuyMenu() {
    this.hide('buymenu');
  }
  refreshBuyMenu(money: number, primaryId: string | null, secondaryId: string, timeLeft: number) {
    this.setText('buy-money', String(money));
    this.setText('buy-timer', String(Math.max(0, timeLeft)));
    this.root.querySelectorAll<HTMLElement>('.buy-item').forEach((it) => {
      const id = it.dataset.id!;
      const def = WEAPON_DEFS[id];
      const owned = id === primaryId || id === secondaryId;
      const afford = money >= def.price || owned;
      it.classList.toggle('owned', owned);
      it.classList.toggle('cant', !afford);
    });
  }

  // ------------------------------------------------------------------- HUD
  updateHUD(s: HUDState) {
    this.setText('hp-num', String(Math.ceil(s.health)));
    this.setText('ar-num', String(Math.ceil(s.armor)));
    (this.q('hp-bar') as HTMLElement).style.transform = `scaleX(${Math.max(0, s.health / 100)})`;
    (this.q('ar-bar') as HTMLElement).style.transform = `scaleX(${Math.max(0, s.armor / 100)})`;

    this.setText('weap-name', s.weaponName);
    if (s.isMelee) {
      this.setText('ammo-mag', '∞');
      this.setText('ammo-res', '');
    } else {
      this.setText('ammo-mag', s.reloading ? '—' : String(s.ammo));
      this.setText('ammo-res', ' / ' + s.reserve);
    }

    for (const n of [1, 2, 3]) {
      this.q('slot-' + n)?.classList.toggle('active', s.slot === n);
    }
    this.setText('slot-1', '1 ' + s.primaryName);
    this.setText('slot-2', '2 ' + s.secondaryName);
    this.setText('slot-3', '3 Knife');
    this.setText('hud-money', String(s.money));

    this.setText('crew-score', String(s.crewScore));
    this.setText('guard-score', String(s.guardScore));
    this.setText('crew-alive', s.crewAlive + ' alive');
    this.setText('guard-alive', s.guardAlive + ' alive');

    const m = Math.floor(s.time / 60);
    const sec = Math.floor(s.time % 60);
    this.setText('timer-text', `${m}:${sec.toString().padStart(2, '0')}`);
    this.setText('phase-text', s.phaseLabel);
    this.q('hud-timer').classList.toggle('bomb', s.bombActive);
    this.setText('hud-objective', s.objective);
  }

  setCrosshairSpread(px: number) {
    this.crosshairGap = 4 + px;
    const g = this.crosshairGap;
    const len = 8;
    const t = this.q('crosshair').querySelector('.t') as HTMLElement;
    const b = this.q('crosshair').querySelector('.b') as HTMLElement;
    const l = this.q('crosshair').querySelector('.l') as HTMLElement;
    const r = this.q('crosshair').querySelector('.r') as HTMLElement;
    if (!t) return;
    t.style.top = `${20 - g - len}px`;
    t.style.height = `${len}px`;
    b.style.top = `${20 + g}px`;
    b.style.height = `${len}px`;
    l.style.left = `${20 - g - len}px`;
    l.style.width = `${len}px`;
    r.style.left = `${20 + g}px`;
    r.style.width = `${len}px`;
  }

  hitMarker(kill: boolean, headshot: boolean) {
    const hm = this.q('hitmarker');
    hm.classList.remove('show', 'kill');
    // force reflow to restart animation
    void hm.offsetWidth;
    hm.classList.add('show');
    if (kill) hm.classList.add('kill');
    if (headshot || kill) {
      const ch = this.q('crosshair');
      ch.classList.add('hit');
      setTimeout(() => ch.classList.remove('hit'), 120);
    }
  }

  damageIndicator(angleRad: number) {
    const cont = this.q('dmg-ind');
    const arc = document.createElement('div');
    arc.className = 'dmg-arc';
    arc.style.transform = `rotate(${angleRad}rad)`;
    arc.style.opacity = '1';
    cont.appendChild(arc);
    requestAnimationFrame(() => {
      arc.style.transition = 'opacity 0.9s ease';
      arc.style.opacity = '0';
    });
    setTimeout(() => arc.remove(), 1000);
  }

  addKill(attacker: string, attackerTeam: 'crew' | 'guard', victim: string, victimTeam: 'crew' | 'guard', weapon: string, headshot: boolean) {
    const feed = this.q('killfeed');
    const row = document.createElement('div');
    row.className = 'kf-row' + (headshot ? ' headshot' : '');
    row.innerHTML = `<span class="who ${attackerTeam}">${attacker}</span><span class="weap">${weapon}</span><span class="who ${victimTeam}">${victim}</span>`;
    feed.appendChild(row);
    while (feed.children.length > 5) feed.removeChild(feed.firstChild!);
    setTimeout(() => row.remove(), 5000);
  }

  roundBanner(big: string, small: string, win: boolean) {
    const b = this.q('round-banner');
    this.setText('banner-big', big);
    this.setText('banner-small', small);
    b.className = win ? 'win show' : 'lose show';
    b.classList.add('show');
  }
  hideRoundBanner() {
    this.q('round-banner').classList.remove('show');
  }

  centerHint(html: string | null) {
    const e = this.q('center-hint');
    if (!html) {
      e.classList.remove('show');
      return;
    }
    e.innerHTML = html;
    e.classList.add('show');
  }

  progressRing(label: string | null, frac: number) {
    const e = this.q('progress-ring');
    if (label === null) {
      e.classList.remove('show');
      return;
    }
    this.setText('ring-lab', label);
    (this.q('ring-fill') as HTMLElement).style.width = Math.round(frac * 100) + '%';
    e.classList.add('show');
  }

  updateScoreboard(players: ScorePlayer[], crew: number, guard: number) {
    this.setText('sb-crew', String(crew));
    this.setText('sb-guard', String(guard));
    const rowHTML = (p: ScorePlayer) => `
      <div class="sb-row ${p.isMe ? 'me' : ''} ${p.alive ? '' : 'dead'}">
        <span class="pname">${p.name} <span class="sb-tag">${p.role}</span></span>
        <span class="num">${p.kills}</span><span class="num">${p.deaths}</span><span class="num">${p.assists}</span>
        <span class="num">${p.alive ? '●' : '✕'}</span>
      </div>`;
    this.q('sb-crew-rows').innerHTML = players.filter((p) => p.team === 'crew').map(rowHTML).join('');
    this.q('sb-guard-rows').innerHTML = players.filter((p) => p.team === 'guard').map(rowHTML).join('');
  }

  // ------------------------------------------------------------------- radar
  updateRadar(
    entities: RadarEntity[],
    shapes: { x: number; z: number; w: number; d: number; color: string }[],
    bomb: THREE.Vector3 | null,
    bombPlanted: boolean
  ) {
    const ctx = this.radarCtx;
    if (!ctx) return;
    const W = 168;
    const H = 168;
    ctx.clearRect(0, 0, W, H);

    // world bounds approx -22..22 x, -30..30 z -> map to radar
    const minX = -22,
      maxX = 22,
      minZ = -30,
      maxZ = 30;
    const sx = (x: number) => ((x - minX) / (maxX - minX)) * W;
    const sz = (z: number) => ((z - minZ) / (maxZ - minZ)) * H;

    ctx.fillStyle = 'rgba(20,26,40,0.6)';
    ctx.fillRect(0, 0, W, H);

    // geometry
    for (const s of shapes) {
      if (s.color === 'siteA' || s.color === 'siteB') continue;
      ctx.fillStyle = 'rgba(120,140,170,0.5)';
      const w = (s.w / (maxX - minX)) * W;
      const d = (s.d / (maxZ - minZ)) * H;
      ctx.fillRect(sx(s.x) - w / 2, sz(s.z) - d / 2, w, d);
    }
    // sites
    for (const s of shapes) {
      if (s.color !== 'siteA' && s.color !== 'siteB') continue;
      ctx.strokeStyle = s.color === 'siteA' ? '#ffd23f' : '#ff5470';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx(s.x), sz(s.z), 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = s.color === 'siteA' ? '#ffd23f' : '#ff5470';
      ctx.font = '9px monospace';
      ctx.fillText(s.color === 'siteA' ? 'A' : 'B', sx(s.x) - 3, sz(s.z) + 3);
    }

    // bomb
    if (bomb && bombPlanted) {
      ctx.fillStyle = '#ff5470';
      ctx.beginPath();
      ctx.arc(sx(bomb.x), sz(bomb.z), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // entities
    for (const e of entities) {
      if (!e.alive) continue;
      const x = sx(e.x);
      const y = sz(e.z);
      if (e.isMe) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-e.yaw);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.lineTo(3.5, 4);
        ctx.lineTo(-3.5, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = e.team === 'crew' ? '#ffce42' : '#4fb0ff';
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
