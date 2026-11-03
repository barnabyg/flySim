import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  DRIVERS,
  DRIVER_RELATIONSHIPS,
  PARAMETER_LABELS,
  RELATIONSHIP_STATUSES,
  TRANSITIONS,
  type RelationshipLabel,
} from "../../src/engine";
import { countedTargets, readEvidencePack } from "../../src/validation";
import { recordOf } from "./helpers";

const pack = readEvidencePack(
  JSON.parse(readFileSync(new URL("../../evidence/evidencePack.json", import.meta.url), "utf8")),
);

/** Every Driver that pushed each transition in a hungry, thirsty day with Disturbs in it. */
function contributingPairs(): Set<string> {
  const steps = [600, 3_000, 30_000, 900_000, 2_500_000].map((step) => ({
    step,
    type: "disturb" as const,
  }));
  const record = recordOf(3, 86_400, {
    interventions: steps,
    parameters: { ...DEFAULT_PARAMETERS, initialEnergy: 0.3, initialHydration: 0.3 },
  });
  const pairs = new Set<string>();
  for (const sample of record.samples) {
    for (const each of sample.transitions) {
      for (const driver of DRIVERS) {
        if (each.contributions[driver] !== 0) pairs.add(`${each.transition} ${driver}`);
      }
    }
  }
  return pairs;
}

function everyLabel(): { name: string; label: RelationshipLabel }[] {
  return [
    ...Object.entries(PARAMETER_LABELS).map(([name, label]) => ({ name, label })),
    ...DRIVER_RELATIONSHIPS.map((label) => ({
      name: `${label.transition} ${label.driver}`,
      label,
    })),
  ];
}

describe("the model's relationship labels", () => {
  it("label every model parameter", () => {
    expect(Object.keys(PARAMETER_LABELS).sort()).toEqual(Object.keys(DEFAULT_PARAMETERS).sort());
  });

  it("label every Driver that pushes a transition, once each", () => {
    const labelled = DRIVER_RELATIONSHIPS.map((each) => `${each.transition} ${each.driver}`);
    expect(new Set(labelled).size).toBe(labelled.length);
    const pairs = contributingPairs();
    // The day reaches nearly every pair, so a new Driver can't go unlabelled for long.
    expect(pairs.size).toBeGreaterThan(35);
    for (const pair of pairs) expect(labelled, pair).toContain(pair);
    for (const each of DRIVER_RELATIONSHIPS) {
      expect(TRANSITIONS.map((transition) => transition.id)).toContain(each.transition);
      expect(DRIVERS).toContain(each.driver);
    }
  });

  it("are each Established, Provisional or Hypothesis, with a description", () => {
    for (const { name, label } of everyLabel()) {
      expect(RELATIONSHIP_STATUSES, name).toContain(label.status);
      expect(label.description.length, name).toBeGreaterThan(0);
    }
  });

  it("cite a counted Evidence Pack target for every Established label, and only for those", () => {
    const counted = new Set(countedTargets(pack).map((target) => target.id));
    const established = everyLabel().filter(({ label }) => label.status === "established");
    expect(established.length).toBeGreaterThan(0);
    for (const { name, label } of everyLabel()) {
      if (label.status !== "established") {
        expect(label.evidence ?? [], name).toEqual([]);
        continue;
      }
      expect(label.evidence?.length, name).toBeGreaterThan(0);
      for (const id of label.evidence ?? []) expect(counted, `${name} cites ${id}`).toContain(id);
    }
  });

  it("keep the fields, the light and Hunger and Thirst Provisional", () => {
    const provisional = DRIVER_RELATIONSHIPS.filter((each) =>
      ["light", "odour", "humidity", "hunger", "thirst"].includes(each.driver),
    );
    expect(provisional.length).toBeGreaterThan(0);
    for (const each of provisional) {
      expect(each.status, `${each.transition} ${each.driver}`).toBe("provisional");
    }
    const fieldsAndReserves = Object.entries(PARAMETER_LABELS).filter(([name]) =>
      /odour|humidity|hunger|thirst|light|energy|water|feeding|drinking|hydration/i.test(name),
    );
    for (const [name, label] of fieldsAndReserves) expect(label.status, name).toBe("provisional");
  });
});
