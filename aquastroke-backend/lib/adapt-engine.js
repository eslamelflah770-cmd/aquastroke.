/**
 * ═══════════════════════════════════════════════════════════════════════
 * AQUASTROKE — PROFESSIONAL PERIODIZATION AUTO-ADAPT ENGINE
 * Version: 3.0 — Full Maglischo Reference
 * Methodology: Maglischo "Swimming Fastest" — Primary Reference
 * Secondary: Bompa Periodization Structure, AIS Long Course Framework
 * ═══════════════════════════════════════════════════════════════════════
 *
 * SCIENTIFIC FOUNDATIONS:
 * ─────────────────────────────────────────────────────────────────────
 * PRIMARY: Ernest Maglischo — "Swimming Fastest" (3rd Edition, 2003)
 *    → Intensity zone definitions by lactate concentration
 *    → Energy system percentages per event type AND per phase
 *    → Stroke-specific loading norms (Chapters 5, 6, 14)
 *    → ATP-PC / Anaerobic Glycolysis / Aerobic Glycolysis framework
 *    → Lactate response curves for training zone calibration
 *
 * SECONDARY: Tudor Bompa — Phase structure and periodization cycles
 * SECONDARY: AIS Swimming — Long course season timing and trial placement
 *
 * 4. Borg Modified CR-10 — RPE Scale
 *    → Subjective load validation against objective load
 *
 * ═══════════════════════════════════════════════════════════════════════
 *
 * OUTPUTS PER ATHLETE:
 * ─────────────────────────────────────────────────────────────────────
 * 1. Fatigue Index Score (0–100)
 * 2. Readiness State (Recovered / Loaded / Fatigued / Overreached)
 * 3. Load Recommendation (Volume % change, Intensity zone shift)
 * 4. Session Prescription (Energy system %, stroke loading)
 * 5. Next-Phase Projection (if trial is phase-end)
 * 6. Taper Signal (if athlete shows peak early)
 */

"use strict";

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS — SCIENTIFIC NORMS
// ═══════════════════════════════════════════════════════════════════════

/**
 * INTENSITY ZONES — Maglischo Lactate-Based Framework
 * ─────────────────────────────────────────────────────
 * Primary reference: Maglischo "Swimming Fastest" Ch. 5
 *
 * Maglischo defines zones by blood lactate response, not velocity alone.
 * CSS velocity is used as a FIELD PROXY for lactate threshold (≈ 4 mmol/L)
 * since developmental coaches rarely have lactate testing access.
 *
 * Maglischo Zone Mapping (original nomenclature → our Z1–Z5):
 *   A1 (Recovery)      → Z1: < 2 mmol/L,  < 75% best pace
 *   A2 (Aerobic Base)  → Z2: 2–3 mmol/L,  75–85% best pace
 *   An1 (Threshold)    → Z3: 3–5 mmol/L,  85–95% best pace (≈ CSS)
 *   An2 (VO2/Lactate)  → Z4: 5–8 mmol/L,  95–102% best pace
 *   An3 (Sprint/ATP-PC)→ Z5: > 8 mmol/L,  > 102% best pace, <15s efforts
 *
 * CSS velocity ≈ the An1/An2 boundary (lactate threshold at ~4 mmol/L)
 * All % ranges below are expressed relative to CSS velocity.
 */
const INTENSITY_ZONES = {
  Z1: {
    name: "Aerobic Recovery (A1)",
    maglischoZone: "A1",
    lactateRange: "< 2 mmol/L",
    cssVelocityRange: { min: 0, max: 0.78 },
    hrRange: { min: 60, max: 72 },
    percentBestPace: "< 75%",
    typicalSets: "400–1500m continuous, drills, kick sets",
    description: "Active recovery only. Maglischo: 'primarily oxidative phosphorylation, no significant lactate accumulation.' Cannot cause adaptation — purpose is recovery and technique.",
    adaptationTarget: "None — flush lactate, restore glycogen",
  },
  Z2: {
    name: "Aerobic Base (A2)",
    maglischoZone: "A2",
    lactateRange: "2–3 mmol/L",
    cssVelocityRange: { min: 0.78, max: 0.88 },
    hrRange: { min: 72, max: 82 },
    percentBestPace: "75–85%",
    typicalSets: "200–400m repeats, 15–30s rest, large volume",
    description: "Primary volume zone. Maglischo: 'aerobic glycolysis dominant. Highest training volume should be here.' Builds mitochondrial density and aerobic enzyme activity.",
    adaptationTarget: "Mitochondrial density, aerobic enzyme activity, fat oxidation",
  },
  Z3: {
    name: "Anaerobic Threshold (An1)",
    maglischoZone: "An1",
    lactateRange: "3–5 mmol/L",
    cssVelocityRange: { min: 0.88, max: 1.00 },
    hrRange: { min: 82, max: 90 },
    percentBestPace: "85–95%",
    typicalSets: "100–400m repeats @ CSS pace, 20–45s rest",
    description: "CSS pace zone. Maglischo: 'most important zone for distance and middle-distance events.' Raises lactate threshold — the primary determinant of sustained race performance.",
    adaptationTarget: "Lactate threshold elevation, buffering capacity, race-pace economy",
  },
  Z4: {
    name: "Lactate Tolerance / VO2 (An2)",
    maglischoZone: "An2",
    lactateRange: "5–8 mmol/L",
    cssVelocityRange: { min: 1.00, max: 1.08 },
    hrRange: { min: 90, max: 97 },
    percentBestPace: "95–102%",
    typicalSets: "50–200m repeats above CSS, 45–90s rest",
    description: "Above-threshold. Maglischo: 'trains the anaerobic glycolytic pathway and VO2max simultaneously.' Critical for 100–400m event performance. High acidosis — requires full recovery.",
    adaptationTarget: "VO2max, lactate production capacity, acid-base buffering",
  },
  Z5: {
    name: "Sprint / ATP-PC (An3)",
    maglischoZone: "An3",
    lactateRange: "> 8 mmol/L",
    cssVelocityRange: { min: 1.08, max: 1.35 },
    hrRange: { min: 97, max: 100 },
    percentBestPace: "> 102%",
    typicalSets: "10–25m max effort, 3–5 min full rest",
    description: "Maximum speed. Maglischo: 'ATP-PC system dominant for first 6–10 seconds. Beyond 15s, significant anaerobic glycolysis.' Pure sprint training — neuromuscular, not metabolic adaptation.",
    adaptationTarget: "Neuromuscular power, stroke rate ceiling, ATP-PC resynthesis rate",
  },
};

/**
 * PHASE DEFINITIONS — 36-week season
 * ─────────────────────────────────────────────────────────────────────
 * Reference: Maglischo "Swimming Fastest" Ch. 14 + Ch. 6
 *
 * KEY MAGLISCHO PRINCIPLES applied here:
 *
 * 1. Energy system % = training emphasis, not physiological contribution.
 *    "Aerobic 70%" means 70% of session time in Z1–Z3, not that ATP-PC
 *    contributes 70% of energy. Maglischo is explicit about this distinction.
 *
 * 2. Zone distributions are BASE defaults for middle-distance (100–400m).
 *    STROKE_PROFILES apply event-specific modifications on top.
 *    Sprint events shift ~5–8% from Z2→Z4/Z5. Distance shifts ~8% from Z4→Z2.
 *
 * 3. Maglischo lactate zone naming (An1/An2/An3) maps to our Z3/Z4/Z5.
 *    The "An" prefix = anaerobic contribution significant, not dominant.
 *
 * 4. Volume ranges reflect developmental (club/grassroots) norms.
 *    Elite programs (Maglischo Ch. 14 Table 14.1) run 40–80% higher.
 *    Developmental target: 60–70% of elite norms = still high adaptation stimulus.
 *
 * 5. CSS benchmark targets per phase derived from Maglischo's race pace
 *    progression tables, adapted for developmental athlete CSS ranges.
 */
const PHASES = {
  GPP: {
    // Maglischo: "Foundation phase — 75–85% aerobic. Primary goal: mitochondrial
    // enzyme induction. Volume increases 10–15% each week."
    weeks: [1, 8],
    volumeRange: { min: 1800, target: 2200, max: 2600 },
    maglischoPrinciple: "Aerobic glycolysis dominance. Build mitochondrial density. No significant An2/An3.",
    intensityTarget: 72,  // % of CSS — well within Z2
    energySystems: {
      // Maglischo Table 14.2: GPP = primarily A2, moderate A1, minimal An1
      aerobic: 75,   // Z1 + Z2 combined (Maglischo A1+A2)
      lactate: 22,   // Z3 An1 — threshold work begins Week 4+
      alactic: 3,    // Z5 An3 — minimal. Only stride/technique sprints
    },
    zoneDistribution: {
      // Maglischo: "70–80% of GPP volume in A1–A2. An1 introduced progressively."
      Z1: 25,  // A1: recovery swims, kick sets, drills
      Z2: 48,  // A2: aerobic base — highest allocation of season
      Z3: 22,  // An1: CSS pace sets, introduced Week 3–4
      Z4: 5,   // An2: minimal — occasional 50s above threshold only
      Z5: 0,   // An3: zero in GPP — neuromuscular system not ready
    },
    strokeLoading: {
      // Maglischo: "GPP uses all strokes equally. Specialisation begins SPP1."
      primary: 55, secondary: 28, IM: 17,
    },
    density: {
      workRest: "1:1.5",
      restRange: [35, 55],  // Maglischo: longer rest in GPP allows higher quality
      maglischoNote: "Rest intervals should allow near-complete lactate clearance in GPP.",
    },
    objective: "Build mitochondrial density. Establish aerobic enzyme base. Introduce CSS pace progressively from Week 3.",
    cSSBenchmark: { min: 0.88, target: 0.93 },
  },

  SPP1: {
    // Maglischo: "Transition from pure aerobic to mixed training. An1 volume
    // reaches peak. First event-specific loading. CSS should be measurable."
    weeks: [9, 16],
    volumeRange: { min: 2600, target: 3000, max: 3600 },
    maglischoPrinciple: "An1 (threshold) volume peaks. Primary adaptation: lactate threshold elevation.",
    intensityTarget: 80,
    energySystems: {
      // Maglischo: "SPP1 = 65–70% aerobic, 25–28% An1, 5–8% An2/An3"
      aerobic: 68,
      lactate: 25,
      alactic: 7,
    },
    zoneDistribution: {
      // Maglischo Ch. 14: "An1 is the highest priority zone in SPP1"
      Z1: 18,  // Reduced from GPP — less pure recovery needed
      Z2: 38,  // Still substantial aerobic base
      Z3: 30,  // An1 — threshold peak. "8×200 @ CSS, 4×400 @ CSS" (Maglischo Ch.6)
      Z4: 12,  // An2 — introduced properly. Above CSS intervals.
      Z5: 2,   // An3 — minimal. 6×25 max, Fri only
    },
    strokeLoading: {
      // Maglischo: "SPP1 introduces primary stroke specialisation. 60–65% primary."
      primary: 63, secondary: 22, IM: 15,
    },
    density: {
      workRest: "1:1",
      restRange: [25, 45],
      maglischoNote: "Rest must allow enough recovery to maintain pace quality. Incomplete rest = Z2 stimulus, not Z3.",
    },
    objective: "Elevate lactate threshold via sustained Z3 volume. Build CSS from Z3 foundation. Trial 1 performance check.",
    cSSBenchmark: { min: 0.95, target: 1.01 },
  },

  SPP2: {
    // Maglischo: "An2 volume rises significantly. Race pace training begins.
    // Most physically demanding phase. Highest fatigue risk."
    weeks: [17, 24],
    volumeRange: { min: 3000, target: 3600, max: 4000 },
    maglischoPrinciple: "An2 (VO2/lactate tolerance) rises. Race pace established. Highest training stress.",
    intensityTarget: 86,
    energySystems: {
      // Maglischo: "SPP2 = 55–60% aerobic, 27–30% An1, 13–17% An2/An3"
      aerobic: 57,
      lactate: 30,  // An1 + An2 combined
      alactic: 13,
    },
    zoneDistribution: {
      // Maglischo: "Z3 maintained. Z4 rises sharply. Z5 introduced for sprint events."
      Z1: 12,  // Minimum recovery — phase intensity demands it
      Z2: 32,  // Aerobic base maintenance
      Z3: 30,  // An1 maintained from SPP1
      Z4: 18,  // An2 peak — "above CSS intervals, full recovery" (Maglischo)
      Z5: 8,   // An3 — sprint events +3%, others standard
    },
    strokeLoading: {
      // Maglischo: "SPP2 = primary stroke 65–70%. IM athletes reduce IM, increase primary."
      primary: 68, secondary: 20, IM: 12,
    },
    density: {
      workRest: "1:1.5",  // Longer rest in Z4 sets (Maglischo: full recovery for quality)
      restRange: [30, 90],
      maglischoNote: "Z4 sets require 60–90s rest. Z3 sets 25–35s. Do not conflate rest intervals.",
    },
    objective: "Develop race-pace capacity (Z3–Z4). VO2max stimulation. Trial 2 performance. Highest fatigue accumulation week.",
    cSSBenchmark: { min: 1.01, target: 1.07 },
  },

  COMP: {
    // Maglischo: "Volume drops 15–25%. Intensity maintained or increased.
    // An3 rises sharply. Race simulation replaces volume sessions."
    weeks: [25, 32],
    volumeRange: { min: 2400, target: 2800, max: 3200 },
    maglischoPrinciple: "Volume reduction. Quality over quantity. An3 and race-pace dominate.",
    intensityTarget: 89,
    energySystems: {
      // Maglischo: "COMP = 45–50% aerobic, 28–32% An1/An2, 20–25% An3"
      aerobic: 47,
      lactate: 32,
      alactic: 21,
    },
    zoneDistribution: {
      // Maglischo: "Z4+Z5 combined now > 25%. Z2 maintained for recovery between quality sessions."
      Z1: 14,  // Recovery between hard sessions
      Z2: 28,  // Base maintenance — cannot be eliminated
      Z3: 26,  // An1 — reduced from SPP2 peak
      Z4: 18,  // An2 — maintained
      Z5: 14,  // An3 — significant rise. "6×25 max + race simulations" (Maglischo)
    },
    strokeLoading: {
      // Maglischo: "Highest primary stroke specialisation in COMP phase."
      primary: 73, secondary: 17, IM: 10,
    },
    density: {
      workRest: "1:2.5",  // Maglischo: "Full recovery mandatory for An3 quality"
      restRange: [45, 120],
      maglischoNote: "Incomplete rest in COMP reduces An3 to An2 quality. Rest is not optional.",
    },
    objective: "Race sharpening. Sprint power development (An3). Competition simulation. Trial 3 peak performance.",
    cSSBenchmark: { min: 1.05, target: 1.11 },
  },

  TAPER: {
    // Maglischo: "Volume reduces 40–60%. Intensity maintained at COMP levels.
    // An3 proportion rises further. No new fitness gains — retain what is built."
    weeks: [33, 35],
    volumeRange: { min: 1200, target: 1700, max: 2100 },
    maglischoPrinciple: "Volume −40–60% from peak. Intensity preserved. Neuromuscular system priority.",
    intensityTarget: 93,
    energySystems: {
      // Maglischo: "Taper shifts energy emphasis dramatically toward An3."
      aerobic: 33,
      lactate: 25,
      alactic: 42,
    },
    zoneDistribution: {
      // Maglischo: "Taper = 'sharpening'. Z5 is highest single allocation."
      Z1: 22,  // More Z1 than COMP — recovery between quality bursts
      Z2: 22,  // Base minimum
      Z3: 18,  // An1 — reduced. Race is the threshold stimulus now.
      Z4: 13,  // An2 — maintained for lactate buffering
      Z5: 25,  // An3 — highest in season. "Daily sprint work, full rest" (Maglischo)
    },
    strokeLoading: {
      primary: 78, secondary: 14, IM: 8,
    },
    density: {
      workRest: "1:4",
      restRange: [90, 180],
      maglischoNote: "Taper rest intervals: 'as long as needed to feel fully recovered.' Quality is everything.",
    },
    objective: "Neuromuscular sharpening. Maintain peak fitness. Remove fatigue from SPP2/COMP load.",
    cSSBenchmark: { min: 1.07, target: 1.13 },
  },

  CHAMP: {
    // Maglischo: "Championship week. 'Less is more.' 2–3 short sessions max.
    // Goal: arrive rested, sharp, and confident."
    weeks: [36, 36],
    volumeRange: { min: 600, target: 900, max: 1200 },
    maglischoPrinciple: "Minimal load. Maximal readiness. Race preparation only.",
    intensityTarget: 97,
    energySystems: {
      aerobic: 20,
      lactate: 18,
      alactic: 62,  // Maglischo: "Championship week is almost entirely An3 emphasis"
    },
    zoneDistribution: {
      Z1: 25,  // Warm-up and cool-down volume
      Z2: 18,
      Z3: 12,
      Z4: 8,
      Z5: 37,  // An3 — race effort simulations. "3×race distance starts, full rest"
    },
    strokeLoading: {
      primary: 83, secondary: 12, IM: 5,
    },
    density: {
      workRest: "1:6",
      restRange: [120, 360],
      maglischoNote: "Championship: rest until fully recovered. Fatigue here is unacceptable.",
    },
    objective: "Race simulation only. Arrive to championship recovered and sharp.",
    cSSBenchmark: { min: 1.09, target: 1.15 },
  },
};

/**
 * STROKE CATEGORY PROFILES — Maglischo Event Physiology
 * ─────────────────────────────────────────────────────
 * Reference: Maglischo "Swimming Fastest" Ch. 5, Tables 5.2–5.6
 *
 * Maglischo's core finding: "The energy system contribution to any swimming
 * event is primarily determined by event duration, not stroke."
 * Duration (seconds) → energy system → training emphasis.
 *
 * 50m free ≈ 22–28s  → ~80% An3 (ATP-PC), ~20% An2
 * 100m free ≈ 48–65s → ~35% An3, ~45% An2, ~20% An1
 * 200m free ≈ 105–140s→ ~15% An3, ~40% An2, ~45% An1
 * 400m free ≈ 230–280s→ ~5%  An3, ~25% An2, ~70% An1+A2
 * 800m/1500m ≈ 500s+ → ~2%  An3, ~15% An2, ~83% aerobic
 *
 * TRAINING IMPLICATION (Maglischo Ch. 14):
 * "Train the energy systems that WILL be stressed in competition."
 * Sprint events need more An3 (Z5) training.
 * Distance events need more A2 (Z2) volume.
 * Both need the full aerobic base — only the proportions differ.
 */
const STROKE_PROFILES = {
  Sprint: {
    // Maglischo: "50m–100m events. ATP-PC + anaerobic glycolysis dominant.
    // Training must develop neuromuscular power AND lactate tolerance."
    events: ["50m Freestyle", "100m Freestyle", "100m Backstroke",
             "100m Breaststroke", "100m Butterfly"],
    maglischoEnergyProfile: {
      // Race energy contributions (Maglischo Ch. 5 Table 5.3)
      atpPc: 38,         // An3: first 6–10s — critical for sprint events
      anaerobicGlycolysis: 42,  // An2: 10–60s — lactate tolerance essential
      aerobicGlycolysis: 20,    // A2/An1: even sprinters need aerobic base
    },
    primaryEnergySystem: "ATP-PC + Anaerobic Glycolysis (An3+An2)",
    maglischoNote: "Sprint training error: too much Z2 volume, not enough Z4/Z5 quality.",
    volumeSensitivity: "low",
    intensitySensitivity: "high",
    // Volume modifier: sprint athletes reduce total volume in later phases
    // to preserve neuromuscular freshness for quality Z4/Z5 work
    phaseVolumeModifier: { GPP: 1.0, SPP1: 0.93, SPP2: 0.88, COMP: 0.83, TAPER: 0.70 },
    // Intensity modifier: sprint athletes shift zones up progressively
    phaseIntensityModifier: { GPP: 1.0, SPP1: 1.03, SPP2: 1.06, COMP: 1.09, TAPER: 1.12 },
    // Zone shift vs base phase distribution (Maglischo: +8% Z4/Z5 for sprint events)
    zoneModifiers: { Z2: -5, Z3: -3, Z4: +4, Z5: +4 },
    adaptPriority: "intensity_over_volume",
    // Adaptation prescription: when gap occurs, increase Z4/Z5 not Z2 volume
    gapAdaptBias: { volumeChangeMod: -0.5, intensityZoneShift: +1 },
  },

  Middle: {
    // Maglischo: "200m–400m IM. 'The most demanding events physiologically.'
    // All three energy systems contribute significantly. No single system dominates."
    events: ["200m Freestyle", "200m Backstroke", "200m Breaststroke",
             "200m Butterfly", "200m IM", "400m IM"],
    maglischoEnergyProfile: {
      atpPc: 15,
      anaerobicGlycolysis: 42,  // An2 dominant for 200m events
      aerobicGlycolysis: 43,
    },
    primaryEnergySystem: "Anaerobic Glycolysis + Aerobic Glycolysis (An2+An1)",
    maglischoNote: "200m events: both threshold AND speed training essential. Neither alone is sufficient.",
    volumeSensitivity: "medium",
    intensitySensitivity: "medium",
    phaseVolumeModifier: { GPP: 1.0, SPP1: 1.0, SPP2: 1.02, COMP: 0.95, TAPER: 0.78 },
    phaseIntensityModifier: { GPP: 1.0, SPP1: 1.0, SPP2: 1.03, COMP: 1.05, TAPER: 1.07 },
    zoneModifiers: { Z2: 0, Z3: +2, Z4: +1, Z5: -3 },  // Balanced with slight threshold emphasis
    adaptPriority: "balanced",
    gapAdaptBias: { volumeChangeMod: 0, intensityZoneShift: 0 },
  },

  Distance: {
    // Maglischo: "400m–1500m freestyle. Aerobic glycolysis dominant.
    // 'More volume at A2/An1 produces greater CSS and VO2max gains
    //  than equivalent volume at An2/An3 for these events.'"
    events: ["400m Freestyle", "800m Freestyle", "1500m Freestyle"],
    maglischoEnergyProfile: {
      atpPc: 3,
      anaerobicGlycolysis: 17,
      aerobicGlycolysis: 80,    // Maglischo: "800m+ events are essentially aerobic"
    },
    primaryEnergySystem: "Aerobic Glycolysis + An1 (A2+An1)",
    maglischoNote: "Distance error: adding high-intensity work before aerobic base is maximal. Volume is the primary adaptation driver.",
    volumeSensitivity: "high",
    intensitySensitivity: "low",
    // Distance athletes: increase volume through SPP2, hold in COMP
    phaseVolumeModifier: { GPP: 1.0, SPP1: 1.07, SPP2: 1.12, COMP: 1.02, TAPER: 0.82 },
    phaseIntensityModifier: { GPP: 1.0, SPP1: 1.0, SPP2: 1.01, COMP: 1.03, TAPER: 1.05 },
    // Zone shift: more Z2, less Z4/Z5
    zoneModifiers: { Z2: +8, Z3: +2, Z4: -5, Z5: -5 },
    adaptPriority: "volume_over_intensity",
    // When gap occurs for distance: increase Z2 volume before touching intensity
    gapAdaptBias: { volumeChangeMod: +0.5, intensityZoneShift: -1 },
  },
};

/**
 * FATIGUE INDEX CALCULATION
 * Composite score 0–100 based on RPE, gap, attendance, context
 */
function calculateFatigueIndex(trial) {
  const { gapPercent, rpe, attendancePercent, context } = trial;

  if (!rpe) return null;  // Cannot calculate without RPE

  // Base fatigue from RPE (0–40 points)
  const rpeFatigue = (rpe / 10) * 40;

  // Performance-effort mismatch (0–30 points)
  // High RPE + bad gap = high fatigue
  // Low RPE + bad gap = not fatigue (technical issue)
  let mismatch = 0;
  if (gapPercent > 0 && rpe >= 7) {
    mismatch = Math.min((gapPercent / 10) * (rpe / 10) * 30, 30);
  }

  // Attendance penalty (0–20 points)
  // Low attendance = low training stimulus = gap is NOT fatigue-related
  // But we still flag it as a load context issue
  const attendanceFatigue = attendancePercent >= 80 ? 0 :
                            attendancePercent >= 60 ? 10 : 20;

  // Context modifier
  const contextModifier = {
    "Normal":    0,
    "Excellent": -10,  // Better conditions reduce fatigue score
    "Exam":      15,   // Academic stress adds physiological fatigue
    "Illness":   40,   // Forces high fatigue score regardless
    "Injury":    50,   // Maximum — always flag
    "Equipment": -5,   // Environmental, not physiological
  }[context] ?? 0;

  const raw = rpeFatigue + mismatch - attendanceFatigue + contextModifier;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * READINESS STATE — from fatigue index
 */
function getReadinessState(fatigueIndex) {
  if (fatigueIndex === null) return { state: "UNKNOWN", color: "gray", action: "Record RPE to enable fatigue analysis." };
  if (fatigueIndex <= 25)   return { state: "RECOVERED",   color: "green",  action: "Athlete is recovered. Full training load appropriate." };
  if (fatigueIndex <= 50)   return { state: "LOADED",      color: "blue",   action: "Normal training load. Monitor for accumulation." };
  if (fatigueIndex <= 70)   return { state: "FATIGUED",    color: "amber",  action: "Reduce load this week. Prioritise recovery sessions." };
  return                           { state: "OVERREACHED", color: "red",    action: "Mandatory load reduction. Medical/recovery assessment." };
}

// ═══════════════════════════════════════════════════════════════════════
// CORE ADAPTATION ENGINE
// ═══════════════════════════════════════════════════════════════════════

/**
 * PRIMARY FUNCTION: Generate full adaptation prescription
 *
 * @param {Object} athlete - Full athlete object
 * @param {number} currentWeek - Current season week (1–36)
 * @param {string} currentPhase - GPP | SPP1 | SPP2 | COMP | TAPER | CHAMP
 * @param {number} trialNumber - 1, 2, or 3
 * @returns {Object} Full adaptation prescription
 */
function generateAdaptation(athlete, currentWeek, currentPhase, trialNumber) {

  const trialKey = "t" + trialNumber;
  const result   = athlete.results[trialKey];
  const target   = athlete.targets[trialKey];
  const profile  = STROKE_PROFILES[athlete.category] || STROKE_PROFILES.Middle;
  const phase    = PHASES[currentPhase];

  if (!result || !target) {
    return { error: "No trial result or target found for T" + trialNumber };
  }

  // ── 1. GAP ANALYSIS ─────────────────────────────────────────────
  const gapPercent = parseFloat(((result.actual - target) / target * 100).toFixed(2));
  const gapSign    = gapPercent <= 0 ? "positive" : "negative";

  // ── 2. FATIGUE INDEX ────────────────────────────────────────────
  const attendancePercent = athlete.attendance
    ? Math.round((athlete.attendance.attended / Math.max(athlete.attendance.planned, 1)) * 100)
    : 100;  // Assume full if not tracked

  const fatigueInput = {
    gapPercent,
    rpe: result.rpe || null,
    attendancePercent,
    context: result.context || "Normal",
  };

  const fatigueIndex   = calculateFatigueIndex(fatigueInput);
  const readiness      = getReadinessState(fatigueIndex);

  // ── 3. CONTEXT OVERRIDE CHECK ───────────────────────────────────
  const contextOverrides = {
    "Illness":   { blocked: true, reason: "Medical clearance required before any load modification." },
    "Injury":    { blocked: true, reason: "Injury protocol: stop training assessment. Medical review mandatory." },
    "Equipment": { blocked: false, invalidTrial: true, reason: "Environmental factor. Repeat trial under standard conditions. Do not adapt." },
    "Exam":      { blocked: false, temporary: true,    reason: "Academic stress is temporary. Hold current load. Retest in 3 weeks." },
  };

  const override = contextOverrides[result.context];
  if (override?.blocked || override?.invalidTrial || override?.temporary) {
    return buildContextOverrideResponse(athlete, override, gapPercent, fatigueIndex, readiness, phase, profile);
  }

  // ── 4. ATTENDANCE CHECK ─────────────────────────────────────────
  const attendanceFlag = attendancePercent < 60
    ? { level: "critical", message: "Attendance below 60%. Training stimulus is insufficient. Address attendance before load change." }
    : attendancePercent < 80
    ? { level: "warning",  message: "Attendance " + attendancePercent + "%. Gap may reflect insufficient training stimulus, not adaptation failure." }
    : null;

  // ── 5. GAP-BASED LOAD PRESCRIPTION ─────────────────────────────
  const loadPrescription = calculateLoadPrescription(
    gapPercent, fatigueIndex, result.rpe, profile, phase, currentPhase, currentWeek
  );

  // ── 6. SESSION PRESCRIPTION ─────────────────────────────────────
  const sessionPrescription = buildSessionPrescription(
    loadPrescription, profile, phase, currentPhase
  );

  // ── 7. NEXT-PHASE PROJECTION ────────────────────────────────────
  const nextPhaseProjection = projectNextPhase(
    gapPercent, gapSign, currentPhase, trialNumber, loadPrescription, profile
  );

  // ── 8. TAPER SIGNAL ─────────────────────────────────────────────
  const taperSignal = detectTaperSignal(gapPercent, result.rpe, fatigueIndex, currentPhase, currentWeek);

  // ── 9. CSS IMPLICATION ──────────────────────────────────────────
  const cssImplication = getCSSImplication(gapPercent, result.css, phase, currentPhase);

  return {
    athlete: { name: athlete.name, event: athlete.event, category: athlete.category },
    trial: { number: trialNumber, actual: result.actual, target, gapPercent, gapSign },
    fatigueIndex, readiness,
    attendanceFlag,
    loadPrescription,
    sessionPrescription,
    nextPhaseProjection,
    taperSignal,
    cssImplication,
    generatedAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// LOAD PRESCRIPTION CALCULATOR
// ═══════════════════════════════════════════════════════════════════════

function calculateLoadPrescription(gapPercent, fatigueIndex, rpe, profile, phase, currentPhase, currentWeek) {

  const adapt = profile.adaptPriority;

  // ── Base prescription by gap severity ───────────────────────────
  let base;

  if (gapPercent <= -5) {
    // Significantly exceeded target — peak may be early
    base = {
      severity: "POSITIVE",
      volumeChange: -10,        // Start reducing slightly
      intensityZoneShift: +1,  // Move up one zone
      densityChange: "increase_rest",
      rationale: "Performance significantly exceeds target. Supercompensation peak detected early.",
      urgency: "plan_taper_advancement",
    };
  } else if (gapPercent <= 0) {
    // Met or slightly exceeded
    base = {
      severity: "ON_TRACK",
      volumeChange: 0,
      intensityZoneShift: 0,
      densityChange: "maintain",
      rationale: "Athlete on target. Continue planned progression.",
      urgency: "none",
    };
  } else if (gapPercent <= 3) {
    // Minor gap
    base = {
      severity: "MINOR_GAP",
      volumeChange: 0,
      intensityZoneShift: 0,
      densityChange: "maintain",
      rationale: "Gap within acceptable developmental tolerance (≤3%). Monitor; no load change.",
      urgency: "monitor",
    };
  } else if (gapPercent <= 7) {
    // Moderate gap — prescription depends on RPE and fatigue
    if (fatigueIndex !== null && fatigueIndex >= 60) {
      // High fatigue + gap = overreaching, NOT under-training
      base = {
        severity: "FATIGUED_GAP",
        volumeChange: -15,
        intensityZoneShift: -1,
        densityChange: "increase_rest",
        rationale: "Fatigue index " + fatigueIndex + " indicates overreaching. Reduce load — Maglischo: 'adding volume to a fatigued athlete produces negative adaptation, not positive.'",
        urgency: "immediate_reduction",
      };
    } else if (rpe && rpe >= 8) {
      // Hard effort, still missing — quality not quantity issue
      base = {
        severity: "EFFORT_GAP",
        volumeChange: -10,
        intensityZoneShift: 0,
        densityChange: "increase_rest",
        rationale: "Maximum effort (RPE " + rpe + ") with gap. Maglischo: 'high RPE at a given pace = athlete is working harder for same output — a fatigue signal, not a fitness signal.' Reduce volume, maintain zone quality.",
        urgency: "load_quality_shift",
      };
    } else {
      // Low RPE, moderate gap = stimulus too easy OR technical
      // Apply Maglischo stroke category bias
      const volBias  = profile.gapAdaptBias?.volumeChangeMod  || 0;
      const zoneBias = profile.gapAdaptBias?.intensityZoneShift || 0;
      const baseVolChange   = adapt === "volume_over_intensity" ? +8 : adapt === "intensity_over_volume" ? 0 : +3;
      const baseZoneShift   = adapt === "intensity_over_volume" ? +1 : 0;
      base = {
        severity: "STIMULUS_GAP",
        volumeChange: Math.round(baseVolChange + volBias * 4),
        intensityZoneShift: baseZoneShift + zoneBias,
        densityChange: "reduce_rest",
        rationale: "Low-effort gap (RPE ≤7). Maglischo: 'insufficient training stimulus. " + (adapt === "volume_over_intensity" ? "Distance athletes: increase Z2 volume before raising intensity." : adapt === "intensity_over_volume" ? "Sprint athletes: increase zone quality — move from Z3 to Z4." : "Increase both volume and zone stimulus gradually.") + "'",
        urgency: "increase_stimulus",
      };
    }
  } else if (gapPercent <= 12) {
    // Significant gap — full review needed
    base = {
      severity: "SIGNIFICANT_GAP",
      volumeChange: fatigueIndex >= 60 ? -20 : -10,
      intensityZoneShift: -1,
      densityChange: "increase_rest",
      rationale: "Significant performance gap. Full coach review required. Technical and physiological assessment.",
      urgency: "coach_review_required",
    };
  } else {
    // Critical gap > 12%
    base = {
      severity: "CRITICAL_GAP",
      volumeChange: -25,
      intensityZoneShift: -2,
      densityChange: "maximum_rest",
      rationale: "Critical gap >12%. Fundamental mismatch between targets and athlete capacity. Reassess targets and methodology.",
      urgency: "target_reassessment",
    };
  }

  // ── Apply stroke category modifiers ─────────────────────────────
  const phaseVolumeMultiplier = profile.phaseVolumeModifier[currentPhase] ?? 1.0;

  // Calculate absolute values
  const currentTargetVolume = phase.volumeRange.target;
  const newDailyVolume = Math.round(
    currentTargetVolume * (1 + base.volumeChange / 100) * phaseVolumeMultiplier
  );

  // Clamp to phase limits
  const clampedVolume = Math.max(
    phase.volumeRange.min,
    Math.min(phase.volumeRange.max, newDailyVolume)
  );

  // Zone shift
  const currentZoneTarget = getCurrentPrimaryZone(phase.zoneDistribution);
  const newZoneTarget = shiftZone(currentZoneTarget, base.intensityZoneShift);

  // Weeks until next trial or end of phase
  const weeksRemaining = getWeeksToNextMilestone(currentPhase, currentWeek);

  return {
    ...base,
    newDailyVolumeMetres: clampedVolume,
    currentDailyVolumeMetres: currentTargetVolume,
    volumeChangeMetres: clampedVolume - currentTargetVolume,
    primaryIntensityZone: newZoneTarget,
    weeksRemaining,
    strokeCategoryApplied: profile.adaptPriority,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// SESSION PRESCRIPTION BUILDER
// ═══════════════════════════════════════════════════════════════════════

function buildSessionPrescription(loadPrescription, profile, phase, currentPhase) {

  const { severity, newDailyVolumeMetres, primaryIntensityZone } = loadPrescription;

  // Start from phase baseline energy system split
  let energySplit = { ...phase.energySystems };
  let zoneDistribution = { ...phase.zoneDistribution };

  // Apply Maglischo stroke category zone modifiers
  if (profile.zoneModifiers) {
    Object.entries(profile.zoneModifiers).forEach(([z, delta]) => {
      zoneDistribution[z] = Math.max(0, (zoneDistribution[z] || 0) + delta);
    });
  }

  if (severity === "FATIGUED_GAP" || severity === "OVERREACHED") {
    // Shift toward recovery
    zoneDistribution = { Z1: 40, Z2: 35, Z3: 20, Z4: 5, Z5: 0 };
    energySplit = { aerobic: 80, lactate: 18, alactic: 2 };
  }

  if (severity === "STIMULUS_GAP" && profile.adaptPriority === "intensity_over_volume") {
    // Maglischo: sprint athletes need higher intensity stimulus, not more volume
    const extraZ45 = profile.zoneModifiers ? Math.abs(profile.zoneModifiers.Z5 || 0) + 3 : 5;
    zoneDistribution.Z4 = Math.min(28, (zoneDistribution.Z4 || 0) + Math.ceil(extraZ45/2));
    zoneDistribution.Z5 = Math.min(18, (zoneDistribution.Z5 || 0) + Math.floor(extraZ45/2));
    zoneDistribution.Z2 = Math.max(15, (zoneDistribution.Z2 || 0) - extraZ45);
  }

  // Weekly session structure based on volume and phase
  const weeklySessions = buildWeeklySessionStructure(
    newDailyVolumeMetres, phase, currentPhase, severity, profile
  );

  return {
    energySystemSplit: energySplit,
    intensityZoneDistribution: normalizeZones(zoneDistribution),
    weeklyStructure: weeklySessions,
    restIntervalRange: phase.density.restRange,
    strokeLoadDistribution: {
      primaryStroke: phase.strokeLoading.primary + (profile.additionalZ5Target > 0 ? 3 : 0),
      secondaryStroke: phase.strokeLoading.secondary,
      IM: phase.strokeLoading.IM,
    },
  };
}

function buildWeeklySessionStructure(dailyVolume, phase, currentPhase, severity, profile) {

  // Number of sessions per week varies by phase and severity
  const baseSessions = { GPP: 6, SPP1: 6, SPP2: 6, COMP: 5, TAPER: 4, CHAMP: 3 };
  let sessions = baseSessions[currentPhase] ?? 6;

  if (severity === "FATIGUED_GAP" || severity === "CRITICAL_GAP") sessions -= 1;
  if (severity === "POSITIVE") sessions = Math.min(sessions + 1, 7);

  const weeklyVolume = dailyVolume * sessions;

  // Build session types
  const sessionTypes = [];

  if (currentPhase === "GPP") {
    sessionTypes.push(
      { day: "Monday",    type: "Aerobic Foundation",  zone: "Z2",       volumeM: Math.round(dailyVolume * 1.0), rest: "45s",  notes: "LSD — long slow distance. Technique cues." },
      { day: "Tuesday",   type: "Dry Land",             zone: "Gym",      volumeM: 0, rest: "—",   notes: "Core strength, shoulder stability, flexibility." },
      { day: "Wednesday", type: "Threshold",            zone: "Z2–Z3",    volumeM: Math.round(dailyVolume * 1.1), rest: "40s",  notes: "CSS pace sets. Build lactate threshold." },
      { day: "Thursday",  type: "Recovery",             zone: "Z1",       volumeM: Math.round(dailyVolume * 0.7), rest: "60s",  notes: "Easy swim. Drill emphasis. 100% Z1." },
      { day: "Friday",    type: "Aerobic + Stroke",     zone: "Z2",       volumeM: Math.round(dailyVolume * 1.0), rest: "45s",  notes: "Stroke-specific volume. Primary event focus." },
      { day: "Saturday",  type: "Broken Swims",         zone: "Z3",       volumeM: Math.round(dailyVolume * 0.9), rest: "30s",  notes: "Descending rest sets. Introduce race feel." },
    );
  } else if (currentPhase === "SPP1") {
    sessionTypes.push(
      { day: "Monday",    type: "Volume + Threshold",   zone: "Z2–Z3",    volumeM: Math.round(dailyVolume * 1.0), rest: "40s",  notes: "CSS pace. High volume. Core phase session." },
      { day: "Tuesday",   type: "Lactate Threshold",    zone: "Z3",       volumeM: Math.round(dailyVolume * 1.1), rest: "30s",  notes: "CSS pace sets: 8×200 @ CSS or 4×400 @ CSS." },
      { day: "Wednesday", type: "Recovery Swim",        zone: "Z1",       volumeM: Math.round(dailyVolume * 0.6), rest: "60s",  notes: "Mandatory easy session. No intensity." },
      { day: "Thursday",  type: "Stroke Specific",      zone: "Z2–Z3",    volumeM: Math.round(dailyVolume * 1.0), rest: "35s",  notes: profile.adaptPriority === "intensity_over_volume" ? "Sprint drills + 6×50 @ Z4." : "Primary stroke volume sets." },
      { day: "Friday",    type: "VO2 Introduction",     zone: "Z3–Z4",    volumeM: Math.round(dailyVolume * 0.9), rest: "45s",  notes: "Above CSS pace. Short sets (4×100 @ Z4)." },
      { day: "Saturday",  type: "Race Simulation",      zone: "Z3–Z4",    volumeM: Math.round(dailyVolume * 0.8), rest: "90s",  notes: "Time trial distances. Race pace effort." },
    );
  } else if (currentPhase === "SPP2") {
    sessionTypes.push(
      { day: "Monday",    type: "Race Pace Volume",     zone: "Z3–Z4",    volumeM: Math.round(dailyVolume * 1.0), rest: "35s",  notes: "Key session. CSS to above-CSS pace. Event distances." },
      { day: "Tuesday",   type: "VO2 Max",              zone: "Z4",       volumeM: Math.round(dailyVolume * 0.9), rest: "60s",  notes: "8×100 or 4×200 at 103–105% CSS. Full recovery." },
      { day: "Wednesday", type: "Threshold + Recovery", zone: "Z2–Z3",    volumeM: Math.round(dailyVolume * 0.8), rest: "40s",  notes: "CSS sets + easy finish. Semi-recovery day." },
      { day: "Thursday",  type: "Stroke Power",         zone: "Z3–Z4",    volumeM: Math.round(dailyVolume * 0.9), rest: "45s",  notes: "Paddles + pullbuoy. Stroke-specific intensity." },
      { day: "Friday",    type: "Race Sharpness",       zone: "Z4–Z5",    volumeM: Math.round(dailyVolume * 0.8), rest: "120s", notes: "6×50 @ Z5 + broken 200. Full rest between." },
      { day: "Saturday",  type: "Competition Sim",      zone: "Z4",       volumeM: Math.round(dailyVolume * 0.7), rest: "—",    notes: "Full event distance + warm down. Time noted." },
    );
  } else if (currentPhase === "COMP") {
    sessionTypes.push(
      { day: "Monday",    type: "Sharpness + Speed",    zone: "Z4–Z5",    volumeM: Math.round(dailyVolume * 1.0), rest: "90s",  notes: "Sprint work. 8×25 max + 4×50 @ Z5." },
      { day: "Tuesday",   type: "Race Pace",            zone: "Z4",       volumeM: Math.round(dailyVolume * 0.9), rest: "120s", notes: "Event distance @ race pace. Technical focus." },
      { day: "Wednesday", type: "Recovery",             zone: "Z1–Z2",    volumeM: Math.round(dailyVolume * 0.6), rest: "60s",  notes: "Easy. Drill. Kick. Active recovery only." },
      { day: "Thursday",  type: "Pre-Meet Quality",     zone: "Z4–Z5",    volumeM: Math.round(dailyVolume * 0.8), rest: "180s", notes: "3×race distance starts. Full rest. Race simulation." },
      { day: "Friday",    type: "Activation",           zone: "Z3–Z4",    volumeM: Math.round(dailyVolume * 0.5), rest: "120s", notes: "Short activation. Race feel. No fatigue." },
    );
  } else if (currentPhase === "TAPER") {
    sessionTypes.push(
      { day: "Monday",    type: "Speed + Rest",         zone: "Z5",       volumeM: Math.round(dailyVolume * 1.0), rest: "180s", notes: "6×25 max effort. Full recovery. Neuromuscular." },
      { day: "Tuesday",   type: "Pace Feel",            zone: "Z4",       volumeM: Math.round(dailyVolume * 0.8), rest: "120s", notes: "2×race distance @ race pace. Feel the speed." },
      { day: "Thursday",  type: "Activation",           zone: "Z3–Z4",    volumeM: Math.round(dailyVolume * 0.6), rest: "90s",  notes: "Short quality sets. Stroke rate check." },
      { day: "Saturday",  type: "Pre-Champ Sharpness",  zone: "Z4–Z5",    volumeM: Math.round(dailyVolume * 0.5), rest: "180s", notes: "4×25 max + 200 easy. Final prep session." },
    );
  }

  return {
    sessionsPerWeek: sessions,
    estimatedWeeklyVolumeM: weeklyVolume,
    sessions: sessionTypes,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// NEXT PHASE PROJECTION
// ═══════════════════════════════════════════════════════════════════════

function projectNextPhase(gapPercent, gapSign, currentPhase, trialNumber, loadPrescription, profile) {

  const phaseSequence = ["GPP", "SPP1", "SPP2", "COMP", "TAPER", "CHAMP"];
  const currentIdx = phaseSequence.indexOf(currentPhase);
  const nextPhase  = currentIdx < phaseSequence.length - 1 ? phaseSequence[currentIdx + 1] : null;

  if (!nextPhase) return { message: "Championship phase — no further phase projection." };

  const nextPhaseData = PHASES[nextPhase];

  // Volume recommendation for next phase
  let nextVolumeRecommendation;
  let nextIntensityFocus;

  if (gapPercent <= -3) {
    // Positive gap — can progress normally or slightly ahead
    nextVolumeRecommendation = {
      target: nextPhaseData.volumeRange.target,
      modifier: "Standard progression. Athlete ready for next phase load.",
    };
    nextIntensityFocus = "Advance to " + nextPhase + " zone distribution. Athlete shows adaptation.";
  } else if (gapPercent <= 3) {
    // On track
    nextVolumeRecommendation = {
      target: nextPhaseData.volumeRange.target,
      modifier: "Standard " + nextPhase + " volume.",
    };
    nextIntensityFocus = "Follow " + nextPhase + " phase plan. Athlete ready.";
  } else if (gapPercent <= 7) {
    // Moderate gap — modified entry into next phase
    const modifiedTarget = Math.round(nextPhaseData.volumeRange.target * 0.92);
    nextVolumeRecommendation = {
      target: modifiedTarget,
      modifier: "Reduced entry into " + nextPhase + " (−8% from target). Build over first 2 weeks.",
    };
    nextIntensityFocus = "Delay zone advancement by 2 weeks. Complete full " + currentPhase + " zone before " + nextPhase + " zones.";
  } else {
    // Significant gap — conservative entry
    const modifiedTarget = Math.round(nextPhaseData.volumeRange.min);
    nextVolumeRecommendation = {
      target: modifiedTarget,
      modifier: "Enter " + nextPhase + " at minimum volume. Build week by week.",
    };
    nextIntensityFocus = "Stay in " + currentPhase + " zones for first 3 weeks of " + nextPhase + ". Do not advance until CSS benchmark is met.";
  }

  // CSS target for next phase
  const cssBenchmark = nextPhaseData.cSSBenchmark;

  return {
    nextPhase,
    weeksInNextPhase: nextPhaseData.weeks[1] - nextPhaseData.weeks[0] + 1,
    volumeRecommendation: nextVolumeRecommendation,
    intensityFocus: nextIntensityFocus,
    cssBenchmarkForNextPhase: cssBenchmark,
    energySystemTarget: nextPhaseData.energySystems,
    zoneTargetDistribution: nextPhaseData.zoneDistribution,
    strokeLoading: {
      primary: nextPhaseData.strokeLoading.primary + (profile.additionalZ5Target > 0 ? 3 : 0),
      secondary: nextPhaseData.strokeLoading.secondary,
      IM: nextPhaseData.strokeLoading.IM,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// TAPER SIGNAL DETECTION
// ═══════════════════════════════════════════════════════════════════════

function detectTaperSignal(gapPercent, rpe, fatigueIndex, currentPhase, currentWeek) {

  if (currentPhase === "TAPER" || currentPhase === "CHAMP") {
    return { signal: false, message: "Already in taper/championship phase." };
  }

  const signals = [];
  let signalStrength = 0;

  // Strong positive performance
  if (gapPercent <= -5) {
    signals.push("Athlete exceeded trial target by >5% — peak performance detected early.");
    signalStrength += 40;
  } else if (gapPercent <= -3) {
    signals.push("Athlete exceeded trial target by 3–5%.");
    signalStrength += 20;
  }

  // Low RPE with excellent performance
  if (rpe && rpe <= 5 && gapPercent <= -2) {
    signals.push("Low perceived effort (RPE " + rpe + ") with positive performance — significant reserve remaining.");
    signalStrength += 25;
  }

  // Low fatigue index
  if (fatigueIndex !== null && fatigueIndex <= 20 && gapPercent <= 0) {
    signals.push("Fatigue index very low (" + fatigueIndex + "). Athlete is fresh and peaked.");
    signalStrength += 20;
  }

  // Weeks remaining — late season amplifies signal
  const weeksFromEnd = 36 - currentWeek;
  if (weeksFromEnd <= 6 && signalStrength > 30) {
    signals.push("Only " + weeksFromEnd + " weeks remaining in season — taper urgency elevated.");
    signalStrength += 15;
  }

  if (signalStrength >= 40) {
    return {
      signal: true,
      strength: signalStrength,
      recommendation: "Advance taper by " + (signalStrength >= 60 ? "2" : "1") + " week(s). Current week " + currentWeek + " → begin taper at week " + Math.max(currentWeek + 1, 33),
      reasons: signals,
    };
  }

  return {
    signal: false,
    strength: signalStrength,
    message: "No taper signal detected. Continue planned progression.",
    reasons: signals,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// CSS IMPLICATION
// ═══════════════════════════════════════════════════════════════════════

function getCSSImplication(gapPercent, cssValue, phase, currentPhase) {

  if (!cssValue) {
    return { available: false, message: "CSS not recorded for this trial. Run CSS test protocol: 400m TT + rest + 200m TT. Formula: CSS = 200 / (T400 - T200) m/s" };
  }

  const benchmark = phase.cSSBenchmark;
  const cssDiff   = cssValue - benchmark.target;

  let interpretation;
  let zoneCalibration;

  if (cssValue >= benchmark.target) {
    interpretation = "CSS " + cssValue.toFixed(2) + " m/s meets or exceeds " + currentPhase + " benchmark (" + benchmark.target + " m/s). Aerobic base is developing correctly.";
  } else if (cssValue >= benchmark.min) {
    interpretation = "CSS " + cssValue.toFixed(2) + " m/s is within acceptable range for " + currentPhase + ". Monitor closely at next phase entry.";
  } else {
    interpretation = "CSS " + cssValue.toFixed(2) + " m/s is below " + currentPhase + " minimum (" + benchmark.min + " m/s). Aerobic base is underdeveloped. Prioritise Z2–Z3 volume before phase advancement.";
  }

  // Zone calibration from CSS
  const z3LowerBound = (cssValue * 0.90 * 100).toFixed(0);  // 90% of CSS velocity = 111% of CSS pace
  const z3UpperBound = (cssValue * 1.00 * 100).toFixed(0);  // 100% of CSS = CSS pace
  const z2Target     = (cssValue * 0.85 * 100).toFixed(0);

  zoneCalibration = {
    Z2_target_velocity: (cssValue * 0.85).toFixed(2) + " m/s",
    Z3_range_velocity:  (cssValue * 0.90).toFixed(2) + "–" + (cssValue * 1.00).toFixed(2) + " m/s (CSS pace ±0)",
    Z4_target_velocity: (cssValue * 1.04).toFixed(2) + " m/s",
    Z5_target_velocity: "> " + (cssValue * 1.10).toFixed(2) + " m/s",
    note: "Recalculate zones after each CSS test. Zones shift as CSS improves.",
  };

  return {
    available: true,
    cssValue,
    phaseBenchmark: benchmark,
    interpretation,
    zoneCalibration,
    actionRequired: cssValue < benchmark.min,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

function buildContextOverrideResponse(athlete, override, gapPercent, fatigueIndex, readiness, phase, profile) {
  return {
    athlete: { name: athlete.name, event: athlete.event, category: athlete.category },
    contextOverride: true,
    override,
    gapPercent,
    fatigueIndex, readiness,
    loadPrescription: {
      severity: override.blocked ? "BLOCKED" : override.invalidTrial ? "INVALID_TRIAL" : "TEMPORARY_HOLD",
      volumeChange: 0,
      newDailyVolumeMetres: phase.volumeRange.target,
      rationale: override.reason,
      urgency: override.blocked ? "medical_assessment" : override.invalidTrial ? "repeat_trial" : "hold_and_monitor",
    },
    sessionPrescription: null,
    nextPhaseProjection: null,
    taperSignal: { signal: false },
  };
}

function getCurrentPrimaryZone(zoneDistribution) {
  return Object.entries(zoneDistribution).reduce((a, b) => zoneDistribution[a] > b[1] ? a : b[0]);
}

function shiftZone(currentZone, shift) {
  const zones = ["Z1", "Z2", "Z3", "Z4", "Z5"];
  const idx   = zones.indexOf(currentZone);
  const newIdx = Math.max(0, Math.min(zones.length - 1, idx + shift));
  return zones[newIdx];
}

function normalizeZones(distribution) {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  if (total === 100) return distribution;
  const normalized = {};
  const factor = 100 / total;
  Object.entries(distribution).forEach(([z, v]) => { normalized[z] = Math.round(v * factor); });
  return normalized;
}

function getWeeksToNextMilestone(currentPhase, currentWeek) {
  const milestones = { SPP1: 16, SPP2: 24, COMP: 31, TAPER: 35, CHAMP: 36 };
  const nextMilestone = milestones[currentPhase] ?? 36;
  return Math.max(0, nextMilestone - currentWeek);
}

// ═══════════════════════════════════════════════════════════════════════
// SQUAD-LEVEL ANALYSIS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Analyze full squad and return ranked risk list + group recommendations
 * @param {Array} athletes - Array of athlete objects with results
 * @param {number} currentWeek
 * @param {string} currentPhase
 * @returns {Object} Squad analysis report
 */
function analyzeSquad(athletes, currentWeek, currentPhase) {

  const athleteReports = [];
  const flagged        = [];
  const onTrack        = [];
  const taperCandidates = [];

  for (const athlete of athletes) {
    // Find most recent trial result
    const trialNumber = athlete.results.t3 ? 3 : athlete.results.t2 ? 2 : athlete.results.t1 ? 1 : null;
    if (!trialNumber) continue;

    const report = generateAdaptation(athlete, currentWeek, currentPhase, trialNumber);
    athleteReports.push(report);

    const gap = report.trial?.gapPercent ?? 0;
    if (gap > 5 || report.readiness?.state === "OVERREACHED") {
      flagged.push({ name: athlete.name, gap, state: report.readiness?.state, urgency: report.loadPrescription?.urgency });
    } else if (gap <= 0) {
      onTrack.push({ name: athlete.name, gap, state: report.readiness?.state });
    }

    if (report.taperSignal?.signal) {
      taperCandidates.push({ name: athlete.name, recommendation: report.taperSignal.recommendation });
    }
  }

  // Sort flagged athletes by severity
  flagged.sort((a, b) => b.gap - a.gap);

  // Squad-level phase recommendation
  const avgGap = athleteReports
    .filter(r => r.trial)
    .reduce((sum, r) => sum + (r.trial.gapPercent ?? 0), 0) / Math.max(athleteReports.length, 1);

  const squadPhaseRecommendation = avgGap <= 2
    ? "Squad is on track. Proceed with planned " + currentPhase + " progression."
    : avgGap <= 6
    ? "Squad showing moderate gap (avg " + avgGap.toFixed(1) + "%). Consider 5% volume adjustment for next 2 weeks."
    : "Squad significantly behind (avg " + avgGap.toFixed(1) + "%). Phase plan review recommended.";

  return {
    currentPhase, currentWeek,
    totalAthletes: athletes.length,
    analyzed: athleteReports.length,
    squadAverageGap: parseFloat(avgGap.toFixed(2)),
    squadPhaseRecommendation,
    flaggedAthletes: flagged,
    onTrackAthletes: onTrack,
    taperCandidates,
    individualReports: athleteReports,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════

// For Node.js / Vercel serverless
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    generateAdaptation,
    analyzeSquad,
    calculateFatigueIndex,
    getReadinessState,
    PHASES,
    STROKE_PROFILES,
    INTENSITY_ZONES,
  };
}

// For browser (AQUASTROKE dashboard)
if (typeof window !== "undefined") {
  window.AdaptEngine = {
    generateAdaptation,
    analyzeSquad,
    calculateFatigueIndex,
    getReadinessState,
    PHASES,
    STROKE_PROFILES,
    INTENSITY_ZONES,
  };
}
