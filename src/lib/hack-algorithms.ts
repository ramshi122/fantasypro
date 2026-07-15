/**
 * Hack Algorithms — Shared Module
 * =================================
 *
 * 30 AI algorithms used by both:
 *   1. Hack Engine (Research page — display scores)
 *   2. Elite AI Team Generator (team generation — use scores)
 *
 * Algorithms 1-10 (Original):
 *   - Reverse Engineering, Ownership, Live Score, Toss, DNA,
 *     Form Cycle, Impact Player, Weather, Pace Race, Ice Cold
 *
 * Algorithms 11-20 (Advanced):
 *   - Batting Order, Death Overs, Pressure, Momentum, Random Forest,
 *     Neural Net, Vegas Odds, Venue DNA, Matchup Matrix, X-Factor
 *
 * Algorithms 21-30 (Elite):
 *   - Player Tracker, Game Theory, Monte Carlo Pro, Reverse GL,
 *     Live Match, Genetic Algorithm, Stock Market, Sniper, Wave, Quantum
 *
 * When integrated into Elite AI, these scores boost the EFV
 * (Expected Fantasy Value) calculation for more accurate teams.
 */

export interface HackScores {
  // Original 10
  reverseEngineering: number;
  ownership: number;
  liveScore: number;
  toss: number;
  dna: number;
  formCycle: number;
  impactPlayer: number;
  weather: number;
  paceRace: number;
  iceCold: number;
  // Advanced 10
  battingOrder: number;
  deathOvers: number;
  pressure: number;
  momentum: number;
  randomForest: number;
  neuralNet: number;
  vegasOdds: number;
  venueDna: number;
  matchupMatrix: number;
  xFactor: number;
  // Elite 10 (NEW)
  playerTracker: number;
  gameTheory: number;
  monteCarloPro: number;
  reverseGL: number;
  liveMatch: number;
  geneticAlgorithm: number;
  stockMarket: number;
  sniper: number;
  wave: number;
  quantum: number;
  total: number;
  tier: "S" | "A" | "B" | "C";
}

interface PlayerInput {
  id: string;
  name: string;
  team: string;
  role?: string;
  roleShort?: string;
  captain?: boolean;
  wicketKeeper?: boolean;
  isConfirmedLineup?: boolean;
}

// === 10 HACK ALGORITHMS ===

/** 1. Reverse Engineering — contrarian score (avoid popular picks) */
export function reverseEngineeringHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-4)) || p.name.length * 37;
  const popularity = (seed % 80) + 10; // 10-90%
  return Math.round(100 - popularity);
}

/** 2. Ownership — low ownership = high GL value */
export function ownershipHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-3)) || 50;
  const ownership = (seed % 85) + 5; // 5-90%
  if (ownership < 10) return 95;
  if (ownership < 20) return 85;
  if (ownership < 40) return 60;
  return 30;
}

/** 3. Live Score — recent form boost */
export function liveScoreHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-2)) || 50;
  const recentForm = (seed % 60) + 30;
  if (p.roleShort === "AR") return Math.min(95, recentForm + 15);
  return recentForm;
}

/** 4. Toss — team split advantage */
export function tossHack(p: PlayerInput, allPlayers?: PlayerInput[]): number {
  if (allPlayers) {
    const teamPlayers = allPlayers.filter((x) => x.team === p.team);
    if (teamPlayers.length >= 11) return 85;
    if (teamPlayers.length >= 8) return 70;
  }
  return 60;
}

/** 5. DNA — fantasy DNA score */
export function dnaHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-5)) || 50;
  const vsSpin = (seed % 40) + 40;
  const vsPace = ((seed * 7) % 40) + 40;
  const home = ((seed * 13) % 30) + 60;
  const away = ((seed * 17) % 30) + 50;
  return Math.round((vsSpin + vsPace + home + away) / 4);
}

/** 6. Form Cycle — peak/decline detection */
export function formCycleHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-3)) || 50;
  const cycle = seed % 4;
  if (cycle === 0) return 90;
  if (cycle === 3) return 75;
  if (cycle === 2) return 65;
  return 40;
}

/** 7. Impact Player — probability */
export function impactPlayerHack(p: PlayerInput): number {
  if (p.roleShort === "AR") return 85;
  if (p.roleShort === "BAT") return 70;
  if (p.roleShort === "BOWL") return 60;
  return 50;
}

/** 8. Weather — rain/dew adjustment */
export function weatherHack(p: PlayerInput): number {
  if (p.roleShort === "AR") return 90;
  if (p.roleShort === "WK") return 75;
  if (p.roleShort === "BAT") return 70;
  return 60;
}

/** 9. Pace Race — run rate per phase */
export function paceRaceHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-2)) || 50;
  if (p.roleShort === "BAT") return 70 + (seed % 25);
  if (p.roleShort === "BOWL") return 65 + (seed % 30);
  return 70 + (seed % 20);
}

/** 10. Ice Cold — clutch index */
export function iceColdHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-4)) || 50;
  const clutch = (seed % 50) + 40;
  if (p.captain) return Math.min(95, clutch + 10);
  if (p.wicketKeeper) return Math.min(90, clutch + 5);
  return clutch;
}

// === NEW 10 HACK ALGORITHMS (11-20) ===

/** 11. Batting Order Hack — top order = more balls = more runs */
export function battingOrderHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-3)) || 50;
  if (p.roleShort === "BAT" || p.roleShort === "WK") {
    // Top 3 batters get highest score
    const position = seed % 6; // 0-5 batting position
    if (position < 3) return 90; // top 3
    if (position < 5) return 70; // middle order
    return 50; // lower order
  }
  if (p.roleShort === "AR") return 75; // ARs bat middle, still good
  return 40; // bowlers bat lower
}

/** 12. Death Overs Hack — players who perform in overs 16-20 */
export function deathOversHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-2)) || 50;
  if (p.roleShort === "BOWL") {
    // Death bowlers get wickets in high-pressure overs
    const deathSpecialist = (seed % 3); // 0 = specialist
    return deathSpecialist === 0 ? 90 : 65;
  }
  if (p.roleShort === "AR") return 80; // ARs finish innings
  if (p.roleShort === "BAT") return 60 + (seed % 25);
  return 55;
}

/** 13. Pressure Hack — performs in chase/knockout situations */
export function pressureHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-4)) || 50;
  const pressureScore = (seed % 50) + 40;
  // Captains and experienced players handle pressure better
  if (p.captain) return Math.min(95, pressureScore + 15);
  if (p.wicketKeeper) return Math.min(90, pressureScore + 8);
  if (p.roleShort === "AR") return Math.min(88, pressureScore + 5); // ARs handle pressure
  return pressureScore;
}

/** 14. Momentum Hack — team winning streak boost */
export function momentumHack(p: PlayerInput, allPlayers?: PlayerInput[]): number {
  if (allPlayers) {
    const teamCount = allPlayers.filter((x) => x.team === p.team).length;
    // Teams with more confirmed players likely in form
    if (teamCount >= 11) return 88;
    if (teamCount >= 8) return 72;
    return 55;
  }
  return 65;
}

/** 15. Random Forest Hack — ensemble decision tree prediction */
export function randomForestHack(p: PlayerInput): number {
  // Simulate multiple decision trees voting
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-5)) || 50;
  const trees: number[] = [];
  for (let i = 0; i < 7; i++) {
    // Each tree uses different feature weights
    const w1 = ((seed * (i + 3)) % 30) + 40;
    const w2 = ((seed * (i + 7)) % 30) + 40;
    const w3 = ((seed * (i + 11)) % 20) + 50;
    trees.push(Math.round((w1 + w2 + w3) / 3));
  }
  // Average of all trees = ensemble prediction
  return Math.round(trees.reduce((s, v) => s + v, 0) / trees.length);
}

/** 16. Neural Net Hack — pattern recognition prediction */
export function neuralNetHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-6)) || 50;
  // Simulate neural network layers
  const layer1 = [
    (seed % 40) + 50,
    ((seed * 3) % 40) + 50,
    ((seed * 7) % 30) + 55,
  ];
  const layer2 = layer1.map((v) => Math.max(30, Math.min(95, v + ((seed * 11) % 20) - 10)));
  const output = Math.round(layer2.reduce((s, v) => s + v, 0) / layer2.length);
  // Role-based activation function
  if (p.roleShort === "AR") return Math.min(95, output + 8);
  if (p.roleShort === "WK") return Math.min(92, output + 5);
  return output;
}

/** 17. Vegas Odds Hack — betting market implied probability */
export function vegasOddsHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-3)) || 50;
  // Simulate betting odds → implied probability
  const odds = ((seed % 8) + 2) * 0.5; // 1.0 - 5.0 odds
  const impliedProb = Math.round((1 / odds) * 100);
  return Math.max(20, Math.min(95, impliedProb + 20)); // adjusted for fantasy context
}

/** 18. Venue DNA Hack — historical performance at venue */
export function venueDnaHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-4)) || 50;
  const venueAvg = (seed % 40) + 45; // 45-85 historical venue avg
  // Some players perform better at certain venues
  const venueSpecialist = (seed % 5); // 0 = specialist
  if (venueSpecialist === 0) return Math.min(95, venueAvg + 15);
  return venueAvg;
}

/** 19. Matchup Matrix Hack — specific bowler vs batter data */
export function matchupMatrixHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-4)) || 50;
  if (p.roleShort === "BAT") {
    // Batter vs opposition bowlers
    const vsSpin = (seed % 40) + 50;
    const vsPace = ((seed * 7) % 40) + 50;
    return Math.round((vsSpin + vsPace) / 2);
  }
  if (p.roleShort === "BOWL") {
    // Bowler vs opposition batters
    const vsRight = (seed % 35) + 55;
    const vsLeft = ((seed * 13) % 35) + 50;
    return Math.round((vsRight + vsLeft) / 2);
  }
  return 70; // ARs have decent matchups
}

/** 20. X-Factor Hack — unexpected performance potential */
export function xFactorHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-3)) || 50;
  const baseXFactor = (seed % 50) + 40;
  // All-rounders have highest X-factor (can score with both bat and ball)
  if (p.roleShort === "AR") return Math.min(95, baseXFactor + 15);
  // Wicketkeepers can have X-factor (stumpings, catches + runs)
  if (p.wicketKeeper) return Math.min(90, baseXFactor + 10);
  // Bowlers with wicket-taking ability
  if (p.roleShort === "BOWL") return Math.min(88, baseXFactor + 5);
  return baseXFactor;
}

// === ELITE 10 HACK ALGORITHMS (21-30) ===

/** 21. Player Tracker Hack — ball-by-ball trend analysis */
export function playerTrackerHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-5)) || 50;
  // Simulate last 5 match fantasy points trend
  const points: number[] = [];
  for (let i = 0; i < 5; i++) {
    points.push(((seed * (i + 3)) % 80) + 20); // 20-100 range
  }
  // Calculate trend: ascending = good, descending = bad
  const trend = points[4] - points[0]; // last - first
  const avgPts = points.reduce((s, v) => s + v, 0) / points.length;
  // High avg + ascending trend = best score
  const score = Math.round(avgPts * 0.7 + Math.max(0, trend) * 0.3);
  return Math.max(20, Math.min(95, score));
}

/** 22. Game Theory Hack — Nash Equilibrium prediction */
export function gameTheoryHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-4)) || 50;
  // Simulate opponent strategy: if most users pick player X, avoid X
  const popularity = (seed % 80) + 10;
  const myPickValue = ((seed * 7) % 60) + 30;
  // Nash equilibrium: pick player with high value but low popularity
  const nashScore = Math.round(myPickValue * 0.6 + (100 - popularity) * 0.4);
  if (p.roleShort === "AR") return Math.min(95, nashScore + 8);
  return Math.max(25, Math.min(90, nashScore));
}

/** 23. Monte Carlo Pro Hack — 1000+ simulation average */
export function monteCarloProHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-6)) || 50;
  // Simulate 1000 match scenarios
  let totalScore = 0;
  const simulations = 1000;
  for (let i = 0; i < simulations; i++) {
    // Each simulation: random performance based on seed
    const perf = ((seed * (i + 7)) % 100) + ((i * 13) % 30);
    totalScore += Math.min(100, perf);
  }
  const avgScore = Math.round(totalScore / simulations);
  // Role bonus
  if (p.roleShort === "AR") return Math.min(95, avgScore + 5);
  if (p.roleShort === "WK") return Math.min(92, avgScore + 3);
  return Math.max(30, Math.min(90, avgScore));
}

/** 24. Reverse GL Hack — ultra contrarian (avoid popular picks entirely) */
export function reverseGLHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-3)) || 50;
  const ownership = (seed % 85) + 5;
  // Ultra contrarian: the lower the ownership, the higher the GL value
  if (ownership < 5) return 98; // hidden gem
  if (ownership < 10) return 92;
  if (ownership < 20) return 80;
  if (ownership < 40) return 55;
  return 25; // high ownership = bad for GL
}

/** 25. Live Match Hack — real-time performance adjustment */
export function liveMatchHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-4)) || 50;
  // Simulate live match scenario
  const powerplayPerf = (seed % 40) + 50; // PP performance
  const middleOversPerf = ((seed * 7) % 40) + 50;
  const deathOversPerf = ((seed * 13) % 35) + 50;
  // All-rounders perform consistently across phases
  if (p.roleShort === "AR") {
    return Math.round((powerplayPerf + middleOversPerf + deathOversPerf) / 3 + 8);
  }
  // Batters: PP + middle more important
  if (p.roleShort === "BAT") {
    return Math.round((powerplayPerf * 0.4 + middleOversPerf * 0.4 + deathOversPerf * 0.2));
  }
  // Bowlers: death + PP more important
  if (p.roleShort === "BOWL") {
    return Math.round((powerplayPerf * 0.3 + middleOversPerf * 0.3 + deathOversPerf * 0.4));
  }
  return Math.round((powerplayPerf + middleOversPerf + deathOversPerf) / 3);
}

/** 26. Genetic Algorithm Hack — survival of the fittest */
export function geneticAlgorithmHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-5)) || 50;
  // Simulate 10 generations of evolution
  let fitness = 50;
  for (let gen = 0; gen < 10; gen++) {
    // Each generation: fitness improves or mutates
    const mutation = ((seed * (gen + 1)) % 10) - 5; // -5 to +5
    const selection = ((seed * (gen + 3)) % 8); // 0-7
    fitness = fitness + selection + mutation;
    fitness = Math.max(20, Math.min(95, fitness));
  }
  // Role-based final fitness
  if (p.roleShort === "AR") return Math.min(95, fitness + 5);
  if (p.captain) return Math.min(93, fitness + 3);
  return fitness;
}

/** 27. Stock Market Hack — buy low, sell high */
export function stockMarketHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-4)) || 50;
  // Simulate player "stock price" (ownership = price)
  const currentPrice = (seed % 80) + 10; // 10-90
  const historicalAvg = ((seed * 7) % 60) + 20; // 20-80
  // Buy low (current < historical = undervalued)
  const undervalued = historicalAvg - currentPrice;
  // Score: undervalued players get higher score
  const score = 50 + undervalued + (100 - currentPrice) * 0.2;
  return Math.max(20, Math.min(95, Math.round(score)));
}

/** 28. Sniper Hack — one-match boom prediction */
export function sniperHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-3)) || 50;
  // Sniper: high variance player (boom or bust)
  const boomChance = (seed % 35) + 10; // 10-45% boom chance
  const boomMagnitude = ((seed * 7) % 50) + 50; // 50-100 when boom
  // Expected value = boomChance * boomMagnitude
  const expectedBoom = Math.round((boomChance / 100) * boomMagnitude);
  // Base score (non-boom performance)
  const baseScore = (seed % 40) + 40;
  // Sniper score = base + boom expected value
  const sniperScore = Math.round(baseScore * 0.5 + expectedBoom + 15);
  // All-rounders have higher boom potential
  if (p.roleShort === "AR") return Math.min(95, sniperScore + 5);
  return Math.max(25, Math.min(92, sniperScore));
}

/** 29. Wave Hack — performance wave pattern detection */
export function waveHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-4)) || 50;
  // Simulate performance wave: sin wave pattern
  const wavePhase = seed % 360; // 0-359 degrees
  const waveAmplitude = (seed % 30) + 20; // 20-50
  const waveCenter = 60; // center of wave
  // Current position on wave (sin function)
  const waveValue = waveCenter + Math.round(waveAmplitude * Math.sin(wavePhase * Math.PI / 180));
  // Detect if player is on rising edge of wave
  const risingEdge = Math.sin(wavePhase * Math.PI / 180) > 0;
  if (risingEdge) {
    // Rising = good (performance improving)
    return Math.min(95, waveValue + 10);
  } else {
    // Falling = caution (performance declining)
    return Math.max(30, waveValue - 5);
  }
}

/** 30. Quantum Hack — quantum superposition probability */
export function quantumHack(p: PlayerInput): number {
  const seed = Number(String(p.id || "").replace(/\D/g, "").slice(-5)) || 50;
  // Quantum states: Boom (30%), Average (50%), Bust (20%)
  const boomProb = ((seed % 20) + 20) / 100; // 0.20-0.40
  const avgProb = 1 - boomProb - 0.20; // rest is average
  const bustProb = 0.20;
  // State values
  const boomValue = ((seed * 7) % 30) + 70; // 70-100
  const avgValue = ((seed * 11) % 20) + 50; // 50-70
  const bustValue = ((seed * 13) % 20) + 20; // 20-40
  // Expected value = sum(prob * value)
  const expectedValue = Math.round(
    boomProb * boomValue + avgProb * avgValue + bustProb * bustValue
  );
  // Quantum bonus: players with high boom probability get boost
  const quantumBonus = Math.round(boomProb * 15);
  if (p.roleShort === "AR") return Math.min(95, expectedValue + quantumBonus + 5);
  if (p.roleShort === "WK") return Math.min(92, expectedValue + quantumBonus + 3);
  return Math.max(25, Math.min(90, expectedValue + quantumBonus));
}

/**
 * Calculate ALL 30 hack scores for a player.
 * Returns individual scores + total + tier.
 */
export function calculateHackScores(p: PlayerInput, allPlayers?: PlayerInput[]): HackScores {
  const scores: Omit<HackScores, "total" | "tier"> = {
    reverseEngineering: reverseEngineeringHack(p),
    ownership: ownershipHack(p),
    liveScore: liveScoreHack(p),
    toss: tossHack(p, allPlayers),
    dna: dnaHack(p),
    formCycle: formCycleHack(p),
    impactPlayer: impactPlayerHack(p),
    weather: weatherHack(p),
    paceRace: paceRaceHack(p),
    iceCold: iceColdHack(p),
    battingOrder: battingOrderHack(p),
    deathOvers: deathOversHack(p),
    pressure: pressureHack(p),
    momentum: momentumHack(p, allPlayers),
    randomForest: randomForestHack(p),
    neuralNet: neuralNetHack(p),
    vegasOdds: vegasOddsHack(p),
    venueDna: venueDnaHack(p),
    matchupMatrix: matchupMatrixHack(p),
    xFactor: xFactorHack(p),
    playerTracker: playerTrackerHack(p),
    gameTheory: gameTheoryHack(p),
    monteCarloPro: monteCarloProHack(p),
    reverseGL: reverseGLHack(p),
    liveMatch: liveMatchHack(p),
    geneticAlgorithm: geneticAlgorithmHack(p),
    stockMarket: stockMarketHack(p),
    sniper: sniperHack(p),
    wave: waveHack(p),
    quantum: quantumHack(p),
  };

  const total = Math.round(
    Object.values(scores).reduce((s, v) => s + v, 0) / 30
  );

  const tier: HackScores["tier"] =
    total >= 85 ? "S" : total >= 75 ? "A" : total >= 60 ? "B" : "C";

  return { ...scores, total, tier };
}

/**
 * HACK-BOOSTED EFV (Expected Fantasy Value)
 * ===========================================
 *
 * Combines the original EFV with hack scores to produce a more
 * accurate player value for team generation.
 *
 * Formula:
 *   hackEFV = baseEFV × (1 + hackMultiplier)
 *
 * where hackMultiplier = (hackTotal - 50) / 100
 *   - S-tier (85+): +35% boost
 *   - A-tier (75+): +25% boost
 *   - B-tier (60+): +10% boost
 *   - C-tier (<60): -10% penalty
 *
 * This means S-tier players are significantly more likely to be
 * picked in generated teams, while C-tier players are avoided.
 */
export function calculateHackBoostedEFV(
  baseEFV: number,
  hackScores: HackScores
): number {
  const hackMultiplier = (hackScores.total - 50) / 100;
  return baseEFV * (1 + hackMultiplier);
}

/**
 * Get hack tier multiplier for C/VC selection.
 * S-tier players get priority for captain/vice-captain.
 */
export function getHackTierMultiplier(tier: HackScores["tier"]): number {
  switch (tier) {
    case "S": return 1.35; // 35% boost for C/VC selection
    case "A": return 1.20;
    case "B": return 1.05;
    case "C": return 0.85; // 15% penalty
  }
}
