// Prints the model output for all 12 loads under default assumptions,
// in the posted (pre-call) state. To run it with only the template toolchain
// (the app package is type: module, so plain tsc output needs import
// extensions rewritten for Node):
//   mkdir -p /tmp/ldc-src/src /tmp/ldc-src/scripts
//   cp src/model.ts /tmp/ldc-src/src/
//   sed 's|"./model"|"./model.js"|' src/data.ts > /tmp/ldc-src/src/data.ts
//   sed 's|"../src/model"|"../src/model.js"|; s|"../src/data"|"../src/data.js"|' \
//     scripts/report.ts > /tmp/ldc-src/scripts/report.ts
//   echo '{}' > /tmp/ldc-src/package.json
//   npx tsc --ignoreConfig /tmp/ldc-src/scripts/report.ts /tmp/ldc-src/src/model.ts \
//     /tmp/ldc-src/src/data.ts --outDir /tmp/ldc-report --module nodenext \
//     --target es2022 --skipLibCheck --rootDir /tmp/ldc-src
//   node /tmp/ldc-report/scripts/report.js

import { DEFAULT_ASSUMPTIONS, evaluateLoad } from "../src/model";
import { LOADS, TRUCK } from "../src/data";

const d2 = (n: number | null): string =>
  n === null
    ? "n/a"
    : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const header =
  "Load | Lane | Contribution | Per total mile | Per elapsed hour | Feasibility | Suggested action";
console.log(header);
console.log("-".repeat(header.length));

for (const load of LOADS) {
  const ev = evaluateLoad(load, false, DEFAULT_ASSUMPTIONS, TRUCK);
  const e = ev.economics;
  console.log(
    [
      `Load ${load.id}`,
      `${load.origin} to ${load.destination}`,
      e.contribution === null ? "Cannot evaluate" : `$${d2(e.contribution)}`,
      e.perTotalMile === null ? "n/a" : `$${d2(e.perTotalMile)}`,
      e.perElapsedHour === null ? "n/a" : `$${d2(e.perElapsedHour)}`,
      ev.feasibility.state,
      ev.action,
    ].join(" | "),
  );
}

// Load 6 after the simulated broker call: confidence and contribution move
// in opposite directions, shown as two separate facts.
const load6 = LOADS.find((l) => l.id === 6);
if (load6) {
  const before = evaluateLoad(load6, false, DEFAULT_ASSUMPTIONS, TRUCK);
  const after = evaluateLoad(load6, true, DEFAULT_ASSUMPTIONS, TRUCK);
  console.log("");
  console.log(
    `Load 6 before call: contribution $${d2(before.economics.contribution)}, confidence ${before.confidence.label}, feasibility ${before.feasibility.state}`,
  );
  console.log(
    `Load 6 after call: contribution $${d2(after.economics.contribution)}, confidence ${after.confidence.label}, feasibility ${after.feasibility.state}`,
  );
}
