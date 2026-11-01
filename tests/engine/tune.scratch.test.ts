import { it } from "vitest";
import { DEFAULT_ROOM, createSimulationRun } from "../../src/engine";
it("tune", () => {
  const seeds = 4;
  const days = 3;
  const hourly = Array.from({ length: 24 }, () => 0);
  let dayB = 0, dayT = 0, nightB = 0, nightT = 0;
  for (let seed = 0; seed < seeds; seed++) {
    const run = createSimulationRun({ room: DEFAULT_ROOM, seed, maxRecordedSamples: 1 });
    run.advanceSeconds(86400 * days);
    let start: number | undefined;
    for (const f of run.firedTransitions) {
      if (f.to === "sleeping") start = f.timeSeconds;
      if (f.from === "sleeping" && start !== undefined) {
        const len = f.timeSeconds - start;
        const h0 = (start / 3600) % 24;
        if (h0 < 12) { dayB++; dayT += len; } else { nightB++; nightT += len; }
        for (let t = Math.ceil(start / 60); t * 60 < f.timeSeconds; t++) {
          const h = Math.floor((t / 60) % 24);
          hourly[h] = (hourly[h] ?? 0) + 60;
        }
      }
    }
    console.log("seed", seed, JSON.stringify(Object.fromEntries(Object.entries(run.record().timeInBehaviourSeconds).map(([k, v]) => [k, Math.round(v / 3600 / days * 10) / 10]))), "phase", run.current().circadianPhaseHours.toFixed(3));
  }
  console.log("pct", hourly.map((h) => Math.round((100 * h) / (3600 * seeds * days))).join(" "));
  console.log("dayBouts", dayB, "meanMin", (dayT / dayB / 60).toFixed(1), "nightBouts", nightB, "meanMin", (nightT / nightB / 60).toFixed(1));
}, 600000);
