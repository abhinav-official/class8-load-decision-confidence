# Load Decision Confidence: build-ready model v2 (supersedes phase2-model.md where they conflict)

Written after the ChatGPT Phase 2 teardown. The dataset (12 loads, truck in Dallas) is unchanged from phase2-model.md, except every load's load-specific costs S are itemized (tolls, lumper) as explicit data fields.

## Positioning (unchanged)
A decision-support surface over Class8's stack. Never claims Class8 lacks profitability ranking. Shows inputs and assumptions in text next to every number. No collapsed score anywhere.

## Assumptions (all editable in the UI, all labelled)
- Diesel price: $6.13 per gallon. Source: EIA US on-highway diesel, week of Nov 9 2026 ($6.127), verified 2026-11-17. UI label: "EIA US average, week of Nov 9 2026. Use your fleet's effective fuel cost."
- Fuel economy: 6.5 MPG. Fuel cost per mile = price / MPG = $0.94.
- Maintenance reserve $0.20 per mile. Tire reserve $0.05 per mile. DEF $0.03 per mile. (Maintenance and tires match ATRI 2025 reporting of about $0.215 and $0.050.)
- Variable cost V = fuel + maintenance + tires + DEF = $1.22 per total mile, charged on deadhead plus loaded miles. The UI shows the components and derives V; V is never a single unexplained input.
- Driver compensation: EXCLUDED from contribution. The UI states this in the assumptions panel. An optional driver-pay-per-mile input (default empty) adds a secondary "contribution after driver pay" line when set.
- Fixed carrier costs and overheads: NOT allocated anywhere in v2. No operating profit metric exists.
- Planning speed: 45 mph, labelled "planning speed, moving average".
- Handling: pickup handling 1.0 h, delivery handling 1.0 h. Dwell: expected pickup dwell 0.5 h, expected delivery dwell 0.5 h. Four separate inputs.
- Configured equipment payload limit: 45,000 lb (a configured limit for this truck, not a legal claim).

## Economics
- Contribution C = R - V x (L + D) - S. R is the posted or call-confirmed rate. S is itemized per load.
- Displayed per load: contribution in dollars, contribution per total mile, contribution per elapsed truck-hour (schedule below). If rate is missing: "Cannot evaluate, no rate posted" and no economics numbers.
- Economics readout in words: Positive contribution / Negative contribution / Cannot evaluate. No Strong/Weak bands.

## Schedule simulation (deterministic, steps shown in text per load)
Driver state: drive hours left today 9.0, shift hours left today 12.0, cycle hours left 52.0 (displayed; cycle is tracked but does not bind in this dataset).
Sequence: deadhead drive, pickup handling, pickup dwell, loaded drive, delivery handling, delivery dwell.
Rules: driving consumes drive and shift clocks; handling and dwell consume shift clock only. After 8.0 h of driving in a day, insert a 0.5 h break (consumes shift, not drive). When drive or shift clock would go negative before the next segment, insert a 10 h reset first (drive restores to 11, shift to 14) and count it. Elapsed time is the full wall-clock sum including breaks and resets.
Outputs per load: estimated pickup arrival vs pickup window (slack in minutes), estimated delivery arrival vs delivery window (slack), resets required, elapsed hours, and the simulation steps as a short text line.
Feasibility states: Fits (both appointments met, binding slack at least 60 minutes), At risk (appointments met but binding slack under 60 minutes, or a reset placement decides it), Does not fit (an appointment is missed under the simulation), Cannot determine (pickup or delivery window missing).
The UI shows, verbatim: "Preliminary feasibility warning from estimated times. Not a compliance check."
The binding constraint is named in text, for example: "Delivery appointment at risk: estimated arrival 14:20 against a 13:00 close, 80 minutes short."

## Confidence (independent of economics and feasibility)
Per key field (rate, pickup window, delivery window, equipment, weight): value, source (board or broker call), age or verified marker.
Load confidence: High (all key fields present and either freshly posted or call-verified), Needs verification (any key field missing or the posting flagged "not recently verified": posted more than 12 h ago, shown as a freshness flag, never as a rejection).
Weight above the configured payload limit, or equipment mismatch: flagged "Operational risk" as its own marker, separate from confidence.
Missing commodity: annotation only, with the note that commodity can affect acceptance for some carriers.

## Suggested action (rule-based, shown as text)
- Feasibility Does not fit: "Skip: cannot make the appointment under current clocks."
- Rate missing: "Call first: establish the rate." Window missing: "Call first: confirm the window."
- Feasibility At risk: "Pursue, but confirm times on the call."
- Negative contribution: "Only as a repositioning move" (read with the destination market tag).
- Otherwise: "Pursue."
Confidence and economics never merge into the action beyond these rules; all three readouts stay visible separately.

## Opportunity (informational only)
Destination tag Strong / Average / Weak outbound from the static table in phase2-model.md. Labelled "static illustration, not live market data". Never used by the action rules.

## Broker call update
Each load carries a scripted call result (from the update table in phase2-model.md). Clicking "Simulate broker call" applies it: fields become call-verified, values update, all dimensions recompute, and a short "what changed" text line appears. A reset restores the posted state. Load 6 is the showcase: rate revised $1,700 to $1,580 and window corrected; confidence rises to High while contribution falls. The UI must present those as two separate facts.

## What v2 removed, and why (for the README)
Operating profit and the per-mile fixed allocation (misleading without driver pay and time-based allocation), the single handling constant, the 12 h stale rejection (now a freshness flag), pursue-blocking on missing fields (now a call-first action), and the word "profit" for the headline metric (it is contribution).
