import type { IGameWorld } from '../core/Types';
import type { TeamId } from '../core/Config';
import { Bot, type BotRole } from '../entities/Bot';

const CREW_NAMES = ['Peel', 'Splitz', 'Mango', 'Rind', 'Cavendish', 'Plantain', 'Nanner'];
const GUARD_NAMES = ['Null', 'Cipher', 'Vault', 'Static', 'Proxy', 'Daemon', 'Kernel'];

const ROLE_CYCLE: BotRole[] = ['entry', 'support', 'sniper', 'defender'];

/** Build a roster of AI bots for a team, assigning roles and bomb sites. */
export function createTeam(world: IGameWorld, team: TeamId, count: number): Bot[] {
  const names = (team === 'crew' ? CREW_NAMES : GUARD_NAMES).slice();
  const bots: Bot[] = [];
  for (let i = 0; i < count; i++) {
    const role: BotRole = team === 'guard' && i === 0 ? 'defender' : ROLE_CYCLE[i % ROLE_CYCLE.length];
    const site: 'A' | 'B' = i % 2 === 0 ? 'A' : 'B';
    const name = names.shift() ?? `${team === 'crew' ? 'Crew' : 'Guard'}-${i + 1}`;
    bots.push(new Bot(world, team, name, role, site));
  }
  return bots;
}
