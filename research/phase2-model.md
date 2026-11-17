# Phase 2 Model Spec: Load Decision Confidence

## 1. Purpose and positioning

The prototype demonstrates a Load Decision Confidence surface: for each loadboard posting, it shows the economics, feasibility, confidence and onward opportunity behind a pursue or skip decision, with every input and assumption visible in plain text. It does not replace Class8's Load Optimization, Dispatch AI or Voice AI. It sits in front of them. Load Optimization can rank, Dispatch AI can plan multi-leg routes, and Voice AI can call many brokers at once, but a human still decides which opportunities deserve attention first. Because the surface is OEM-native, it uses the truck's real location and real ELD clocks as inputs, which a generic loadboard tool cannot know. When a broker call returns verified facts, the same surface updates. (132 words)

Positioning rules carried through the whole spec:

- The prototype never claims Class8 lacks profitability ranking. It explores how a decision the existing products feed into can be made transparent, explainable and actionable.
- No number is shown without its inputs and assumptions next to it.
- The four dimensions are always shown separately. Nothing in this spec produces a single collapsed score.

## 2. Inputs

### 2.1 Truck and driver context object

In production these fields come from the truck itself (OEM telematics and the ELD), not from manual entry. That is the OEM-native input advantage: a generic board tool does not know where the truck is or what its clocks say.

| Field | Dataset value | Source |
|---|---|---|
| Current location | Dallas, TX | OEM telematics |
| Equipment type | 53 ft dry van | Carrier profile |
| Drive hours left (11 h clock) | 9.0 h | ELD |
| Shift hours left (14 h clock) | 12.0 h | ELD |
| Cycle hours left (70 h / 8 day) | 52.0 h | ELD |
| Home-time preference | None stated for this dataset | Carrier profile |
| Evaluation time ("now") | Day 1, 08:00 local | System |

### 2.2 Per-load fields (from the posting)

Fields marked "commonly missing" are absent or vague on real postings often enough that the model must handle their absence explicitly instead of guessing.

| Field | Notes |
|---|---|
| Origin city and state | Always posted |
| Destination city and state | Always posted |
| Posted rate (flat, USD) | Commonly missing; some postings say call for rate |
| Loaded miles | Usually posted; occasionally missing |
| Deadhead miles to pickup | Never posted; computed from truck location to origin |
| Pickup window (day, start, end) | Commonly missing or given as a single time with no window |
| Delivery window (day, start, end) | Commonly missing or vague ("deliver next day") |
| Equipment required | Always posted |
| Weight (lb) | Commonly missing |
| Commodity | Commonly missing |
| Posting age (hours since posted) | Shown on some boards, hidden on others |
| Broker name | Always posted |
| Tolls for the load (USD) | Never posted; estimated by the model, editable |
| Lumper fee (USD) | Commonly missing; often learned only at the dock or on the call |
| Accessorials if stated (for example detention terms) | Commonly missing; stated terms are not guaranteed revenue |

## 3. Economics model

### 3.1 Layer 1: load contribution

C = R - V - S

- R = posted flat rate for the load, in USD. Stated accessorials (for example a detention rate) are displayed next to R as possible additional revenue and are never included in R, because they are not guaranteed.
- V = variable mileage cost = variable cost per mile x total miles. Total miles = deadhead miles + loaded miles. The truck burns cost on empty miles too, so V is charged on total miles, not loaded miles.
- S = load-specific costs = tolls for the load + lumper fee when stated + reefer fuel when applicable. Reefer fuel is defined here for completeness and is 0 for every load in this dry van dataset.

Variable cost per mile build-up. Every line is an assumption and is editable in the UI:

| Component | Assumption | Basis |
|---|---|---|
| Fuel | $0.60 per mile | Fuel price $3.90 per gallon (assumption) / 6.5 MPG (assumption) = $0.60 per mile |
| Maintenance reserve | $0.20 per mile | Assumption |
| Tire reserve | $0.05 per mile | Assumption |
| DEF | $0.03 per mile | Assumption |
| **Variable cost per mile** | **$0.88 per mile** | Sum of the four lines above |

Other Layer 1 defaults: tolls are a per-load estimate entered with the load (editable, default $0 when no toll route is expected). Lumper is $0 unless the posting states a fee.

### 3.2 Layer 2: estimated operating profit

P = C - F

- F = allocated fixed cost = $0.60 per total mile.
- Allocation basis, stated honestly: fixed costs are assumed at $270 per operating day (assumption: insurance, equipment payment, trailer cost, permits and administration) and are spread over an assumed 450 total miles per operating day (assumption). $270 / 450 = $0.60 per total mile.
- Limit of Layer 2: the allocation is only as good as the utilization assumption. A truck that runs fewer than 450 total miles in a day carries more fixed cost per mile than this model shows. Layer 2 is an estimate for comparison between loads, not an accounting figure.

### 3.3 The three displayed metrics

1. Contribution per total mile = C / total miles.
2. Contribution per truck-hour = C / total hours committed.
   Total hours committed = deadhead drive time + loaded drive time + loading time + unloading time + expected dwell.
   Drive times use an average speed of 45 mph (assumption). Loading time 1.5 h (assumption). Unloading time 1.5 h (assumption). Expected dwell 1.0 h (assumption). Total handling plus dwell is therefore 4.0 h on every load in this dataset.
   The 10 h reset is rest, not committed working time, and is excluded from total hours committed. Section 4 uses it for arrival timing only.
3. Estimated operating profit per total mile = P / total miles = (C / total miles) - $0.60.

The three metrics are displayed side by side. They are never averaged, weighted or collapsed into one score, because they answer different questions: per mile rewards distance efficiency, per truck-hour rewards time efficiency, and Layer 2 shows what is left after fixed costs.

## 4. Feasibility model

This is a WARNING system, not a compliance check. It estimates whether a load appears to fit the driver's current clocks and the stated appointment windows. It does not verify Hours of Service compliance, and it cannot: sleeper berth splits, personal conveyance, adverse driving conditions and edits to logs can all change the legal picture in ways estimated times cannot see.

The UI must show this sentence wherever a feasibility state appears, verbatim:

"Preliminary feasibility warning from estimated times. Not a compliance check."

### 4.1 Inputs and timing rules

- Drive hours left, shift hours left, cycle hours left (from the context object).
- Pickup and delivery windows (from the posting).
- Estimated drive times at an average speed of 45 mph (assumption, shared with Section 3).

Timing computation, in order:

1. Pickup arrival = evaluation time + (deadhead miles / 45).
2. Pickup departure = the later of (pickup arrival, pickup window start) + 1.5 h loading (assumption).
3. Drive need = (deadhead miles + loaded miles) / 45.
4. If drive need is greater than drive hours left, one 10 h reset (assumption) is inserted before delivery. Delivery arrival = pickup departure + (loaded miles / 45) + 10 h. If drive need fits within drive hours left, no reset is inserted and delivery arrival = pickup departure + (loaded miles / 45).
5. Margins: pickup margin = pickup window end - pickup arrival. Delivery margin = delivery window end - delivery arrival. Drive clock margin (only when no reset is needed) = drive hours left - drive need.

### 4.2 Output states (exactly three)

| State | Rule |
|---|---|
| Does not fit current clocks | Pickup arrival is after the pickup window end, OR delivery arrival is after the delivery window end. |
| Tight: depends on appointment and dwell assumptions | The load fits, but at least one of these holds: a reset was required; pickup margin is under 1.0 h; delivery margin is under 1.0 h; drive clock margin is under 1.0 h. |
| Fits current clocks | Neither of the above. |

The 1.0 h margin threshold is an assumption, chosen because the dwell assumption itself is 1.0 h: any plan with less slack than the dwell estimate is one slow dock away from failing.

## 5. Confidence model

Confidence describes how much of the decision rests on unverified posting data. It is field-specific. Missing information (uncertainty), stale information (possibly no longer valid) and poor economics (unattractive) are three different things and are never merged.

### 5.1 Per-field states

| State | Meaning |
|---|---|
| Verified | Confirmed by a broker call result, or supplied by the truck itself (location, clocks, equipment). |
| Posted | Present on the posting, not yet confirmed. |
| Missing | Absent from the posting. |
| Stale | Present, but the posting age is over 12 h. Threshold justification: Class8's own solution page states that per mile rates in a lane can fluctuate by a full dollar in a single day, so a posting older than half a day cannot be trusted on rate or availability. |

### 5.2 Rule table

| Condition | Effect |
|---|---|
| Rate missing or stale | Blocks a pursue recommendation. The single most decision-critical field is unknown or may have moved. |
| Pickup window missing | Blocks a pursue recommendation. Feasibility cannot be checked without it. |
| Delivery window missing | Blocks a pursue recommendation. Feasibility cannot be checked without it. |
| Equipment mismatch (posting equipment differs from truck equipment) | Operational risk. The load cannot be hauled as posted. |
| Weight stated above 45,000 lb | Operational risk. 45,000 lb is the planning limit for a 53 ft dry van (assumption). |
| Commodity missing | Annotate only. Worth one question on the call; does not change the economics. |
| Weight missing | Annotate only. Unknown is not the same as over the limit; ask on the call. |
| Accessorials unstated | Annotate only. They are never counted in revenue either way (Section 3.1). |

### 5.3 Output labels

| Label | Producing rule |
|---|---|
| High confidence | No blocking condition and no operational risk condition. Annotations are allowed. |
| Verify first | At least one blocking condition and no operational risk condition. The correct next action is a call, not a decision. |
| Operational risk | Equipment mismatch or stated weight above the planning limit, regardless of anything else. |

## 6. Opportunity model

Deadhead has a third dimension beyond miles: where the load leaves the truck. The opportunity dimension is a destination market tag taken from a small static table covering only the destination cities in this dataset.

| Destination | Tag |
|---|---|
| Atlanta, GA | Strong outbound |
| Kansas City, MO | Strong outbound |
| Memphis, TN | Average outbound |
| Nashville, TN | Average outbound |
| St. Louis, MO | Average outbound |
| Houston, TX | Average outbound |
| Oklahoma City, OK | Average outbound |
| Tulsa, OK | Average outbound |
| San Antonio, TX | Average outbound |
| Little Rock, AR | Weak outbound |
| Shreveport, LA | Weak outbound |
| Denver, CO | Weak outbound |

What it means: a Strong outbound market is one where a truck is likely to find its next load quickly at workable rates; a Weak outbound market is one where the truck may sit or deadhead far to its next load, so part of this load's contribution should be mentally reserved for the cost of getting out.

Its limit, stated in the UI: this table is a static illustration for the prototype, not live market data. In production this dimension would come from market data feeds, and the tag would carry a date.

## 7. The broker-response update

Voice AI already calls brokers to confirm availability, get missing details and negotiate rates. The prototype's contribution is what happens to the decision when those answers come back: every returned fact replaces a posted, missing or stale field with a verified one, and all four dimensions re-run.

### 7.1 What a call result can change

| Call result | Field change | Dimensions that re-run |
|---|---|---|
| Rate confirmed as posted | Rate: posted or stale becomes verified | Confidence |
| Rate revised up or down | Rate value changes; state becomes verified | Economics, Confidence |
| Load no longer available | Load is removed from the board | All (load exits) |
| Pickup window corrected | Pickup window value changes; state becomes verified | Feasibility, Confidence |
| Delivery window corrected or supplied | Delivery window value changes; state becomes verified | Feasibility, Confidence |
| Lumper fee confirmed | Lumper moves from unknown to a stated cost in S | Economics, Confidence |
| Weight filled in | Weight: missing becomes verified | Confidence (and Operational risk check re-runs) |
| Commodity filled in | Commodity: missing becomes verified | Confidence (annotation cleared) |

Rule: any field change re-runs all four dimensions, so the surface never shows a new rate next to a stale feasibility state.

### 7.2 Worked narrative: Load 6 after a call

Load 6 (Dallas, TX to Nashville, TN) is a stale posting, age 31 h, posted rate $1,700. Before the call it is labelled Verify first: the rate may have moved, so no pursue decision is allowed. Its economics at the posted rate: total miles 685, V = $602.80, S = $0, C = $1,097.20, contribution per total mile $1.60.

The call comes back with three facts: the load is still available, the rate is now $1,580 (the lane moved, exactly the risk the stale flag exists for), and the pickup window is corrected from Day 1 09:00-13:00 to Day 1 11:00-15:00.

Re-run: the rate becomes verified at $1,580, so C = $1,580 - $602.80 - $0 = $977.20 and contribution per total mile falls to $1.43. Feasibility re-runs with the corrected window: pickup departure becomes 12:30, delivery arrival becomes Day 2 13:10 against a window ending Day 2 18:00, still Tight because a reset is required. The confidence label changes from Verify first to High confidence.

The decision the surface now supports is honest in both directions: the load is pursuable, and it is worth $120 less than the posting claimed. Without the update loop, the dispatcher would have pursued it on a rate that no longer existed.

## 8. Dataset design

One truck, starting in Dallas, TX, context as in Section 2.1. Twelve dry van loads. The set is designed, not sampled: each of the first seven loads exists to exercise one behaviour of the model, and loads 8 to 12 are plausible mid-pack loads so the designed cases have something realistic to be compared against.

| # | Designed purpose |
|---|---|
| 1 | Headline-rate trap: highest posted rate per loaded mile on the board, collapses once deadhead and hours are counted |
| 2 | Wins on contribution per total mile (the comparison load for Load 3) |
| 3 | Wins on contribution per truck-hour but not per total mile |
| 4 | Good immediate numbers delivering into a weak outbound market |
| 5 | Missing rate |
| 6 | Stale posting (age 31 h) |
| 7 | Does not fit the driver's clocks (pickup unreachable inside its window) |
| 8 to 12 | Plausible mid-pack loads |

Full input table. "null" means the field is designed missing on the posting. Windows are Day 1 (D1) or Day 2 (D2) local times. Tolls are the model's per-load estimate (Section 3.1). Accessorials are stated terms only; they are never counted in revenue.

| # | Origin | Destination | Deadhead mi | Loaded mi | Posted rate USD | Pickup window | Delivery window | Equipment | Weight lb | Commodity | Age h | Broker | Tolls USD | Lumper USD | Accessorials stated |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Jackson, MS | Memphis, TN | 390 | 210 | 1200 | D1 10:00-18:00 | D2 08:00-12:00 | Dry van 53 ft | 38500 | Bottled beverages | 3 | Apex Freight Partners | 10 | null | null |
| 2 | Dallas, TX | Houston, TX | 10 | 240 | 820 | D1 09:00-13:00 | D1 14:00-20:00 | Dry van 53 ft | 22000 | Retail general merchandise | 1 | LoneStar Brokerage | 0 | null | Detention $50/h after 2 h |
| 3 | Fort Worth, TX | Atlanta, GA | 30 | 720 | 2150 | D1 08:00-12:00 | D2 10:00-16:00 | Dry van 53 ft | 30100 | Packaged foods | 2 | Southern Cross Logistics | 25 | null | null |
| 4 | Dallas, TX | Denver, CO | 15 | 780 | 2050 | D1 09:00-14:00 | D2 12:00-18:00 | Dry van 53 ft | 41200 | Packaged foods | 2 | HighPlains Logistics | 0 | null | null |
| 5 | Dallas, TX | Oklahoma City, OK | 20 | 205 | null | D1 10:00-15:00 | D1 18:00-23:00 | Dry van 53 ft | 15750 | Office furniture | 4 | RedRiver Freight | 8 | null | null |
| 6 | Dallas, TX | Nashville, TN | 25 | 660 | 1700 | D1 09:00-13:00 | D2 12:00-18:00 | Dry van 53 ft | 33400 | Auto parts | 31 | MusicCity Freight Brokers | 0 | null | null |
| 7 | Houston, TX | San Antonio, TX | 240 | 200 | 700 | D1 08:00-11:00 | D1 17:00-21:00 | Dry van 53 ft | 19800 | Building materials | 2 | GulfCoast Transport Brokers | 6 | null | null |
| 8 | Dallas, TX | Kansas City, MO | 30 | 505 | 1450 | D1 09:00-12:00 | D2 06:00-12:00 | Dry van 53 ft | 28600 | Consumer electronics | 5 | Heartland Freight Group | 18 | null | Detention $40/h after 2 h |
| 9 | Fort Worth, TX | Little Rock, AR | 35 | 320 | 880 | D1 09:00-13:00 | D1 16:00-22:00 | Dry van 53 ft | 24300 | Paper products | 6 | Ozark Freight Lines Brokerage | 0 | null | null |
| 10 | Dallas, TX | Shreveport, LA | 10 | 190 | 520 | D1 09:00-12:00 | D1 13:00-19:00 | Dry van 53 ft | null | Auto parts | 1 | Bayou Freight Partners | 0 | null | null |
| 11 | Dallas, TX | Tulsa, OK | 20 | 260 | 760 | D1 09:00-14:00 | D1 15:00-21:00 | Dry van 53 ft | 12400 | null | 7 | GreenCountry Brokerage | 14 | 75 | null |
| 12 | Dallas, TX | St. Louis, MO | 25 | 630 | 1580 | D1 09:00-13:00 | D2 08:00-14:00 | Dry van 53 ft | 36900 | Household goods | 9 | ArchCity Logistics | 10 | null | null |

Expected model behaviour on this dataset, for verification against the prototype:

- Load 1: High confidence, feasibility Tight (reset required, and 13.3 h of driving against 9.0 h left). Its problem is economics and time, not data quality. The four dimensions are independent, and this load is the proof.
- Load 5: Verify first (rate missing). Economics cannot be computed and must be shown as unknown, never estimated silently.
- Load 6: Verify first (rate stale). See Section 7.2 for its post-call state.
- Load 7: High confidence, feasibility Does not fit current clocks. Pickup arrival is 08:00 + 240/45 = 13:20, after the window ends at 11:00. Good data, impossible load.
- Load 10: High confidence with an annotation (weight missing, annotate only).
- Load 11: High confidence with an annotation (commodity missing, annotate only). Its stated lumper fee of $75 is inside S.

## 9. Hand-worked examples

All three examples use the Section 3 defaults: variable cost $0.88 per mile, fixed allocation $0.60 per total mile, average speed 45 mph, handling plus dwell 4.0 h (loading 1.5 h, unloading 1.5 h, expected dwell 1.0 h). Arithmetic is shown unrounded, then rounded to cents at the end.

### 9.1 Load 1: the headline-rate trap (Jackson, MS to Memphis, TN)

Why it looks good on the board: posted rate per loaded mile = $1,200 / 210 = $5.71, the highest on the board.

Step by step:

- Total miles = 390 + 210 = 600
- V = $0.88 x 600 = $528.00
- S = tolls $10 + lumper $0 = $10.00
- C = R - V - S = $1,200 - $528.00 - $10.00 = $662.00
- Contribution per total mile = $662.00 / 600 = $1.1033, shown as $1.10
- Drive time = 600 / 45 = 13.33 h. Total hours committed = 13.33 + 4.0 = 17.33 h
- Contribution per truck-hour = $662.00 / 17.33 = $38.19
- Estimated operating profit per total mile = $1.1033 - $0.60 = $0.5033, shown as $0.50

The collapse: the $5.71 headline was priced on 210 loaded miles, but the truck drives 600 miles and commits 17.33 hours to earn it. Counted honestly, the board's most expensive-looking load earns $38.19 per truck-hour, below every mid-pack load in the set (loads 8 to 12 range from $40.74 to $60.50), and it also needs a reset before delivery (drive need 13.33 h against 9.0 h left).

### 9.2 Load 3: the truck-hour winner (Fort Worth, TX to Atlanta, GA)

Step by step:

- Total miles = 30 + 720 = 750
- V = $0.88 x 750 = $660.00
- S = tolls $25 + lumper $0 = $25.00
- C = $2,150 - $660.00 - $25.00 = $1,465.00
- Contribution per total mile = $1,465.00 / 750 = $1.9533, shown as $1.95
- Drive time = 750 / 45 = 16.67 h. Total hours committed = 16.67 + 4.0 = 20.67 h
- Contribution per truck-hour = $1,465.00 / 20.67 = $70.89
- Estimated operating profit per total mile = $1.9533 - $0.60 = $1.3533, shown as $1.35

Why it wins per hour but not per mile: Load 2 (Dallas, TX to Houston, TX) has the better per-mile figure. Load 2: total miles 250, C = $820 - ($0.88 x 250) - $0 = $600.00, contribution per total mile = $600.00 / 250 = $2.40, which beats Load 3's $1.95. But Load 2 commits 250 / 45 + 4.0 = 9.56 h, so its contribution per truck-hour = $600.00 / 9.56 = $62.79, which loses to Load 3's $70.89. The fixed 4.0 h of handling and dwell is spread over 750 miles on Load 3 and only 250 miles on Load 2. A board ranked on per-mile rate alone would put Load 2 first and never surface this.

### 9.3 Load 4: good numbers into a weak market (Dallas, TX to Denver, CO)

Step by step:

- Total miles = 15 + 780 = 795
- V = $0.88 x 795 = $699.60
- S = tolls $0 + lumper $0 = $0.00
- C = $2,050 - $699.60 - $0.00 = $1,350.40
- Contribution per total mile = $1,350.40 / 795 = $1.6986, shown as $1.70
- Drive time = 795 / 45 = 17.67 h. Total hours committed = 17.67 + 4.0 = 21.67 h
- Contribution per truck-hour = $1,350.40 / 21.67 = $62.33
- Estimated operating profit per total mile = $1.6986 - $0.60 = $1.0986, shown as $1.10

The catch is not in these numbers, which are mid-pack to good. It is in the fourth dimension: Denver is tagged Weak outbound in the Section 6 table. The truck earns $1,350.40 of contribution and lands somewhere it may sit idle or deadhead far for its next load. The economics say pursue; the opportunity dimension says price in the exit before deciding. No single score could show that tension, which is why the dimensions stay separate.
