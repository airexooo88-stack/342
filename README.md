# Clutch Ops: Banana Protocol 🍌

An **original** browser 3D FPS prototype — a parody of the round-based bomb/defuse
tactical-shooter genre. Built with **TypeScript + Vite + Three.js**. Every model,
texture, sound, weapon, map and UI element is **procedurally generated at runtime**:
zero third-party assets, and not affiliated with or derived from any existing
commercial game, brand, map or asset.

Play 5v5 against smart AI bots: plant the **Banana Core** on Site A/B as the
**Protocol Crew**, or hold the line as the **Null Guards**.

---

## Quick start

```bash
npm install
npm run dev      # open http://localhost:5173
```

Build for production:

```bash
npm run build    # type-checks then bundles to dist/
npm run preview  # serve the production build
```

> Requires a WebGL-capable browser. Click **Play vs Bots** (this also grabs the
> pointer lock and enables audio).

---

## Controls

| Action | Key |
|---|---|
| Move | `W A S D` |
| Look | Mouse (Pointer Lock) |
| Fire | Left Mouse |
| Aim (ADS) | Right Mouse |
| Reload | `R` |
| Switch weapon | `1` / `2` / `3` / Mouse Wheel |
| Jump | `Space` |
| Crouch | `Ctrl` / `C` |
| Walk (quiet) | `Shift` |
| Plant / Defuse | Hold `E` |
| Scoreboard | `Tab` |
| Pause | `Esc` |

---

## Architecture

The codebase is modular and dependency-light. Entities never import the `Game`
class directly — they depend on the `IGameWorld` interface, keeping the graph
acyclic.

```
src/
├── main.ts                 # entry point, boots Game
├── core/
│   ├── Game.ts             # orchestrator; implements IGameWorld; render + state machine
│   ├── Types.ts            # IGameWorld contract + shared types
│   ├── Config.ts           # all tunable constants (teams, round, player, bots, difficulty)
│   ├── Settings.ts         # persisted settings store (localStorage + pub/sub)
│   ├── Input.ts            # keyboard/mouse + Pointer Lock
│   ├── AudioSynth.ts       # procedural WebAudio SFX (no audio files)
│   └── MathUtils.ts        # clamp/lerp/damp/angle helpers
├── world/
│   ├── Layout.ts           # shared map coordinates (sites, spawns, blocks)
│   ├── Collision.ts        # custom AABB collision world + slab raycast + LOS
│   ├── MapBanana.ts        # "Banana Yard" geometry, colliders, lights, radar shapes
│   ├── Materials.ts        # procedural canvas-texture materials
│   └── Waypoints.ts        # navigation graph + A* pathfinding
├── entities/
│   ├── Character.ts        # base: health/armor/team/hitboxes/damage; bot mesh builder
│   ├── Player.ts           # FPS controller: movement, ADS, recoil, shooting
│   └── Bot.ts              # AI: vision/hearing/memory + state machine + combat + nav
├── weapons/
│   ├── WeaponDefs.ts       # Spray-47 / Click-9 / Bonk Knife stats
│   ├── Weapon.ts           # runtime ammo/recoil/reload logic
│   └── Viewmodel.ts        # first-person weapon overlay (own scene/camera)
├── game/
│   ├── Teams.ts            # bot roster creation (roles + site assignment)
│   └── Round.ts            # round lifecycle, plant/defuse, win conditions, scoring
├── fx/
│   └── Effects.ts          # pooled tracers / muzzle flashes / impacts / blood / decals
└── ui/
    ├── UI.ts               # all DOM screens + HUD + radar canvas
    ├── MenuScene.ts        # rotating-weapon menu background scene
    └── styles.css          # original cyber-industrial styling
```

### Why a custom collision system (not Rapier/Cannon)?
For a hitscan FPS on a boxy arena, a tiny, deterministic AABB solver (capsule-as-box,
per-axis resolution with auto step-up + slab raycasting) is more reliable and
dependency-free than loading a physics WASM engine. To swap in a real engine later,
replace `world/Collision.ts` and feed `MapBanana`'s box list into the engine; the
rest of the game only talks to `moveCharacter()` / `raycast()` / `lineOfSight()`.

### AI overview
Each bot runs: **perception** (FOV cone + line-of-sight raycast + hearing of
gunshots/footsteps/plant) → **memory** (last-known enemy position, timers) →
**decision** (engage / search / play the objective) → **action** (A* navigation,
combat aim with difficulty-scaled error + reaction delay, strafing, cover, pistol
fallback while reloading). States: `Idle, Patrol, Search, Attack, TakeCover,
RotateToSite, Plant, Defuse, Retreat`. Roles: `entry, support, sniper, defender`.

---

## Implemented features

- Main menu with animated 3D background, hover/click feedback, Settings / Controls / Credits.
- Settings: mouse sensitivity, FOV, master volume, graphics quality, bloom/shadows, bot difficulty (persisted).
- Loading screen, pause menu, round-win/round-loss banners, match game-over screen.
- Original competitive map **Banana Yard**: 2 lanes + mid, Site A & B, doorways, cover, balconies/stairs (verticality), perimeter & interior colliders, neon-industrial lighting.
- Round system: freeze time, round timer, plant the Banana Core, post-plant detonation timer, defuse, elimination & timeout win conditions, per-round score, auto round restart, first-to-N match.
- Player controller: WASD, Pointer Lock look, jump, crouch (with headroom check), run/quiet-walk, ADS, weapon switching.
- 3 original weapons (Spray-47 auto rifle, Click-9 pistol, Bonk Knife) with recoil/spread/recoil-bloom, camera kick, muzzle flash, tracers, hitscan with head/body/legs zones, armor mitigation, magazines + reserve + reload, procedural viewmodels with sway/bob/reload/melee animation.
- Smart bots (see AI overview) that **play the objective**, not just chase the player.
- HUD: health/armor, ammo, round timer, score, alive counts, objective text, dynamic-spread crosshair, hit markers, kill feed, directional damage indicator, plant/defuse progress ring, scoreboard (Tab), minimap radar.
- FX: object-pooled tracers/muzzle flashes/particles/decals, procedural WebAudio gunfire, hits, reloads, beeps, explosion and UI sounds.
- Performance: `requestAnimationFrame` with delta clamping, pooled FX, shared geometries/materials, adjustable pixel ratio & quality.

---

## How to extend

- **Balance:** tweak `src/core/Config.ts` (`ROUND`, `PLAYER`, `BOT`, `DIFFICULTY`).
- **New weapon:** add an entry to `WEAPON_DEFS` and `LOADOUT_ORDER`, then a model in `Viewmodel.ts` (and optionally HUD slot labels).
- **Edit the map:** change boxes/cover in `MapBanana.ts` and keep `Waypoints.ts` nodes/edges consistent (both share `Layout.ts`). The radar reads `MapBanana.radarShapes`.
- **Smarter AI:** extend the `Bot` state machine (e.g. utility scoring, grenades, coordinated executes), or add cover/peek nodes via waypoint `tags`.
- **Networking:** the `Character`/`IGameWorld` split is a natural seam for an authoritative server.

---

## TODO (prototype → full game)

- Buy menu / economy, weapon pickups, grenades & utility (smoke/flash).
- Proper navmesh (or denser waypoint grid) + dynamic obstacle avoidance.
- Ragdolls/death animations, footstep occlusion, 3D positional audio (PannerNode).
- Spectator/free-cam after death, killcam, demo replays.
- Side-switching at halftime, overtime, more maps.
- Asset upgrade: skinned character models, GLTF weapons, baked lightmaps.
- Multiplayer netcode with lag compensation; server-authoritative hit reg.
- Accessibility & rebindable controls, gamepad support, mobile layout.
- Automated tests for collision/raycast/round logic.

---

*All content is original and procedurally generated. 🍌*
