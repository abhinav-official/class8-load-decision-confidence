import { useMemo, useState } from "react";
import {
  DEFAULT_ASSUMPTIONS,
  evaluateLoad,
  formatMinute,
  formatWindow,
  variableCost,
  type Assumptions,
  type Evaluation,
} from "./model";
import { LOADS, TRUCK } from "./data";

type SortKey = "posted" | "perMile" | "perHour";

const d2 = (n: number): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const h1 = (n: number): string => n.toFixed(1);

function NumField(props: {
  label: string;
  value: number;
  note?: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        type="number"
        step="any"
        value={props.value}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          props.onChange(Number.isNaN(n) ? 0 : n);
        }}
      />
      {props.note ? <span className="note">{props.note}</span> : null}
    </label>
  );
}

function LoadBlock(props: {
  ev: Evaluation;
  variableCostPerMile: number;
  onCall: () => void;
  onReset: () => void;
}) {
  const { ev } = props;
  const r = ev.resolved;
  const p = r.posting;
  const e = ev.economics;
  const sim = ev.simulation;
  const conf = ev.confidence;

  const windowText = (w: typeof r.pickupWindow): string =>
    w === null ? "not posted" : formatWindow(w);
  const slackText = (min: number | null): string =>
    min === null ? "window not posted" : `slack ${Math.round(min)} min`;

  return (
    <div className="load">
      <h3>
        Load {p.id}: {p.origin} to {p.destination}
      </h3>
      <p>
        Broker: {p.broker}. Equipment required: {p.equipment}. Posted {p.ageHours} h ago. Deadhead{" "}
        {p.deadheadMiles} mi, loaded {p.loadedMiles} mi, total {e.totalMiles} mi.
        {ev.postedRatePerLoadedMile !== null
          ? ` Posted rate per loaded mile: $${d2(ev.postedRatePerLoadedMile)}.`
          : " No rate posted."}
      </p>
      <p>
        Posting fields: rate {r.rate === null ? "not posted" : `$${d2(r.rate)}`}; pickup window{" "}
        {windowText(r.pickupWindow)}; delivery window {windowText(r.deliveryWindow)}; weight{" "}
        {r.weightLb === null ? "not posted" : `${r.weightLb.toLocaleString("en-US")} lb`}; commodity{" "}
        {r.commodity === null ? "not posted" : r.commodity}.
      </p>
      {p.accessorials !== null ? (
        <p>Stated accessorials (never counted in revenue): {p.accessorials}.</p>
      ) : null}

      <p className="subhead">Economics</p>
      {e.evaluable ? (
        <>
          <p>
            Rate ${d2(r.rate as number)} minus variable cost ${d2(e.variableCostTotal)} (
            {e.totalMiles} total miles at ${props.variableCostPerMile.toFixed(3)} per mile) minus
            load-specific costs ${d2(e.loadSpecificCosts)} (tolls ${d2(p.tolls)};{" "}
            {r.lumper === null ? "lumper not stated, counted as $0.00" : `lumper $${d2(r.lumper)}`})
            = contribution ${d2(e.contribution as number)}.
          </p>
          <p>
            Contribution per total mile: ${d2(e.perTotalMile as number)}. Contribution per elapsed
            truck-hour: ${d2(e.perElapsedHour as number)} (elapsed {h1(sim.elapsedHours)} h from the
            simulation below). Readout: {e.readout}.
          </p>
          {e.afterDriverPay !== null ? (
            <p>
              Contribution after driver pay: ${d2(e.afterDriverPay)} (the driver pay input is set,
              so it is deducted on this line only; it is excluded everywhere else on this page).
            </p>
          ) : null}
        </>
      ) : (
        <p>Cannot evaluate, no rate posted.</p>
      )}

      <p className="subhead">Feasibility</p>
      <p>
        Feasibility: {ev.feasibility.state}. {ev.feasibility.bindingText}
      </p>
      <p>
        Estimated pickup arrival {formatMinute(sim.pickupArrivalMinute)}, window{" "}
        {windowText(r.pickupWindow)}, {slackText(sim.pickupSlackMinutes)}. Estimated delivery
        arrival {formatMinute(sim.deliveryArrivalMinute)}, window {windowText(r.deliveryWindow)},{" "}
        {slackText(sim.deliverySlackMinutes)}. Resets required: {sim.resets}. Elapsed time:{" "}
        {h1(sim.elapsedHours)} h.
      </p>
      <p>Simulation steps: {sim.steps.join(". ")}.</p>

      <p className="subhead">Confidence</p>
      <p>
        Confidence: {conf.label}.
        {conf.freshnessFlag
          ? ` Freshness flag: posted ${p.ageHours} h ago, not recently verified.`
          : ""}
      </p>
      <ul className="fields">
        {conf.fields.map((f) => (
          <li key={f.field}>
            {f.field}: {f.valueText} (source: {f.sourceText})
          </li>
        ))}
      </ul>
      {conf.operationalRisk !== null ? <p>{conf.operationalRisk}</p> : null}
      {conf.annotations.map((note) => (
        <p key={note}>Note: {note}</p>
      ))}

      <p className="subhead">Destination and action</p>
      {ev.tag !== null ? (
        <p>
          Destination market: {p.destination}, {ev.tag}. Static illustration, not live market data.
        </p>
      ) : null}
      <p>Suggested action: {ev.action}</p>

      {r.called ? (
        <>
          <p className="what-changed">What changed: {p.callResult.summary}</p>
          <button type="button" onClick={props.onReset}>
            Reset load to posted state
          </button>
        </>
      ) : (
        <button type="button" onClick={props.onCall}>
          Simulate broker call
        </button>
      )}
    </div>
  );
}

export default function App() {
  const [assump, setAssump] = useState<Assumptions>(DEFAULT_ASSUMPTIONS);
  const [driverPayInput, setDriverPayInput] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("perMile");
  const [called, setCalled] = useState<Record<number, boolean>>({});

  const a: Assumptions = useMemo(
    () => ({
      ...assump,
      driverPayPerMile:
        driverPayInput.trim() === "" || Number.isNaN(parseFloat(driverPayInput))
          ? null
          : parseFloat(driverPayInput),
    }),
    [assump, driverPayInput],
  );
  const v = variableCost(a);

  const set = (patch: Partial<Assumptions>) => setAssump((prev) => ({ ...prev, ...patch }));

  const evaluations = useMemo(
    () => LOADS.map((load) => evaluateLoad(load, called[load.id] === true, a, TRUCK)),
    [a, called],
  );

  const sorted = useMemo(() => {
    const keyOf = (ev: Evaluation): number | null =>
      sortKey === "posted"
        ? ev.postedRatePerLoadedMile
        : sortKey === "perMile"
          ? ev.economics.perTotalMile
          : ev.economics.perElapsedHour;
    return [...evaluations].sort((x, y) => {
      const kx = keyOf(x);
      const ky = keyOf(y);
      if (kx === null && ky === null) return x.resolved.posting.id - y.resolved.posting.id;
      if (kx === null) return 1;
      if (ky === null) return -1;
      if (ky !== kx) return ky - kx;
      return x.resolved.posting.id - y.resolved.posting.id;
    });
  }, [evaluations, sortKey]);

  return (
    <div>
      <h1>Load Decision Confidence</h1>
      <p>Prototype. Illustrative dataset, not live market data.</p>
      <p>
        Truck context: {TRUCK.location}. 53 ft dry van. Evaluation time Day 1 08:00. Clocks: drive{" "}
        {h1(TRUCK.driveHoursLeft)} h left, shift {h1(TRUCK.shiftHoursLeft)} h left, cycle{" "}
        {h1(TRUCK.cycleHoursLeft)} h left.
      </p>

      <div className="panel">
        <p>
          How to read this: economics, feasibility and confidence are three independent readouts.
          Economics says what a load contributes after variable mileage cost and load-specific
          costs. Feasibility says whether the estimated times meet the posted windows under the
          driver's current clocks. Confidence says how much of the decision rests on unverified
          posting data. A load can be attractive and unverified, or verified and unattractive.
          Nothing on this page combines the three into a single score.
        </p>
      </div>

      <h2>Assumptions (all editable)</h2>
      <div className="panel">
        <div className="fields-grid">
          <NumField
            label="Diesel price, $ per gallon"
            value={a.dieselPricePerGallon}
            note="EIA US average, week of Nov 9 2026. Use your fleet's effective fuel cost."
            onChange={(n) => set({ dieselPricePerGallon: n })}
          />
          <NumField
            label="Fuel economy, MPG"
            value={a.milesPerGallon}
            onChange={(n) => set({ milesPerGallon: n })}
          />
          <NumField
            label="Maintenance reserve, $ per mile"
            value={a.maintenancePerMile}
            onChange={(n) => set({ maintenancePerMile: n })}
          />
          <NumField
            label="Tire reserve, $ per mile"
            value={a.tiresPerMile}
            onChange={(n) => set({ tiresPerMile: n })}
          />
          <NumField
            label="DEF, $ per mile"
            value={a.defPerMile}
            onChange={(n) => set({ defPerMile: n })}
          />
          <NumField
            label="Planning speed, mph"
            value={a.planningSpeedMph}
            note="Planning speed, moving average."
            onChange={(n) => set({ planningSpeedMph: n })}
          />
          <NumField
            label="Pickup handling, hours"
            value={a.pickupHandlingHours}
            onChange={(n) => set({ pickupHandlingHours: n })}
          />
          <NumField
            label="Delivery handling, hours"
            value={a.deliveryHandlingHours}
            onChange={(n) => set({ deliveryHandlingHours: n })}
          />
          <NumField
            label="Expected pickup dwell, hours"
            value={a.pickupDwellHours}
            onChange={(n) => set({ pickupDwellHours: n })}
          />
          <NumField
            label="Expected delivery dwell, hours"
            value={a.deliveryDwellHours}
            onChange={(n) => set({ deliveryDwellHours: n })}
          />
          <NumField
            label="Configured payload limit, lb"
            value={a.payloadLimitLb}
            note="A configured limit for this truck, not a legal claim."
            onChange={(n) => set({ payloadLimitLb: n })}
          />
          <label className="field">
            <span>Driver pay, $ per mile (optional)</span>
            <input
              type="number"
              step="any"
              value={driverPayInput}
              placeholder="blank"
              onChange={(e) => setDriverPayInput(e.target.value)}
            />
            <span className="note">Blank means driver pay stays excluded from contribution.</span>
          </label>
        </div>
        <p>
          Variable cost per total mile: fuel ${d2(v.fuelPerMile)} (diesel $
          {d2(a.dieselPricePerGallon)} per gallon / {a.milesPerGallon} MPG) + maintenance $
          {d2(v.maintenancePerMile)} + tires ${d2(v.tiresPerMile)} + DEF ${d2(v.defPerMile)} = $
          {d2(v.totalPerMile)} per mile, charged on deadhead plus loaded miles.
        </p>
        <p>
          Driver compensation and fixed carrier costs are excluded from contribution, unless the
          driver pay per mile input above is set.
        </p>
      </div>

      <h2>Loads</h2>
      <p className="disclaimer">
        Preliminary feasibility warning from estimated times. Not a compliance check.
      </p>
      <div className="sortbar">
        <span>Sort loads by: </span>
        <label>
          <input
            type="radio"
            name="sort"
            checked={sortKey === "posted"}
            onChange={() => setSortKey("posted")}
          />{" "}
          Posted rate per loaded mile (the headline view)
        </label>
        <label>
          <input
            type="radio"
            name="sort"
            checked={sortKey === "perMile"}
            onChange={() => setSortKey("perMile")}
          />{" "}
          Contribution per total mile
        </label>
        <label>
          <input
            type="radio"
            name="sort"
            checked={sortKey === "perHour"}
            onChange={() => setSortKey("perHour")}
          />{" "}
          Contribution per elapsed truck-hour
        </label>
      </div>

      {sorted.map((ev) => (
        <LoadBlock
          key={ev.resolved.posting.id}
          ev={ev}
          variableCostPerMile={v.totalPerMile}
          onCall={() => setCalled((prev) => ({ ...prev, [ev.resolved.posting.id]: true }))}
          onReset={() => setCalled((prev) => ({ ...prev, [ev.resolved.posting.id]: false }))}
        />
      ))}
    </div>
  );
}
