import * as THREE from 'three';

export interface WaypointTag {
  site?: 'A' | 'B';
  cover?: boolean;
  sniper?: boolean;
  crewSide?: boolean;
  guardSide?: boolean;
}

interface RawNode {
  id: string;
  x: number;
  z: number;
  tags?: WaypointTag;
}

/**
 * Hand-authored navigation graph for Banana Yard. Edges connect nodes that
 * have a clear straight-line floor path, so bots can A* between any two areas.
 */
const NODES: RawNode[] = [
  // attacker (crew) side
  { id: 'T_SPAWN', x: 0, z: 24, tags: { crewSide: true } },
  { id: 'T_SPLIT', x: 0, z: 18, tags: { crewSide: true } },
  // A lane (west)
  { id: 'A1', x: -15, z: 18 },
  { id: 'A2', x: -16, z: 8, tags: { cover: true } },
  { id: 'A3', x: -16, z: -2 },
  { id: 'A4', x: -15, z: -11 },
  { id: 'SITE_A', x: -14, z: -18, tags: { site: 'A' } },
  { id: 'A_PLAT', x: -18, z: -22, tags: { sniper: true } },
  // mid lane
  { id: 'MID1', x: 0, z: 10 },
  { id: 'MID2', x: 0, z: 2, tags: { cover: true } },
  { id: 'MID3', x: 0, z: -8 },
  { id: 'OPEN_N', x: 0, z: -13 },
  { id: 'A_DOOR', x: -8, z: 2 },
  { id: 'B_DOOR', x: 8, z: 2 },
  // B lane (east)
  { id: 'B1', x: 15, z: 18 },
  { id: 'B2', x: 16, z: 8, tags: { cover: true } },
  { id: 'B3', x: 16, z: -2 },
  { id: 'B4', x: 15, z: -11 },
  { id: 'SITE_B', x: 14, z: -18, tags: { site: 'B' } },
  { id: 'B_PLAT', x: 18, z: -22, tags: { sniper: true } },
  // defender (guard) side
  { id: 'CT_SPAWN', x: 0, z: -24, tags: { guardSide: true } },
  { id: 'CT_SPLIT', x: 0, z: -17, tags: { guardSide: true } },
  { id: 'CT_A', x: -9, z: -17, tags: { cover: true } },
  { id: 'CT_B', x: 9, z: -17, tags: { cover: true } },
];

const EDGES: [string, string][] = [
  ['T_SPAWN', 'T_SPLIT'],
  ['T_SPLIT', 'A1'],
  ['T_SPLIT', 'MID1'],
  ['T_SPLIT', 'B1'],
  // A lane
  ['A1', 'A2'],
  ['A2', 'A3'],
  ['A3', 'A4'],
  ['A4', 'SITE_A'],
  ['SITE_A', 'A_PLAT'],
  ['A3', 'A_DOOR'],
  // mid
  ['MID1', 'MID2'],
  ['MID2', 'MID3'],
  ['MID3', 'OPEN_N'],
  ['MID2', 'A_DOOR'],
  ['MID2', 'B_DOOR'],
  // B lane
  ['B1', 'B2'],
  ['B2', 'B3'],
  ['B3', 'B4'],
  ['B4', 'SITE_B'],
  ['SITE_B', 'B_PLAT'],
  ['B3', 'B_DOOR'],
  // north open area connectors
  ['OPEN_N', 'A4'],
  ['OPEN_N', 'B4'],
  ['OPEN_N', 'CT_SPLIT'],
  ['SITE_A', 'A4'],
  ['SITE_B', 'B4'],
  // defender rotations
  ['CT_SPAWN', 'CT_SPLIT'],
  ['CT_SPLIT', 'CT_A'],
  ['CT_SPLIT', 'CT_B'],
  ['CT_A', 'SITE_A'],
  ['CT_B', 'SITE_B'],
  ['CT_A', 'A4'],
  ['CT_B', 'B4'],
];

export class WaypointNode {
  index: number;
  id: string;
  pos: THREE.Vector3;
  tags: WaypointTag;
  neighbors: WaypointNode[] = [];
  constructor(index: number, id: string, x: number, z: number, tags: WaypointTag) {
    this.index = index;
    this.id = id;
    this.pos = new THREE.Vector3(x, 0, z);
    this.tags = tags;
  }
}

export class WaypointGraph {
  nodes: WaypointNode[] = [];
  private byId = new Map<string, WaypointNode>();

  constructor() {
    NODES.forEach((n, i) => {
      const node = new WaypointNode(i, n.id, n.x, n.z, n.tags ?? {});
      this.nodes.push(node);
      this.byId.set(n.id, node);
    });
    for (const [a, b] of EDGES) {
      const na = this.byId.get(a);
      const nb = this.byId.get(b);
      if (na && nb) {
        na.neighbors.push(nb);
        nb.neighbors.push(na);
      }
    }
  }

  get(id: string): WaypointNode | undefined {
    return this.byId.get(id);
  }

  nodesWithTag(test: (t: WaypointTag) => boolean): WaypointNode[] {
    return this.nodes.filter((n) => test(n.tags));
  }

  siteNode(site: 'A' | 'B'): WaypointNode {
    return this.nodesWithTag((t) => t.site === site)[0];
  }

  nearest(pos: THREE.Vector3): WaypointNode {
    let best = this.nodes[0];
    let bestD = Infinity;
    for (const n of this.nodes) {
      const dx = n.pos.x - pos.x;
      const dz = n.pos.z - pos.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  /** A* over the graph, returns list of world positions (excludes start node). */
  findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    const start = this.nearest(from);
    const goal = this.nearest(to);
    if (start === goal) return [to.clone()];

    const open: WaypointNode[] = [start];
    const cameFrom = new Map<WaypointNode, WaypointNode>();
    const g = new Map<WaypointNode, number>([[start, 0]]);
    const f = new Map<WaypointNode, number>([[start, start.pos.distanceTo(goal.pos)]]);
    const closed = new Set<WaypointNode>();

    while (open.length) {
      // node in open with lowest f
      let ci = 0;
      for (let i = 1; i < open.length; i++) {
        if ((f.get(open[i]) ?? Infinity) < (f.get(open[ci]) ?? Infinity)) ci = i;
      }
      const current = open.splice(ci, 1)[0];
      if (current === goal) {
        return this.reconstruct(cameFrom, current, to);
      }
      closed.add(current);
      for (const nb of current.neighbors) {
        if (closed.has(nb)) continue;
        const tentative = (g.get(current) ?? Infinity) + current.pos.distanceTo(nb.pos);
        if (tentative < (g.get(nb) ?? Infinity)) {
          cameFrom.set(nb, current);
          g.set(nb, tentative);
          f.set(nb, tentative + nb.pos.distanceTo(goal.pos));
          if (!open.includes(nb)) open.push(nb);
        }
      }
    }
    // no path — go straight to target as a fallback
    return [to.clone()];
  }

  private reconstruct(
    cameFrom: Map<WaypointNode, WaypointNode>,
    end: WaypointNode,
    finalTarget: THREE.Vector3
  ): THREE.Vector3[] {
    const path: THREE.Vector3[] = [];
    let cur: WaypointNode | undefined = end;
    while (cur) {
      path.push(cur.pos.clone());
      cur = cameFrom.get(cur);
    }
    path.reverse();
    path.shift(); // drop the start node (we're already there)
    path.push(finalTarget.clone());
    return path;
  }
}
