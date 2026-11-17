# ChatGPT teardown of Phase 2 model (17 Nov 2026)
Same conversation: https://chatgpt.com/c/6afc1afc-2aa4-83ee-930c-1d7e64fd0a98

## Verdict
Keep the concept, rework the economics. Do not build the model exactly as written.

## The three fixes that matter (its ranking)
1. Correct the economic model: recalibrate fuel, separate variable from fixed, account for driver compensation or explicitly exclude it, stop calling the third metric operating profit, separate contribution per active hour from per elapsed truck-hour, make all load-specific costs explicit.
2. Correct time and feasibility: include mandatory breaks and resets, separate active time from elapsed commitment, split pickup/delivery dwell, model appointment slack, show the binding constraint, add an insufficient-information outcome.
3. Separate confidence from recommendation: missing rate means economics cannot be evaluated (not "do not call"); stale triggers verification; high confidence must not imply high profitability; track source/timestamp separately from verification; outbound tags informational only.

## Specific points accepted
- Fuel default challenged: it cites EIA Nov 9 2026 weekly diesel at $6.127/gal (fuel $0.943/mi at 6.5 MPG, V becomes $1.223). TO VERIFY independently before adopting; either way the price becomes a prominent editable, dated assumption and the carrier's effective cost is the real input.
- Maintenance $0.20 and tires $0.05 match ATRI 2025 reporting (~$0.215 / ~$0.050). Keep.
- Driver wages + benefits ~$1.03/mi (ATRI 2025) are nowhere in the model. Operating profit metric REMOVED. Contribution only, exclusion labelled, optional driver-pay input.
- Fixed allocation by miles is misleading (same miles, different hours). Removed from ranking entirely.
- Truck-hour redefined as ELAPSED: Load 3 with a required 10 h reset falls from $70.89 active to $47.77 elapsed, which REVERSES the Load 2 vs Load 3 hourly ranking. The model must simulate the schedule (drive chunks, breaks, resets), not divide by a constant.
- Feasibility: show estimated arrivals, slack, and the binding constraint in text; add "Cannot determine" for missing windows; pickup and delivery feasibility are separate questions.
- Confidence redesign: investigate vs accept are different decisions. Missing rate routes to "call to establish rate". Field states conflate presence, age and verification; model value + source + updated + verified separately, derive display.
- Nashville lesson: after the call, confidence High AND economics Marginal must display as independent outcomes, never one flipped label.
- Dataset: make tolls explicit per load (it caught the implied $10 / $25 in Loads 1 and 3); Load 1's trap is geographically real (Dallas truck, Jackson pickup) so it stays, noted as illustrative; sensitivity is demonstrated through the editable assumptions and broker updates.
- 45,000 lb renamed "configured equipment payload limit", a warning, not a legality claim.
- Handling split into pickup handling, delivery handling, pickup dwell, delivery dwell (defaults 1.0 / 1.0 / 0.5 / 0.5).
- Outbound market tags: informational only, never part of a recommendation.
