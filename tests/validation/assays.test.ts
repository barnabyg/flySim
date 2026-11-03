import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assayFor,
  countedTargets,
  readEvidencePack,
  type Assay,
} from "../../src/validation";

const pack = readEvidencePack(
  JSON.parse(readFileSync(new URL("../../evidence/evidencePack.json", import.meta.url), "utf8")),
);
const assays = new Map(countedTargets(pack).map((target) => [target.id, assayFor(target)]));

function assay(id: string): Assay {
  const found = assays.get(id);
  if (!found) throw new Error(`No counted target ${id}`);
  return found;
}

describe("each Validation Target's Virtual Assay", () => {
  it("measures with the instrument its study used", () => {
    expect(assay("zimmerman-2008-beam-light-phase-sleep").instrument).toEqual({
      kind: "beam-crossing",
      beamPositionsMetres: [0.03],
      binSeconds: 30,
    });
    expect(assay("zimmerman-2008-video-light-phase-sleep").instrument).toMatchObject({
      kind: "video-tracking",
      frameSeconds: 5,
      windowSeconds: 5,
      movementThresholdMetres: 0.000189,
    });
    expect(assay("geissmann-2019-daily-scored-sleep-ethoscope").instrument).toMatchObject({
      kind: "video-tracking",
      frameSeconds: 1,
      windowSeconds: 10,
    });
    expect(assay("cascallares-2018-activity-bouts-exponential").instrument).toMatchObject({
      kind: "video-tracking",
      frameSeconds: 1,
      windowSeconds: 1,
      movementThresholdMetres: 0.0018,
    });
  });

  it("counts grooming in place as movement only where its study does", () => {
    const grooming = (id: string) => {
      const { instrument } = assay(id);
      return instrument.kind === "video-tracking" ? instrument.groomingCountsAsMovement : null;
    };
    // Frame differencing and the ethoscope's micromovements see legs move.
    expect(grooming("zimmerman-2008-video-light-phase-sleep")).toBe(true);
    expect(grooming("geissmann-2019-daily-scored-sleep-ethoscope")).toBe(true);
    // A 1.8 mm displacement threshold and a tracked centroid don't.
    expect(grooming("cascallares-2018-activity-bouts-exponential")).toBe(false);
    expect(grooming("cascallares-2018-quiescence-power-law")).toBe(false);
    expect(grooming("xu-2021-inactivity-bouts-power-law")).toBe(false);
    // A beam monitor counts only crossings, which grooming in place never makes.
    expect(grooming("zimmerman-2008-beam-light-phase-sleep")).toBeNull();
    expect(grooming("xu-2021-male-scored-sleep-profile")).toBeNull();
  });

  it("keeps the fly off the food, with Xu's virtual beam across the middle of where it walks", () => {
    const { study, instrument } = assay("xu-2021-male-scored-sleep-profile");
    expect(study.chamber.lengthMetres).toBeCloseTo(0.0605, 9);
    expect(instrument).toMatchObject({ kind: "beam-crossing" });
    if (instrument.kind !== "beam-crossing") return;
    expect(instrument.beamPositionsMetres[0]).toBeCloseTo(study.chamber.lengthMetres / 2, 9);
  });
});
