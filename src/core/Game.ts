import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import type { IGameWorld, BulletResult, SoundEvent } from './Types';
import type { TeamId } from './Config';
import { ROUND, ECONOMY, TEAM_NAME, HITZONE } from './Config';
import { Settings } from './Settings';
import { Audio } from './AudioSynth';
import { Input } from './Input';
import { clamp } from './MathUtils';
import { WEAPON_DEFS } from '../weapons/WeaponDefs';

import { CollisionWorld } from '../world/Collision';
import { WaypointGraph } from '../world/Waypoints';
import { MapBanana } from '../world/MapBanana';
import {
  CREW_SPAWNS,
  GUARD_SPAWNS,
} from '../world/Layout';

import { Effects } from '../fx/Effects';
import { Character } from '../entities/Character';
import { Player } from '../entities/Player';
import { Bot } from '../entities/Bot';
import { createTeam } from '../game/Teams';
import { Round, type RoundPhase, type WinReason } from '../game/Round';
import { UI, type ScorePlayer, type RadarEntity } from '../ui/UI';
import { MenuScene } from '../ui/MenuScene';
import type { WeaponDef } from '../weapons/WeaponDefs';

type GameState = 'loading' | 'menu' | 'playing' | 'paused' | 'gameover';

const _fwd = new THREE.Vector3();
const _pt = new THREE.Vector3();
const _n = new THREE.Vector3();
const _box = { min: new THREE.Vector3(), max: new THREE.Vector3() };

/**
 * Central orchestrator. Owns the renderer, scene graph, entities, round logic
 * and UI, and implements IGameWorld — the contract entities use to query and
 * affect the world.
 */
export class Game implements IGameWorld {
  private renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;

  private input: Input;
  private ui: UI;
  private menuScene: MenuScene;

  private map: MapBanana;
  private _waypoints: WaypointGraph;
  private _fx: Effects;
  private round: Round;

  private player!: Player;
  private bots: Bot[] = [];
  private _all: Character[] = [];

  private state: GameState = 'loading';
  private _time = 0;
  private lastFrame = 0;
  private lastPhase: RoundPhase = 'buy';

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.applyPixelRatio();

    this.scene.background = new THREE.Color(0x0a0d14);
    this.scene.fog = new THREE.FogExp2(0x0a0d14, 0.012);

    this.camera = new THREE.PerspectiveCamera(Settings.get().fov, window.innerWidth / window.innerHeight, 0.05, 300);

    // world systems (constructed before entities so IGameWorld is usable)
    this._fx = new Effects(this.scene);
    this.map = new MapBanana(this.scene, Settings.get().shadows);
    this._waypoints = new WaypointGraph();
    this.round = new Round(this.scene, {
      onPhase: (p) => this.onPhaseChange(p),
      onPlanted: (site) => this.onPlanted(site),
      onRoundEnd: (w, r) => this.onRoundEnd(w, r),
      onMatchEnd: (w) => this.onMatchEnd(w),
    });

    this.input = new Input(canvas);
    this.input.onLockChange = (locked) => this.onLockChange(locked);

    this.ui = new UI(document.getElementById('ui-root') as HTMLElement, {
      onPlay: () => this.startMatch(),
      onResume: () => this.resume(),
      onQuitToMenu: () => this.toMenu(),
      onRestart: () => this.startMatch(),
      onBuy: (id) => this.buyWeapon(id),
      onDeploy: () => this.deploy(),
    });

    this.menuScene = new MenuScene();

    this.createActors();
    this.setupBloom();

    window.addEventListener('resize', () => this.onResize());
    Settings.onChange(() => this.applyGraphics());

    // click-to-lock fallback (e.g. after the buy timer expires without Deploy)
    canvas.addEventListener('mousedown', () => {
      if (this.state === 'playing' && this.round.phase === 'live' && !this.input.locked) {
        this.input.requestLock();
      }
    });

    this.onResize(); // set initial aspect ratios for all cameras
    this.boot();
  }

  // =========================================================== IGameWorld ===
  get collision(): CollisionWorld {
    return this.map.collision;
  }
  get waypoints(): WaypointGraph {
    return this._waypoints;
  }
  get fx(): Effects {
    return this._fx;
  }
  get time(): number {
    return this._time;
  }
  get listenerPos(): THREE.Vector3 {
    return this.player ? this.player.position : new THREE.Vector3();
  }
  get bombPlanted(): boolean {
    return this.round.planted;
  }
  get bombSite(): 'A' | 'B' | null {
    return this.round.site;
  }
  get bombPos(): THREE.Vector3 | null {
    return this.round.pos;
  }
  get roundLive(): boolean {
    return this.round.phase === 'live';
  }

  characters(): Character[] {
    return this._all;
  }
  enemiesOf(team: TeamId): Character[] {
    return this._all.filter((c) => c.team !== team);
  }
  alliesOf(team: TeamId): Character[] {
    return this._all.filter((c) => c.team === team);
  }

  emitSound(ev: SoundEvent) {
    for (const b of this.bots) b.hear(ev);
  }

  fireBullet(origin: THREE.Vector3, dir: THREE.Vector3, attacker: Character, def: WeaponDef): BulletResult {
    const range = def.range;
    const worldHit = this.collision.raycast(origin, dir, range);
    let nearestT = worldHit ? worldHit.distance : range;

    let hitChar: Character | null = null;
    let hitZone: string | null = null;

    for (const c of this._all) {
      if (c === attacker || !c.alive || c.team === attacker.team) continue;
      for (const hb of c.getHitboxes()) {
        _box.min.copy(hb.min);
        _box.max.copy(hb.max);
        const r = CollisionWorld.rayAABB(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, _box);
        if (r && r.t >= 0 && r.t < nearestT) {
          nearestT = r.t;
          hitChar = c;
          hitZone = hb.zone;
        }
      }
    }

    if (hitChar && hitZone) {
      _pt.copy(origin).addScaledVector(dir, nearestT);
      _n.copy(dir).multiplyScalar(-1);
      let mult = 1;
      if (hitZone === HITZONE.HEAD) mult = def.headMult;
      else if (hitZone === HITZONE.LEGS) mult = def.legMult;
      const dmg = def.damage * mult;
      hitChar.takeDamage(dmg, hitZone, attacker, def.name, dir.clone(), def.armorPen);
      return { hitCharacter: hitChar, zone: hitZone as any, point: _pt.clone(), normal: _n.clone(), distance: nearestT, hitWorld: false };
    }

    if (worldHit) {
      return { hitCharacter: null, zone: null, point: worldHit.point, normal: worldHit.normal, distance: worldHit.distance, hitWorld: true };
    }
    _pt.copy(origin).addScaledVector(dir, range);
    return { hitCharacter: null, zone: null, point: _pt.clone(), normal: new THREE.Vector3(0, 1, 0), distance: range, hitWorld: false };
  }

  onKill(victim: Character, attacker: Character | null, weapon: string, headshot: boolean) {
    victim.deaths++;
    if (attacker && attacker !== victim && attacker.team !== victim.team) {
      attacker.kills++;
      if (attacker === this.player) {
        this.player.money = Math.min(ECONOMY.maxMoney, this.player.money + ECONOMY.killReward);
      }
    }
    this.ui.addKill(
      attacker ? attacker.name : '—',
      (attacker?.team ?? victim.team) as 'crew' | 'guard',
      victim.name,
      victim.team as 'crew' | 'guard',
      weapon,
      headshot
    );
    if (victim === this.player) {
      this.ui.centerHint('You were eliminated — spectating until next round');
    }
  }

  // =============================================================== setup ===
  private createActors() {
    this.player = new Player(this, this.camera, this.input);
    this.player.feedback.onHitConfirm = (kill, head) => {
      this.ui.hitMarker(kill, head);
    };
    this.player.feedback.onTookDamage = (worldDir) => {
      this.player.aimDirection(_fwd);
      const fa = Math.atan2(_fwd.x, _fwd.z);
      const da = Math.atan2(worldDir.x, worldDir.z);
      this.ui.damageIndicator(da - fa);
    };

    // player is on the Protocol Crew (attackers)
    const crewBots = createTeam(this, 'crew', ROUND.teamSize - 1);
    const guardBots = createTeam(this, 'guard', ROUND.teamSize);
    this.bots = [...crewBots, ...guardBots];
    this._all = [this.player, ...this.bots];
  }

  private setupBloom() {
    try {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.55,
        0.5,
        0.85
      );
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
      this.composer.setSize(window.innerWidth, window.innerHeight);
    } catch (e) {
      console.warn('Bloom unavailable, falling back to direct render', e);
      this.composer = null;
    }
  }

  private async boot() {
    this.state = 'loading';
    const tips = [
      'Compiling Banana Yard…',
      'Calibrating bot reflexes…',
      'Synthesizing gunfire…',
      'Charging the Banana Core…',
    ];
    for (let i = 0; i <= 100; i += 10) {
      this.ui.setLoadingProgress(i / 100, tips[Math.floor(i / 30) % tips.length]);
      await new Promise((r) => setTimeout(r, 60));
    }
    this.ui.hideLoading();
    this.toMenu();
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  // =============================================================== states ==
  private toMenu() {
    this.state = 'menu';
    this.input.exitLock();
    this.ui.showMenu();
    this.ui.toggleScoreboard(false);
  }

  private startMatch() {
    Audio.resume();
    this.applyGraphics();
    this.round.crewScore = 0;
    this.round.guardScore = 0;
    this.round.matchOver = false;
    for (const c of this._all) {
      c.kills = 0;
      c.deaths = 0;
      c.assists = 0;
    }
    this.player.money = ECONOMY.startMoney;
    this.player.primaryId = null; // pistol round to start; buy a primary
    this.player.secondaryId = 'click9';
    this.round.startRound(1);
    this.resetPositions();
    this.lastPhase = 'buy';
    this.state = 'playing';
    this.ui.showHUD();
    this.ui.hideRoundBanner();
    // buy phase opens the armory (onPhaseChange handles the menu + cursor)
  }

  private resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.hidePause();
    this.input.requestLock();
  }

  private pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.showPause();
  }

  private onLockChange(locked: boolean) {
    // Only auto-pause when the mouse is released during the LIVE round.
    // (The buy phase intentionally frees the cursor for the armory menu.)
    if (!locked && this.state === 'playing' && this.round.phase === 'live') this.pause();
  }

  private resetPositions() {
    const crew = this.alliesOf('crew');
    const guard = this.alliesOf('guard');
    const rn = this.round.roundNumber;
    // player first on crew
    let ci = 0;
    for (const c of crew) {
      const spawn = CREW_SPAWNS[ci % CREW_SPAWNS.length];
      if (c.isBot) this.assignBotLoadout(c as Bot, rn);
      c.resetForRound(spawn.clone(), 0); // face -Z (toward defenders)
      ci++;
    }
    let gi = 0;
    for (const g of guard) {
      const spawn = GUARD_SPAWNS[gi % GUARD_SPAWNS.length];
      if (g.isBot) this.assignBotLoadout(g as Bot, rn);
      g.resetForRound(spawn.clone(), Math.PI); // face +Z (toward attackers)
      gi++;
    }
  }

  /** Give bots a role/round-based loadout (round 1 = pistol round). */
  private assignBotLoadout(bot: Bot, roundNumber: number) {
    let primary: string | null;
    if (roundNumber <= 1) {
      primary = Math.random() < 0.25 ? 'buzz9' : null; // mostly pistols round 1
    } else if (bot.role === 'sniper') {
      primary = Math.random() < 0.7 ? 'longscope' : 'spray47';
    } else if (bot.role === 'support') {
      primary = Math.random() < 0.5 ? 'buzz9' : 'spray47';
    } else {
      primary = Math.random() < 0.2 ? 'thumper' : 'spray47';
    }
    bot.primaryId = primary;
    bot.secondaryId = Math.random() < 0.2 ? 'handCannon' : 'click9';
  }

  private nextRound() {
    this.round.startRound(this.round.roundNumber + 1);
    this.resetPositions();
    this.ui.hideRoundBanner();
    this.ui.centerHint(null);
  }

  // =============================================================== events ==
  private onPhaseChange(p: RoundPhase) {
    this.lastPhase = p;
    if (p === 'buy') {
      // open the armory: free the cursor so weapons are clickable
      this.input.exitLock();
      this.ui.showBuyMenu();
      this.refreshBuyMenu();
    } else if (p === 'live') {
      this.ui.hideBuyMenu();
      this.ui.centerHint(null);
      // re-grab the mouse for the live round
      this.input.requestLock();
    }
  }

  private buyWeapon(id: string) {
    if (this.round.phase !== 'buy') return;
    const def = WEAPON_DEFS[id];
    if (!def) return;
    const p = this.player;
    if (def.slotKind === 'primary') {
      if (p.primaryId === id) return; // already owned
      if (p.money < def.price) return;
      p.money -= def.price;
      p.setLoadout(id, p.secondaryId);
    } else if (def.slotKind === 'secondary') {
      if (p.secondaryId === id) return;
      if (p.money < def.price) return;
      p.money -= def.price;
      p.setLoadout(p.primaryId, id);
    } else {
      return;
    }
    p.applyViewmodel();
    Audio.uiClick();
    this.refreshBuyMenu();
  }

  private deploy() {
    if (this.round.phase !== 'buy') return;
    this.round.deployNow(); // triggers onPhaseChange('live') -> lock + hide menu
  }

  private refreshBuyMenu() {
    this.ui.refreshBuyMenu(
      this.player.money,
      this.player.primaryId,
      this.player.secondaryId,
      Math.ceil(this.round.timer)
    );
  }

  private onPlanted(site: 'A' | 'B') {
    this.ui.centerHint(null);
    this.ui.roundBanner('CORE ARMED', `Banana Core planted on Site ${site}`, this.player.team === 'crew');
    setTimeout(() => {
      if (this.round.phase === 'live') this.ui.hideRoundBanner();
    }, 1800);
  }

  private onRoundEnd(winner: TeamId, reason: WinReason) {
    const playerWon = winner === this.player.team;
    // economy reward for the next buy
    this.player.money = Math.min(
      ECONOMY.maxMoney,
      this.player.money + (playerWon ? ECONOMY.winReward : ECONOMY.lossReward)
    );
    const reasonText: Record<WinReason, string> = {
      eliminated: 'Team eliminated',
      detonated: 'Banana Core detonated',
      defused: 'Banana Core defused',
      timeout: 'Time expired',
    };
    this.ui.roundBanner(
      playerWon ? 'ROUND WON' : 'ROUND LOST',
      `${TEAM_NAME[winner]} — ${reasonText[reason]}`,
      playerWon
    );
  }

  private onMatchEnd(_winner: TeamId) {
    // handled in update loop once the end delay elapses
  }

  // =============================================================== loop ====
  private loop(now: number) {
    requestAnimationFrame((t) => this.loop(t));
    let dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (dt > 0.05) dt = 0.05; // clamp big spikes (e.g., tab switch)

    if (this.state === 'menu') {
      this.menuScene.update(dt);
    } else if (this.state === 'playing') {
      this._time += dt;
      this.simulate(dt);
    }

    this.render();
    this.input.endFrame();
  }

  private simulate(dt: number) {
    // entities
    this.player.frozen = this.round.phase === 'buy';
    this.player.update(dt);
    for (const b of this.bots) b.update(dt);

    // objective interaction
    const holdingE = this.input.isDown('KeyE');
    this.round.update(dt, this._all, this.player, holdingE);

    this._fx.update(dt);
    this.map.update(this._time);

    // keep the buy timer / affordability fresh during the buy phase
    if (this.round.phase === 'buy') this.refreshBuyMenu();

    // round flow transitions
    if (this.round.matchOver && this.round.phase === 'end' && this.roundEndElapsed()) {
      this.gameOver();
      return;
    }
    if (this.round.readyForNextRound) {
      this.nextRound();
    }

    this.updateHUD(holdingE);

    // scoreboard while Tab held
    const sb = this.input.isDown('Tab');
    this.ui.toggleScoreboard(sb);
    if (sb) this.updateScoreboard();
  }

  private roundEndElapsed(): boolean {
    // Round exposes readiness via readyForNextRound; for match end we reuse it
    return this.round.phase === 'end' && (this.round as any).endTimer <= 0;
  }

  private gameOver() {
    this.state = 'gameover';
    this.input.exitLock();
    const playerWon =
      (this.player.team === 'crew' && this.round.crewScore > this.round.guardScore) ||
      (this.player.team === 'guard' && this.round.guardScore > this.round.crewScore);
    this.ui.showGameOver(playerWon, this.round.crewScore, this.round.guardScore);
  }

  // =============================================================== HUD =====
  private updateHUD(holdingE: boolean) {
    const w = this.player.weapon;
    const crewAlive = this.alliesOf('crew').filter((c) => c.alive).length;
    const guardAlive = this.alliesOf('guard').filter((c) => c.alive).length;

    const phaseLabel =
      this.round.phase === 'buy'
        ? 'BUY'
        : this.round.planted
          ? 'CORE LIVE'
          : this.round.phase === 'end'
            ? 'ROUND END'
            : 'LIVE';

    const primaryName = this.player.primaryId ? WEAPON_DEFS[this.player.primaryId].name : '—';
    const secondaryName = WEAPON_DEFS[this.player.secondaryId]?.name ?? 'Pistol';

    this.ui.updateHUD({
      health: this.player.health,
      armor: this.player.armor,
      weaponName: w.def.name,
      ammo: w.ammo,
      reserve: w.reserve,
      isMelee: w.isMelee,
      reloading: w.reloading,
      slot: w.def.slot,
      primaryName,
      secondaryName,
      money: this.player.money,
      crewScore: this.round.crewScore,
      guardScore: this.round.guardScore,
      crewAlive,
      guardAlive,
      time: this.round.displayTime,
      phaseLabel,
      bombActive: this.round.planted,
      objective: this.objectiveText(),
    });

    // crosshair spread
    const moving = Math.hypot(this.player.velocity.x, this.player.velocity.z) > 1.2;
    const spreadRad = (this.player.ads ? w.def.adsSpread : w.def.baseSpread) + (moving ? w.def.moveSpread : 0);
    this.ui.setCrosshairSpread(clamp(spreadRad * 600, 1, 26));

    // interaction prompts + progress ring
    const prompt = this.round.interactionPrompt(this.player);
    if (prompt === 'plant') {
      if (holdingE) {
        this.ui.centerHint(null);
        this.ui.progressRing('ARMING CORE', this.round.plantProgress / ROUND.plantTime);
      } else {
        this.ui.centerHint('Hold <kbd>E</kbd> to plant the Banana Core');
        this.ui.progressRing(null, 0);
      }
    } else if (prompt === 'defuse') {
      if (holdingE) {
        this.ui.centerHint(null);
        this.ui.progressRing('DEFUSING', this.round.defuseProgress / ROUND.defuseTime);
      } else {
        this.ui.centerHint('Hold <kbd>E</kbd> to defuse');
        this.ui.progressRing(null, 0);
      }
    } else {
      if (this.player.alive) this.ui.centerHint(null);
      this.ui.progressRing(null, 0);
    }

    // radar
    const entities: RadarEntity[] = this._all.map((c) => ({
      x: c.position.x,
      z: c.position.z,
      yaw: c.yaw,
      team: c.team as 'crew' | 'guard',
      alive: c.alive,
      isMe: c === this.player,
    }));
    // only reveal allies + self + bomb on the radar (enemies stay hidden unless spotted)
    const visible = entities.filter((e) => e.isMe || e.team === this.player.team);
    this.ui.updateRadar(visible, this.map.radarShapes, this.round.pos, this.round.planted);
  }

  private objectiveText(): string {
    const atkr = this.player.team === 'crew';
    if (this.round.phase === 'buy') return 'Buy phase — pick your loadout & Deploy';
    if (this.round.planted) {
      return atkr ? 'Defend the Banana Core until detonation' : 'Defuse the Banana Core — hurry!';
    }
    return atkr ? 'Reach Site A or B and plant the Banana Core' : 'Hold the sites — deny the plant';
  }

  private updateScoreboard() {
    const players: ScorePlayer[] = this._all.map((c) => ({
      name: c.name,
      team: c.team as 'crew' | 'guard',
      kills: c.kills,
      deaths: c.deaths,
      assists: c.assists,
      alive: c.alive,
      isMe: c === this.player,
      role: c === this.player ? 'You' : (c as Bot).role ?? 'bot',
    }));
    this.ui.updateScoreboard(players, this.round.crewScore, this.round.guardScore);
  }

  // =============================================================== render ==
  private render() {
    if (this.state === 'menu') {
      this.renderer.render(this.menuScene.scene, this.menuScene.camera);
      return;
    }

    const g = Settings.get().graphics;
    const useBloom = this.composer && Settings.get().bloom && (g === 'high' || g === 'ultra');
    if (useBloom && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    // weapon viewmodel overlay (skip in gameover where pointer is free)
    if (this.state === 'playing' || this.state === 'paused') {
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.player.viewmodel.scene, this.player.viewmodel.camera);
      this.renderer.autoClear = true;
    }
  }

  // =============================================================== misc ====
  private applyPixelRatio() {
    const g = Settings.get().graphics;
    const cap = g === 'ultra' ? 2.5 : g === 'high' ? 2 : g === 'medium' ? 1.5 : 1;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
  }

  private applyGraphics() {
    const s = Settings.get();
    this.renderer.shadowMap.enabled = s.shadows && s.graphics !== 'low';
    this.renderer.toneMappingExposure = s.graphics === 'ultra' ? 1.15 : 1.05;
    if (this.bloomPass) {
      this.bloomPass.strength = s.graphics === 'ultra' ? 0.8 : 0.5;
      this.bloomPass.radius = s.graphics === 'ultra' ? 0.7 : 0.5;
    }
    this.applyPixelRatio();
  }

  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.player?.viewmodel.resize(w / h);
    this.menuScene.resize(w / h);
    this.composer?.setSize(w, h);
    this.bloomPass?.setSize(w, h);
  }
}
