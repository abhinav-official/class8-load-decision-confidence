// Pure model for the Load Decision Confidence prototype.
// All computation lives in this module. React components only render results.
// Model rules follow research/phase2-model-v2.md. The dataset lives in data.ts.

export interface Assumptions {
  dieselPricePerGallon: number;
  milesPerGallon: number;
  maintenancePerMile: number;
  tiresPerMile: number;
  defPerMile: number;
  planningSpeedMph: number;
  pickupHandlingHours: number;
  deliveryHandlingHours: number;
  pickupDwellHours: number;
  deliveryDwellHours: number;
  payloadLimitLb: number;
  driverPayPerMile: number | null;
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  dieselPricePerGallon: 6.13,
  milesPerGallon: 6.5,
  maintenancePerMile: 0.2,
  tiresPerMile: 0.05,
  defPerMile: 0.03,
  planningSpeedMph: 45,
  pickupHandlingHours: 1.0,
  deliveryHandlingHours: 1.0,
  pickupDwellHours: 0.5,
  deliveryDwellHours: 0.5,
  payloadLimitLb: 45000,
  driverPayPerMile: null,
};

export interface TruckContext {
  location: string;
  equipment: string;
  driveHoursLeft: number;
  shiftHoursLeft: number;
  cycleHoursLeft: number;
  startMinute: number; // minutes since Day 1 00:00 local
}

export interface TimeWindow {
  day: number; // 1 or 2 in this dataset
  start: string; // "09:00"
  end: string; // "13:00"
}

export interface CallResult {
  rate?: number;
  pickupWindow?: TimeWindow;
  deliveryWindow?: TimeWindow;
  weightLb?: number;
  commodity?: string;
  lumper?: number;
  summary: string; // shown as the "What changed" line after the simulated call
}

export interface LoadPosting {
  id: number;
  origin: string;
  destination: string;
  deadheadMiles: number;
  loadedMiles: number;
  rate: number | null;
  pickupWindow: TimeWindow | null;
  deliveryWindow: TimeWindow | null;
  equipment: string;
  weightLb: number | null;
  commodity: string | null;
  ageHours: number;
  broker: string;
  tolls: number;
  lumper: number | null; // null means not stated; counted as 0 in load-specific costs
  accessorials: string | null;
  callResult: CallResult;
}

export type FieldSource = "board" | "broker call";

export interface ResolvedLoad {
  posting: LoadPosting;
  called: boolean;
  rate: number | null;
  pickupWindow: TimeWindow | null;
  deliveryWindow: TimeWindow | null;
  equipment: string;
  weightLb: number | null;
  commodity: string | null;
  lumper: number | null;
  sources: {
    rate: FieldSource;
    pickupWindow: FieldSource;
    deliveryWindow: FieldSource;
    equipment: FieldSource;
    weight: FieldSource;
  };
}

// A broker call verifies every key field of the load it covers. Fields the call
// corrects or supplies take the call values; the rest keep the posted values.
export function resolveLoad(posting: LoadPosting, called: boolean): ResolvedLoad {
  if (!called) {
    return {
      posting,
      called: false,
      rate: posting.rate,
      pickupWindow: posting.pickupWindow,
      deliveryWindow: posting.deliveryWindow,
      equipment: posting.equipment,
      weightLb: posting.weightLb,
      commodity: posting.commodity,
      lumper: posting.lumper,
      sources: {
        rate: "board",
        pickupWindow: "board",
        deliveryWindow: "board",
        equipment: "board",
        weight: "board",
      },
    };
  }
  const c = posting.callResult;
  return {
    posting,
    called: true,
    rate: c.rate !== undefined ? c.rate : posting.rate,
    pickupWindow: c.pickupWindow !== undefined ? c.pickupWindow : posting.pickupWindow,
    deliveryWindow: c.deliveryWindow !== undefined ? c.deliveryWindow : posting.deliveryWindow,
    equipment: posting.equipment,
    weightLb: c.weightLb !== undefined ? c.weightLb : posting.weightLb,
    commodity: c.commodity !== undefined ? c.commodity : posting.commodity,
    lumper: c.lumper !== undefined ? c.lumper : posting.lumper,
    sources: {
      rate: "broker call",
      pickupWindow: "broker call",
      deliveryWindow: "broker call",
      equipment: "broker call",
      weight: "broker call",
    },
  };
}

// ---------- time helpers ----------

export function parseClock(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  return h * 60 + m;
}

export function windowStartMinute(w: TimeWindow): number {
  return (w.day - 1) * 1440 + parseClock(w.start);
}

export function windowEndMinute(w: TimeWindow): number {
  return (w.day - 1) * 1440 + parseClock(w.end);
}

export function formatMinute(minute: number): string {
  const day = Math.floor(minute / 1440) + 1;
  const within = Math.round(minute - (day - 1) * 1440);
  const hh = Math.floor(within / 60);
  const mm = within - hh * 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `Day ${day} ${pad(hh)}:${pad(mm)}`;
}

export function formatWindow(w: TimeWindow): string {
  return `Day ${w.day} ${w.start} to ${w.end}`;
}

// ---------- economics ----------

export interface VariableCost {
  fuelPerMile: number;
  maintenancePerMile: number;
  tiresPerMile: number;
  defPerMile: number;
  totalPerMile: number;
}

export function variableCost(a: Assumptions): VariableCost {
  const fuelPerMile = a.dieselPricePerGallon / a.milesPerGallon;
  return {
    fuelPerMile,
    maintenancePerMile: a.maintenancePerMile,
    tiresPerMile: a.tiresPerMile,
    defPerMile: a.defPerMile,
    totalPerMile: fuelPerMile + a.maintenancePerMile + a.tiresPerMile + a.defPerMile,
  };
}

export interface Economics {
  evaluable: boolean;
  totalMiles: number;
  variableCostTotal: number;
  loadSpecificCosts: number;
  contribution: number | null;
  perTotalMile: number | null;
  perElapsedHour: number | null;
  afterDriverPay: number | null;
  readout: "Positive contribution" | "Negative contribution" | "Zero contribution" | "Cannot evaluate";
}

export function economics(r: ResolvedLoad, a: Assumptions, elapsedHours: number): Economics {
  const totalMiles = r.posting.deadheadMiles + r.posting.loadedMiles;
  const v = variableCost(a).totalPerMile;
  const variableCostTotal = v * totalMiles;
  const loadSpecificCosts = r.posting.tolls + (r.lumper === null ? 0 : r.lumper);
  if (r.rate === null) {
    return {
      evaluable: false,
      totalMiles,
      variableCostTotal,
      loadSpecificCosts,
      contribution: null,
      perTotalMile: null,
      perElapsedHour: null,
      afterDriverPay: null,
      readout: "Cannot evaluate",
    };
  }
  const contribution = r.rate - variableCostTotal - loadSpecificCosts;
  return {
    evaluable: true,
    totalMiles,
    variableCostTotal,
    loadSpecificCosts,
    contribution,
    perTotalMile: contribution / totalMiles,
    perElapsedHour: elapsedHours > 0 ? contribution / elapsedHours : null,
    afterDriverPay:
      a.driverPayPerMile === null ? null : contribution - a.driverPayPerMile * totalMiles,
    readout:
      contribution > 0
        ? "Positive contribution"
        : contribution < 0
          ? "Negative contribution"
          : "Zero contribution",
  };
}

// ---------- schedule simulation ----------

export interface Simulation {
  pickupArrivalMinute: number;
  deliveryArrivalMinute: number;
  elapsedHours: number;
  resets: number;
  breaks: number;
  steps: string[];
  pickupSlackMinutes: number | null; // window end minus arrival; null when no window posted
  deliverySlackMinutes: number | null;
}

const EPS = 1e-9;

// Deterministic simulation. Sequence: deadhead drive, pickup handling, pickup
// dwell, loaded drive, delivery handling, delivery dwell. Driving consumes the
// drive and shift clocks; handling, dwell and waiting consume the shift clock
// only. After 8.0 h of driving, a 0.5 h break is inserted before more driving.
// When the drive or shift clock would go negative before the next segment, a
// 10 h reset is inserted first (drive restores to 11, shift to 14). The cycle
// clock is decremented by driving and duty time but never binds in this
// dataset and is not restored by a 10 h reset. If the truck arrives before the
// pickup window opens, it waits for the window; waiting consumes shift only.
export function simulate(r: ResolvedLoad, a: Assumptions, truck: TruckContext): Simulation {
  const s = {
    now: truck.startMinute,
    driveLeft: truck.driveHoursLeft * 60,
    shiftLeft: truck.shiftHoursLeft * 60,
    cycleLeft: truck.cycleHoursLeft * 60,
    sinceBreak: 0,
    resets: 0,
    breaks: 0,
    steps: [] as string[],
  };

  const reset = () => {
    s.now += 600;
    s.resets += 1;
    s.driveLeft = 11 * 60;
    s.shiftLeft = 14 * 60;
    s.sinceBreak = 0;
    s.steps.push("10 h reset");
  };

  const restBreak = () => {
    s.now += 30;
    s.breaks += 1;
    s.shiftLeft -= 30;
    s.sinceBreak = 0;
    s.steps.push("30 min break after 8.0 h of driving");
  };

  const drive = (minutes: number, label: string) => {
    s.steps.push(label);
    let remaining = minutes;
    while (remaining > EPS) {
      const chunk = Math.min(remaining, 8 * 60 - s.sinceBreak, s.driveLeft, s.shiftLeft);
      if (chunk > EPS) {
        s.now += chunk;
        s.driveLeft -= chunk;
        s.shiftLeft -= chunk;
        s.cycleLeft -= chunk;
        s.sinceBreak += chunk;
        remaining -= chunk;
        continue;
      }
      if (s.driveLeft <= EPS || s.shiftLeft <= EPS) {
        reset();
        continue;
      }
      if (s.shiftLeft < 30) {
        reset();
      } else {
        restBreak();
      }
    }
  };

  const duty = (minutes: number, label: string) => {
    if (minutes <= EPS) return;
    s.steps.push(label);
    let remaining = minutes;
    while (remaining > EPS) {
      if (s.shiftLeft <= EPS) {
        reset();
        continue;
      }
      const chunk = Math.min(remaining, s.shiftLeft);
      s.now += chunk;
      s.shiftLeft -= chunk;
      s.cycleLeft -= chunk;
      remaining -= chunk;
    }
  };

  const wait = (minutes: number) => {
    if (minutes <= EPS) return;
    s.steps.push(`Wait ${(minutes / 60).toFixed(1)} h for the pickup window to open`);
    let remaining = minutes;
    while (remaining > EPS) {
      if (s.shiftLeft <= EPS) {
        reset();
        continue;
      }
      const chunk = Math.min(remaining, s.shiftLeft);
      s.now += chunk;
      s.shiftLeft -= chunk;
      remaining -= chunk;
    }
  };

  const speed = a.planningSpeedMph;
  const deadheadMinutes = (r.posting.deadheadMiles / speed) * 60;
  const loadedMinutes = (r.posting.loadedMiles / speed) * 60;

  drive(
    deadheadMinutes,
    `Deadhead drive ${r.posting.deadheadMiles} mi, ${(deadheadMinutes / 60).toFixed(1)} h`,
  );
  const pickupArrival = s.now;

  if (r.pickupWindow !== null) {
    wait(windowStartMinute(r.pickupWindow) - s.now);
  }
  duty(a.pickupHandlingHours * 60, `Pickup handling ${a.pickupHandlingHours.toFixed(1)} h`);
  duty(a.pickupDwellHours * 60, `Pickup dwell ${a.pickupDwellHours.toFixed(1)} h`);

  drive(loadedMinutes, `Loaded drive ${r.posting.loadedMiles} mi, ${(loadedMinutes / 60).toFixed(1)} h`);
  const deliveryArrival = s.now;

  duty(a.deliveryHandlingHours * 60, `Delivery handling ${a.deliveryHandlingHours.toFixed(1)} h`);
  duty(a.deliveryDwellHours * 60, `Delivery dwell ${a.deliveryDwellHours.toFixed(1)} h`);

  return {
    pickupArrivalMinute: pickupArrival,
    deliveryArrivalMinute: deliveryArrival,
    elapsedHours: (s.now - truck.startMinute) / 60,
    resets: s.resets,
    breaks: s.breaks,
    steps: s.steps,
    pickupSlackMinutes:
      r.pickupWindow === null ? null : windowEndMinute(r.pickupWindow) - pickupArrival,
    deliverySlackMinutes:
      r.deliveryWindow === null ? null : windowEndMinute(r.deliveryWindow) - deliveryArrival,
  };
}

// ---------- feasibility ----------

export type FeasibilityState = "Fits" | "At risk" | "Does not fit" | "Cannot determine";

export interface Feasibility {
  state: FeasibilityState;
  bindingText: string;
}

export function feasibility(r: ResolvedLoad, sim: Simulation): Feasibility {
  if (r.pickupWindow === null || r.deliveryWindow === null) {
    const missing =
      r.pickupWindow === null && r.deliveryWindow === null
        ? "pickup and delivery windows are"
        : r.pickupWindow === null
          ? "pickup window is"
          : "delivery window is";
    return {
      state: "Cannot determine",
      bindingText: `Cannot determine: the ${missing} not posted, so no appointment can be checked.`,
    };
  }

  const pickupMiss = sim.pickupArrivalMinute - windowEndMinute(r.pickupWindow);
  if (pickupMiss > 0) {
    return {
      state: "Does not fit",
      bindingText:
        `Pickup appointment missed: estimated arrival ${formatMinute(sim.pickupArrivalMinute)} ` +
        `against a ${formatMinute(windowEndMinute(r.pickupWindow))} close, ${Math.round(pickupMiss)} minutes late.`,
    };
  }
  const deliveryMiss = sim.deliveryArrivalMinute - windowEndMinute(r.deliveryWindow);
  if (deliveryMiss > 0) {
    return {
      state: "Does not fit",
      bindingText:
        `Delivery appointment missed: estimated arrival ${formatMinute(sim.deliveryArrivalMinute)} ` +
        `against a ${formatMinute(windowEndMinute(r.deliveryWindow))} close, ${Math.round(deliveryMiss)} minutes late.`,
    };
  }

  const pickupSlack = sim.pickupSlackMinutes as number;
  const deliverySlack = sim.deliverySlackMinutes as number;
  const bindingIsPickup = pickupSlack <= deliverySlack;
  const bindingSlack = bindingIsPickup ? pickupSlack : deliverySlack;
  const bindingName = bindingIsPickup ? "pickup" : "delivery";
  const bindingArrival = bindingIsPickup ? sim.pickupArrivalMinute : sim.deliveryArrivalMinute;
  const bindingClose = windowEndMinute(bindingIsPickup ? r.pickupWindow : r.deliveryWindow);
  const bindingDetail =
    `Binding constraint: ${bindingName} window, estimated arrival ${formatMinute(bindingArrival)} ` +
    `against a ${formatMinute(bindingClose)} close, ${Math.round(bindingSlack)} minutes of slack.`;

  if (sim.resets > 0) {
    const tightestDetail =
      `Tightest window: ${bindingName} window, estimated arrival ${formatMinute(bindingArrival)} ` +
      `against a ${formatMinute(bindingClose)} close, ${Math.round(bindingSlack)} minutes of slack.`;
    return {
      state: "At risk",
      bindingText:
        `At risk: ${sim.resets === 1 ? "a 10 h reset placement decides" : `${sim.resets} 10 h resets decide`} ` +
        `this plan. ${tightestDetail}`,
    };
  }
  if (bindingSlack < 60) {
    return {
      state: "At risk",
      bindingText: `At risk: binding slack is under the 60 minute threshold. ${bindingDetail}`,
    };
  }
  return {
    state: "Fits",
    bindingText: `Fits: both appointments met. ${bindingDetail}`,
  };
}

// ---------- confidence ----------

export interface FieldReadout {
  field: string;
  valueText: string;
  sourceText: string;
}

export interface Confidence {
  label: "High" | "Needs verification";
  operationalRisk: string | null;
  freshnessFlag: boolean;
  annotations: string[];
  fields: FieldReadout[];
}

export function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function confidence(r: ResolvedLoad, a: Assumptions, truck: TruckContext): Confidence {
  const sourceText = (src: FieldSource): string =>
    src === "broker call" ? "broker call, verified" : `board, posted ${r.posting.ageHours} h ago`;

  const fields: FieldReadout[] = [
    {
      field: "Rate",
      valueText: r.rate === null ? "not posted" : `$${money(r.rate)}`,
      sourceText: r.rate === null ? "board" : sourceText(r.sources.rate),
    },
    {
      field: "Pickup window",
      valueText: r.pickupWindow === null ? "not posted" : formatWindow(r.pickupWindow),
      sourceText: r.pickupWindow === null ? "board" : sourceText(r.sources.pickupWindow),
    },
    {
      field: "Delivery window",
      valueText: r.deliveryWindow === null ? "not posted" : formatWindow(r.deliveryWindow),
      sourceText: r.deliveryWindow === null ? "board" : sourceText(r.sources.deliveryWindow),
    },
    {
      field: "Equipment",
      valueText: r.equipment,
      sourceText: sourceText(r.sources.equipment),
    },
    {
      field: "Weight",
      valueText: r.weightLb === null ? "not posted" : `${money(r.weightLb)} lb`,
      sourceText: r.weightLb === null ? "board" : sourceText(r.sources.weight),
    },
  ];

  const missingKeyField =
    r.rate === null || r.pickupWindow === null || r.deliveryWindow === null || r.weightLb === null;
  const freshnessFlag = !r.called && r.posting.ageHours > 12;
  const label: Confidence["label"] =
    !missingKeyField && !freshnessFlag ? "High" : "Needs verification";

  const risks: string[] = [];
  if (r.weightLb !== null && r.weightLb > a.payloadLimitLb) {
    risks.push(
      `weight ${money(r.weightLb)} lb is above the configured payload limit of ${money(a.payloadLimitLb)} lb`,
    );
  }
  if (r.equipment !== truck.equipment) {
    risks.push(`posting requires ${r.equipment}; the truck is ${truck.equipment}`);
  }

  const annotations: string[] = [];
  if (r.commodity === null) {
    annotations.push(
      "Commodity not posted. Commodity can affect acceptance for some carriers; it does not change the economics above.",
    );
  }

  return {
    label,
    operationalRisk: risks.length > 0 ? `Operational risk: ${risks.join("; ")}.` : null,
    freshnessFlag,
    annotations,
    fields,
  };
}

// ---------- suggested action ----------

export function suggestedAction(r: ResolvedLoad, f: Feasibility, e: Economics): string {
  if (f.state === "Does not fit") return "Skip: cannot make the appointment under current clocks.";
  if (r.rate === null) return "Call first: establish the rate.";
  if (r.pickupWindow === null || r.deliveryWindow === null) return "Call first: confirm the window.";
  if (f.state === "At risk") return "Pursue, but confirm times on the call.";
  if (e.contribution !== null && e.contribution < 0) return "Only as a repositioning move";
  return "Pursue.";
}

// ---------- destination market tag ----------

export type DestinationTag = "Strong outbound" | "Average outbound" | "Weak outbound";

const DESTINATION_TAGS: Record<string, DestinationTag> = {
  "Atlanta, GA": "Strong outbound",
  "Kansas City, MO": "Strong outbound",
  "Memphis, TN": "Average outbound",
  "Nashville, TN": "Average outbound",
  "St. Louis, MO": "Average outbound",
  "Houston, TX": "Average outbound",
  "Oklahoma City, OK": "Average outbound",
  "Tulsa, OK": "Average outbound",
  "San Antonio, TX": "Average outbound",
  "Little Rock, AR": "Weak outbound",
  "Shreveport, LA": "Weak outbound",
  "Denver, CO": "Weak outbound",
};

export function destinationTag(destination: string): DestinationTag | null {
  return DESTINATION_TAGS[destination] ?? null;
}

// ---------- full evaluation ----------

export interface Evaluation {
  resolved: ResolvedLoad;
  simulation: Simulation;
  feasibility: Feasibility;
  economics: Economics;
  confidence: Confidence;
  action: string;
  tag: DestinationTag | null;
  postedRatePerLoadedMile: number | null;
}

export function evaluateLoad(
  posting: LoadPosting,
  called: boolean,
  a: Assumptions,
  truck: TruckContext,
): Evaluation {
  const resolved = resolveLoad(posting, called);
  const simulation = simulate(resolved, a, truck);
  const feas = feasibility(resolved, simulation);
  const econ = economics(resolved, a, simulation.elapsedHours);
  const conf = confidence(resolved, a, truck);
  return {
    resolved,
    simulation,
    feasibility: feas,
    economics: econ,
    confidence: conf,
    action: suggestedAction(resolved, feas, econ),
    tag: destinationTag(posting.destination),
    postedRatePerLoadedMile: posting.rate === null ? null : posting.rate / posting.loadedMiles,
  };
}
