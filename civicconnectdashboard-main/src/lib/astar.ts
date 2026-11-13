// ═══════════════════════════════════════════════════════════════════════════════
// ─── A* PATHFINDING ALGORITHM ENGINE (Belagavi Road Network) ───────────────────
// ═══════════════════════════════════════════════════════════════════════════════
// Formula: f(n) = g(n) + h(n)
//   - g(n): Actual road cost traveled from Start to node n (distance × congestion)
//   - h(n): Heuristic estimate from node n to Goal (Haversine straight-line distance)
//   - f(n): Total estimated cost through node n (lowest gets popped first)
// ═══════════════════════════════════════════════════════════════════════════════

// 1. Data Structure: Node in the road graph (Intersection)
export interface RoadNode {
  id: string;      // Unique identifier (e.g. 'rpd')
  name: string;    // Human-readable landmark name
  lat: number;     // Latitude coordinate
  lng: number;     // Longitude coordinate
}

// 2. Data Structure: Directed edge in the road graph
export interface RoadEdge {
  to: string;         // Target node ID
  weight: number;     // Real road distance in kilometers
  congestion: number; // Cost multiplier (1.0 = clear, 1.5 = moderate, 1.8+ = heavy)
  road: string;       // Road name for turn-by-turn directions
}

// 3. Belagavi Road Graph: 15 Real Landmark Intersections
export const BELAGAVI_NODES: RoadNode[] = [
  { id: "rpd",      name: "RPD Cross",            lat: 15.8497, lng: 74.4977 },
  { id: "rcircle",  name: "Rani Channamma Circle",lat: 15.8520, lng: 74.5020 },
  { id: "college",  name: "College Road",          lat: 15.8440, lng: 74.5040 },
  { id: "khana",    name: "Khanapur Road",         lat: 15.8600, lng: 74.4900 },
  { id: "kls",      name: "KLS Bank Cross",        lat: 15.8560, lng: 74.5000 },
  { id: "angol",    name: "Angol",                 lat: 15.8380, lng: 74.4950 },
  { id: "camp",     name: "Camp Area",             lat: 15.8360, lng: 74.5080 },
  { id: "bogarvs",  name: "Bogarves",              lat: 15.8525, lng: 74.5085 },
  { id: "udyambag", name: "Udyambag",              lat: 15.8450, lng: 74.5120 },
  { id: "gokak",    name: "Gokak Road",            lat: 15.8650, lng: 74.4800 },
  { id: "nehru",    name: "Nehru Nagar",           lat: 15.8480, lng: 74.5200 },
  { id: "market",   name: "City Market",           lat: 15.8395, lng: 74.5000 },
  { id: "station",  name: "Railway Station",       lat: 15.8420, lng: 74.4870 },
  { id: "airport",  name: "Sambra Airport",        lat: 15.8625, lng: 74.6183 },
  { id: "unkal",    name: "Unkal Lake Road",       lat: 15.8740, lng: 74.5050 },
];

// 4. Data Structure: Adjacency List for the Road Network
export const BELAGAVI_EDGES: Record<string, RoadEdge[]> = {
  rpd: [
    { to: "rcircle", weight: 0.65, congestion: 1.8, road: "College Road" },
    { to: "khana",   weight: 1.60, congestion: 1.1, road: "Khanapur Rd" },
    { to: "station", weight: 0.90, congestion: 1.2, road: "Station Rd" },
    { to: "angol",   weight: 1.10, congestion: 1.0, road: "Angol Link Rd" },
  ],
  rcircle: [
    { to: "rpd",     weight: 0.65, congestion: 1.8, road: "College Road" },
    { to: "bogarvs", weight: 0.80, congestion: 1.5, road: "Bogarves Rd" },
    { to: "kls",     weight: 0.55, congestion: 1.3, road: "KLS Cross Rd" },
    { to: "college", weight: 0.75, congestion: 1.4, road: "College Road" },
  ],
  college: [
    { to: "rcircle", weight: 0.75, congestion: 1.4, road: "College Road" },
    { to: "camp",    weight: 0.90, congestion: 1.0, road: "Camp Road" },
    { to: "market",  weight: 0.60, congestion: 1.2, road: "Market Road" },
  ],
  khana: [
    { to: "rpd",     weight: 1.60, congestion: 1.1, road: "Khanapur Rd" },
    { to: "gokak",   weight: 1.20, congestion: 1.0, road: "NH-548K" },
    { to: "kls",     weight: 0.70, congestion: 1.0, road: "Ring Road" },
    { to: "unkal",   weight: 1.30, congestion: 1.0, road: "Unkal Bridge" },
  ],
  kls: [
    { to: "rcircle", weight: 0.55, congestion: 1.3, road: "KLS Cross Rd" },
    { to: "khana",   weight: 0.70, congestion: 1.0, road: "Ring Road" },
    { to: "bogarvs", weight: 0.60, congestion: 1.2, road: "Bogarvs Link" },
    { to: "unkal",   weight: 1.00, congestion: 1.0, road: "Unkal Rd" },
  ],
  angol: [
    { to: "rpd",     weight: 1.10, congestion: 1.0, road: "Angol Rd" },
    { to: "station", weight: 0.75, congestion: 1.0, road: "Station Link" },
    { to: "market",  weight: 0.80, congestion: 1.1, road: "Market Rd" },
  ],
  camp: [
    { to: "college", weight: 0.90, congestion: 1.0, road: "Camp Rd" },
    { to: "market",  weight: 0.70, congestion: 1.0, road: "Market Access" },
    { to: "udyambag",weight: 0.65, congestion: 1.0, road: "Udyambag Rd" },
  ],
  bogarvs: [
    { to: "rcircle", weight: 0.80, congestion: 1.5, road: "Bogarves Rd" },
    { to: "kls",     weight: 0.60, congestion: 1.2, road: "Bogarvs Link" },
    { to: "nehru",   weight: 0.90, congestion: 1.0, road: "Nehru Link" },
    { to: "udyambag",weight: 0.70, congestion: 1.1, road: "Udyambag Blvd" },
  ],
  udyambag: [
    { to: "bogarvs", weight: 0.70, congestion: 1.1, road: "Udyambag Blvd" },
    { to: "camp",    weight: 0.65, congestion: 1.0, road: "Camp Access" },
    { to: "nehru",   weight: 0.80, congestion: 1.0, road: "Nehru Rd" },
    { to: "airport", weight: 8.50, congestion: 1.0, road: "Airport Rd NH-548" },
  ],
  gokak: [
    { to: "khana",   weight: 1.20, congestion: 1.0, road: "NH-548K" },
    { to: "unkal",   weight: 1.50, congestion: 1.0, road: "Unkal Bypass" },
  ],
  nehru: [
    { to: "bogarvs", weight: 0.90, congestion: 1.0, road: "Nehru Link" },
    { to: "udyambag",weight: 0.80, congestion: 1.0, road: "Nehru Rd" },
    { to: "airport", weight: 7.80, congestion: 1.0, road: "Airport Expressway" },
  ],
  market: [
    { to: "college", weight: 0.60, congestion: 1.2, road: "Market Rd" },
    { to: "angol",   weight: 0.80, congestion: 1.1, road: "Angol Rd" },
    { to: "camp",    weight: 0.70, congestion: 1.0, road: "Market Access" },
    { to: "station", weight: 0.55, congestion: 1.1, road: "Station Rd" },
  ],
  station: [
    { to: "rpd",     weight: 0.90, congestion: 1.2, road: "Station Rd" },
    { to: "angol",   weight: 0.75, congestion: 1.0, road: "Station Link" },
    { to: "market",  weight: 0.55, congestion: 1.1, road: "Station Rd" },
  ],
  airport: [
    { to: "udyambag",weight: 8.50, congestion: 1.0, road: "NH-548" },
    { to: "nehru",   weight: 7.80, congestion: 1.0, road: "Airport Expressway" },
  ],
  unkal: [
    { to: "khana",   weight: 1.30, congestion: 1.0, road: "Unkal Bridge" },
    { to: "kls",     weight: 1.00, congestion: 1.0, road: "Unkal Rd" },
    { to: "gokak",   weight: 1.50, congestion: 1.0, road: "Unkal Bypass" },
  ],
};

// 5. Heuristic Function h(n): Haversine Great-Circle Distance
// This provides an admissible heuristic (h(n) <= true distance), guaranteeing an optimal path.
export function haversine(a: RoadNode, b: RoadNode): number {
  const R = 6371; // Earth radius in kilometers
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const chord =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinLng *
      sinLng;
  return R * 2 * Math.atan2(Math.sqrt(chord), Math.sqrt(1 - chord));
}

// 6. A* Output Interface
export interface AStarResult {
  path: RoadNode[];        // Ordered node array from Start to Goal
  roads: string[];         // Road name for each step
  totalKm: number;         // Total distance in km
  totalMins: number;       // Estimated travel time in minutes
  nodesExplored: number;   // Number of nodes opened from priority queue
  congestionLevel: string; // Traffic classification
  avoided: string[];       // Congested segments avoided by A*
}

// 7. Core A* Search Function
export function runAStar(startId: string, goalId: string): AStarResult | null {
  const nodes = Object.fromEntries(BELAGAVI_NODES.map((n) => [n.id, n]));
  if (!nodes[startId] || !nodes[goalId]) return null;

  // Priority Queue Entry
  interface PQEntry {
    id: string;
    fScore: number;
  }

  // Priority Queue (Min-Heap behavior sorted by fScore)
  const openSet: PQEntry[] = [];
  const gScore: Record<string, number> = {};  // Best known distance from Start to n
  const fScore: Record<string, number> = {};  // f(n) = g(n) + h(n)
  const cameFrom: Record<string, string> = {}; // Parent pointers for path reconstruction
  const cameVia: Record<string, string> = {};  // Road labels for turn-by-turn directions
  const congestionUsed: Record<string, number> = {};

  // Initialize scores to Infinity
  BELAGAVI_NODES.forEach((n) => {
    gScore[n.id] = Infinity;
    fScore[n.id] = Infinity;
  });

  // Start node initialization
  gScore[startId] = 0;
  fScore[startId] = haversine(nodes[startId], nodes[goalId]);
  openSet.push({ id: startId, fScore: fScore[startId] });

  // Closed set tracks visited nodes to prevent redundant evaluation
  const closedSet = new Set<string>();
  let nodesExplored = 0;
  const avoided: string[] = [];

  while (openSet.length > 0) {
    // Pop node with lowest fScore (most promising node)
    openSet.sort((a, b) => a.fScore - b.fScore);
    const current = openSet.shift()!;

    // Goal Check: Path Found!
    if (current.id === goalId) {
      const path: RoadNode[] = [];
      const roads: string[] = [];
      let cur = goalId;

      // Reconstruct path by following parent pointers backward
      while (cameFrom[cur]) {
        path.unshift(nodes[cur]);
        roads.unshift(cameVia[cur]);
        cur = cameFrom[cur];
      }
      path.unshift(nodes[startId]);

      const totalKm = parseFloat(gScore[goalId].toFixed(2));
      const congestionValues = Object.values(congestionUsed);
      const avgCongestion =
        congestionValues.length > 0
          ? congestionValues.reduce((a, b) => a + b, 0) / congestionValues.length
          : 1.0;
      const totalMins = Math.round((totalKm / 30) * 60 * avgCongestion);
      const congestionLevel =
        avgCongestion > 1.5 ? "Heavy Traffic" : avgCongestion > 1.2 ? "Moderate" : "Clear Roads";

      return {
        path,
        roads,
        totalKm,
        totalMins,
        nodesExplored,
        congestionLevel,
        avoided,
      };
    }

    closedSet.add(current.id);
    nodesExplored++;

    // Evaluate neighbors
    const neighbors = BELAGAVI_EDGES[current.id] || [];
    for (const edge of neighbors) {
      if (closedSet.has(edge.to)) continue;

      // Real-time congestion check: Avoid roads with congestion multiplier > 1.7
      if (edge.congestion > 1.7) {
        const avoidLabel = `${nodes[current.id].name} → ${nodes[edge.to].name} (${edge.road})`;
        if (!avoided.includes(avoidLabel)) avoided.push(avoidLabel);
        continue;
      }

      // Tentative gScore = current gScore + (road distance * traffic multiplier)
      const tentativeG = gScore[current.id] + edge.weight * edge.congestion;

      if (tentativeG < gScore[edge.to]) {
        // Found a strictly better path to neighbor!
        cameFrom[edge.to] = current.id;
        cameVia[edge.to] = edge.road;
        congestionUsed[edge.to] = edge.congestion;
        gScore[edge.to] = tentativeG;
        fScore[edge.to] = tentativeG + haversine(nodes[edge.to], nodes[goalId]);

        if (!openSet.find((e) => e.id === edge.to)) {
          openSet.push({ id: edge.to, fScore: fScore[edge.to] });
        }
      }
    }
  }

  return null; // No path found
}
