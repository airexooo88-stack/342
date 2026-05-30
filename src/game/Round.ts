import * as THREE from 'three';
import type { TeamId } from '../core/Config';
import { ROUND } from '../core/Config';
import { Audio } from '../core/AudioSynth';
import type { Character } from '../entities/Character';
import type { Player } from '../entities/Player';
import { SITE_A, SITE_B, SITE_RADIUS } from '../world/Layout';

export type RoundPhase = 'freeze' | 'live' | 'end';
export type WinReason = 'eliminated' | 'detonated' | 'defused' | 'timeout';

export interface RoundEvents {
  onPhase?: (phase: RoundPhase) => void;
  onPlanted?: (site: 'A' | 'B') => void;
  onRoundEnd?: (winner: TeamId, reason: WinReason) => void;
  onMatchEnd?: (winner: TeamId) => void;
}

/**
 * Round lifecycle + objective logic for "Banana Protocol".
 * Crew (attackers) try to plant the Banana Core on Site A or B and let it
 * detonate; Null Guards (defenders) try to defend or defuse.
 */
export class Round {
  phase: RoundPhase = 'freeze';
  timer = ROUND.freezeTime;
  roundNumber = 1;

  crewScore = 0;
  guardScore = 0;

  // bomb / core state
  planted = false;
  site: 'A' | 'B' | null = null;
  pos: THREE.Vector3 | null = null;
  coreTimer = ROUND.coreTimer;
  plantProgress = 0;
  defuseProgress = 0;
  defusing = false;
  planting = false;

  lastWinner: TeamId | null = null;
  lastReason: WinReason | null = null;
  matchOver = false;

  readonly attackers: TeamId = 'crew';
  readonly defenders: TeamId = 'guard';

  private core: THREE.Group;
  private events: RoundEvents;
  private endTimer = 0;
  private beepTimer = 0;

  constructor(scene: THREE.Scene, events: RoundEvents) {
    this.events = events;
    this.core = this.buildCore();
    this.core.visible = false;
    scene.add(this.core);
  }

  private buildCore(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.18, 0.5, 4, 12),
      new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0x6a5200, emissiveIntensity: 0.6, roughness: 0.4 })
    );
    body.rotation.z = 0.5;
    body.position.y = 0.3;
    g.add(body);
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff5470 })
    );
    light.position.set(0.12, 0.55, 0);
    g.add(light);
    g.userData.light = light;
    const pl = new THREE.PointLight(0xff5470, 4, 6, 2);
    pl.position.y = 0.5;
    g.add(pl);
    g.userData.pl = pl;
    return g;
  }

  startRound(roundNumber: number) {
    this.roundNumber = roundNumber;
    this.phase = 'freeze';
    this.timer = ROUND.freezeTime;
    this.planted = false;
    this.site = null;
    this.pos = null;
    this.coreTimer = ROUND.coreTimer;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.defusing = false;
    this.planting = false;
    this.core.visible = false;
    this.endTimer = 0;
    this.events.onPhase?.('freeze');
  }

  private inSiteZone(p: THREE.Vector3): 'A' | 'B' | null {
    if (p.distanceTo(SITE_A) <= SITE_RADIUS) return 'A';
    if (p.distanceTo(SITE_B) <= SITE_RADIUS) return 'B';
    return null;
  }

  /** Whether the player is currently allowed to interact (plant/defuse) here. */
  interactionPrompt(player: Player): string | null {
    if (this.phase !== 'live' || !player.alive) return null;
    if (player.team === this.attackers && !this.planted) {
      if (this.inSiteZone(player.position)) return 'plant';
    }
    if (player.team === this.defenders && this.planted && this.pos) {
      if (player.position.distanceTo(this.pos) <= 2.2) return 'defuse';
    }
    return null;
  }

  update(dt: number, characters: Character[], player: Player, holdingE: boolean) {
    if (this.phase === 'freeze') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.phase = 'live';
        this.timer = ROUND.roundTime;
        this.events.onPhase?.('live');
      }
      return;
    }

    if (this.phase === 'end') {
      this.endTimer -= dt;
      this.updateCoreVisual(dt);
      return;
    }

    // ---- LIVE ----
    this.timer -= dt;

    if (!this.planted) {
      this.handlePlanting(dt, characters, player, holdingE);
    } else {
      this.handleDefusing(dt, characters, player, holdingE);
      this.coreTimer -= dt;
      this.tickBeep(dt);
    }

    this.updateCoreVisual(dt);
    this.checkWinConditions(characters);
  }

  private handlePlanting(dt: number, characters: Character[], player: Player, holdingE: boolean) {
    let planterSite: 'A' | 'B' | null = null;

    // human planter
    if (player.team === this.attackers && player.alive && holdingE) {
      planterSite = this.inSiteZone(player.position);
    }
    // bot planter
    if (!planterSite) {
      for (const c of characters) {
        if (!c.alive || c.team !== this.attackers || !c.isBot) continue;
        if ((c as any).state === 'Plant') {
          const z = this.inSiteZone(c.position);
          if (z) {
            planterSite = z;
            break;
          }
        }
      }
    }

    if (planterSite) {
      if (!this.planting) Audio.beep();
      this.planting = true;
      this.plantProgress += dt;
      if (this.plantProgress >= ROUND.plantTime) {
        this.completePlant(planterSite);
      }
    } else {
      this.planting = false;
      this.plantProgress = Math.max(0, this.plantProgress - dt * 2);
    }
  }

  private completePlant(site: 'A' | 'B') {
    this.planted = true;
    this.site = site;
    this.pos = (site === 'A' ? SITE_A : SITE_B).clone();
    this.coreTimer = ROUND.coreTimer;
    this.core.position.copy(this.pos);
    this.core.visible = true;
    this.planting = false;
    Audio.beep();
    this.events.onPlanted?.(site);
  }

  private handleDefusing(dt: number, characters: Character[], player: Player, holdingE: boolean) {
    if (!this.pos) return;
    let defuser = false;

    if (player.team === this.defenders && player.alive && holdingE) {
      if (player.position.distanceTo(this.pos) <= 2.2) defuser = true;
    }
    if (!defuser) {
      for (const c of characters) {
        if (!c.alive || c.team !== this.defenders || !c.isBot) continue;
        if ((c as any).state === 'Defuse' && c.position.distanceTo(this.pos) <= 2.0) {
          defuser = true;
          break;
        }
      }
    }

    if (defuser) {
      if (!this.defusing) Audio.beep();
      this.defusing = true;
      this.defuseProgress += dt;
      if (this.defuseProgress >= ROUND.defuseTime) {
        this.endRound('guard', 'defused');
      }
    } else {
      this.defusing = false;
      this.defuseProgress = Math.max(0, this.defuseProgress - dt * 1.5);
    }
  }

  private tickBeep(dt: number) {
    this.beepTimer -= dt;
    if (this.beepTimer <= 0) {
      Audio.beep();
      // beep faster as detonation approaches
      this.beepTimer = Math.max(0.12, this.coreTimer / 18);
    }
  }

  private updateCoreVisual(dt: number) {
    this._t += dt;
    if (!this.core.visible) return;
    const light = this.core.userData.light as THREE.Mesh;
    const pl = this.core.userData.pl as THREE.PointLight;
    const blink = (Math.sin(this._t * 8) + 1) * 0.5;
    (light.material as THREE.MeshBasicMaterial).color.setHex(blink > 0.5 ? 0xff5470 : 0x331018);
    pl.intensity = 2 + blink * 4;
  }

  private _t = 0;

  private aliveCount(characters: Character[], team: TeamId): number {
    let n = 0;
    for (const c of characters) if (c.team === team && c.alive) n++;
    return n;
  }

  private checkWinConditions(characters: Character[]) {
    const crewAlive = this.aliveCount(characters, 'crew');
    const guardAlive = this.aliveCount(characters, 'guard');

    if (!this.planted) {
      if (guardAlive === 0) return this.endRound('crew', 'eliminated');
      if (crewAlive === 0) return this.endRound('guard', 'eliminated');
      if (this.timer <= 0) return this.endRound('guard', 'timeout');
    } else {
      if (this.coreTimer <= 0) return this.endRound('crew', 'detonated');
      // if all defenders dead and core is live, attackers win (nobody left to defuse)
      if (guardAlive === 0) return this.endRound('crew', 'detonated');
    }
  }

  private endRound(winner: TeamId, reason: WinReason) {
    if (this.phase === 'end') return;
    this.phase = 'end';
    this.endTimer = ROUND.endDelay;
    this.lastWinner = winner;
    this.lastReason = reason;
    if (winner === 'crew') this.crewScore++;
    else this.guardScore++;

    if (reason === 'detonated') Audio.explosion();

    this.events.onPhase?.('end');
    this.events.onRoundEnd?.(winner, reason);

    if (this.crewScore >= ROUND.scoreToWin || this.guardScore >= ROUND.scoreToWin) {
      this.matchOver = true;
      this.events.onMatchEnd?.(this.crewScore > this.guardScore ? 'crew' : 'guard');
    }
  }

  get readyForNextRound(): boolean {
    return this.phase === 'end' && this.endTimer <= 0 && !this.matchOver;
  }

  /** Seconds remaining shown on the HUD (core timer once planted). */
  get displayTime(): number {
    return this.planted ? Math.max(0, this.coreTimer) : Math.max(0, this.timer);
  }
}
