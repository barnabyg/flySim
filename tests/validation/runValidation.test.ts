import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  DRIVER_RELATIONSHIPS,
  MODEL_VERSION,
  PARAMETER_LABELS,
} from "../../src/engine";
import {
  EvidencePackError,
  readEvidencePack,
  runValidation,
  tuningPack,
  type EvidencePack,
  type ValidationTarget,
} from "../../src/validation";

/** A counted target measured with a standard activity monitor, for a short recording. */
function target(id: string, changes: Partial<ValidationTarget> = {}): ValidationTarget {
  return {
    id,
    title: `Target ${id}`,
    counted: true,
    phase: 5,
    heldOut: false,
    verification: { status: "read-in-full", readFrom: "https://example.org/full", notes: "" },
    source: { citation: "A study", doi: null, url: "https://example.org" },
    study: { description: "Single males in tubes" },
    assay: {
      kind: "beam-crossing",
      chamber: {
        description: "activity-monitor tube",
        lengthMm: 65,
        widthMm: 5,
        heightMm: 5,
        foodAndWater: "sucrose-agar plug at one end",
      },
      beamPositionsMm: [32.5],
      samplingIntervalSeconds: 60,
      binSeconds: 60,
      movementRule: "A minute with no beam crossings is inactive.",
      movementThreshold: null,
      groomingCountsAsMovement: false,
      sleepThresholdMinutes: 5,
      acclimationHours: 0,
      recordedDays: 1 / 12,
    },
    fly: {
      sex: "male",
      strain: "Canton-S",
      ageDays: "3-5",
      housing: "alone",
      lightSchedule: { lightHours: 12, description: "LD 12:12" },
      temperatureC: 25,
      food: "5% sucrose, 2% agar",
    },
    measure: "daily-scored-sleep-minutes",
    measureDefinition: "Scored Sleep minutes per 24 h",
    published: [
      {
        label: "males",
        value: 900,
        unit: "min",
        uncertainty: { kind: "sd", value: 100 },
        n: 32,
        location: "Figure 1",
      },
    ],
    criterion: { kind: "within-interval", description: "700 to 1100 min", low: 700, high: 1100 },
    claimChecked: null,
    ...changes,
  };
}

const PACK: EvidencePack = {
  format: "fly-sim-evidence-pack",
  version: 1,
  referenceFly: {
    strain: "Canton-S",
    reason: "Most data",
    sex: "male",
    ageDays: { min: 3, max: 7 },
    housing: "alone",
  },
  targets: [
    target("sleep"),
    target("held-out-sleep", { heldOut: true }),
    target("video", {
      assay: { ...target("x").assay, kind: "a-method-with-no-assay" },
    }),
    target("later", { counted: false, phase: 6 }),
  ],
  excluded: [],
};

describe("the validation suite's runner", () => {
  it("runs each target's assay per fly, judges it, and tags the report", async () => {
    const now = new Date("2026-11-03T12:00:00Z");
    const options = { pack: PACK, seeds: [1, 2], jobs: 2, now };
    const report = await runValidation(options);

    expect(report).toMatchObject({
      generatedAt: "2026-11-03T12:00:00.000Z",
      modelVersion: MODEL_VERSION,
      parameters: DEFAULT_PARAMETERS,
      stepsPerSecond: 50,
      seeds: [1, 2],
    });
    // The labels travel with the parameters.
    expect(report.relationships).toEqual({
      parameters: PARAMETER_LABELS,
      drivers: DRIVER_RELATIONSHIPS,
    });
    expect(report.targets.map((each) => [each.id, each.heldOut])).toEqual([
      ["sleep", false],
      ["held-out-sleep", true],
    ]);
    const [sleep] = report.targets;
    expect(sleep?.model.perFly.map((fly) => fly.seed)).toEqual([1, 2]);
    expect(sleep?.display).toEqual({ kind: "scalar", accepted: { low: 700, high: 1100 } });
    expect(typeof sleep?.model.pooled).toBe("number");
    expect(typeof sleep?.result.pass).toBe("boolean");
    // Scoring Disagreement, once for the assay both targets use.
    expect(report.disagreement.map((each) => [each.targets, each.title])).toEqual([
      [["sleep", "held-out-sleep"], "Sleep: beam monitor, 60 s bins"],
    ]);
    expect(report.disagreement[0]?.perFly.map((fly) => fly.seed)).toEqual([1, 2]);
    expect(report.disagreement[0]?.pooled?.scoredSleepMinutesPerDay).toBeGreaterThanOrEqual(0);
    // A target without its assay is listed, not dropped silently. A candidate isn't run.
    expect(report.skipped.map((each) => each.id)).toEqual(["video"]);
    expect(report.skipped[0]?.reason).toMatch(/no a-method-with-no-assay/);

    // The same command gives the same report.
    expect(await runValidation(options)).toEqual(report);
  });

  it("runs the model with the parameters it is given, and tags the report with them", async () => {
    const parameters = { ...DEFAULT_PARAMETERS, fallAsleepCircadianRate: 0 };
    const options = { pack: PACK, seeds: [1], jobs: 1 };
    const tuned = await runValidation({ ...options, parameters });
    const untuned = await runValidation(options);

    expect(tuned.parameters).toEqual(parameters);
    expect(tuned.targets[0]?.model.perFly).not.toEqual(untuned.targets[0]?.model.perFly);
  });
});

describe("the bout shape stage", () => {
  it("runs each assay that scores bouts at a second step size, and reports both", async () => {
    const bouts = target("bouts", {
      measure: "inactivity-bout-duration-distribution",
      published: [
        {
          label: "males, survival exponent",
          value: 0.7,
          unit: "",
          uncertainty: { kind: "none", value: null },
          n: 10,
          location: "Figure 2",
        },
      ],
      criterion: {
        kind: "exponent-within",
        exponentForm: "ccdf",
        description: "0.5 to 1",
        xminSeconds: 60,
        xmaxSeconds: 3600,
        low: 0.5,
        high: 1,
      },
    });
    const report = await runValidation({
      pack: { ...PACK, targets: [target("sleep"), bouts] },
      seeds: [1, 2],
      jobs: 4,
    });

    // The two targets watch the same flies with the same instrument, so it is one assay.
    expect(report.boutShapes.map((each) => each.targets)).toEqual([["sleep", "bouts"]]);
    const [shapes] = report.boutShapes;
    expect(shapes?.binSeconds).toBe(60);
    expect(shapes?.stepSizes.map((each) => each.stepsPerSecond)).toEqual([50, 25]);
    for (const { kinds } of shapes?.stepSizes ?? []) {
      expect(kinds.map((kind) => [kind.bouts, kind.expected])).toEqual([
        ["inactivity", "falling"],
        ["activity", "exponential"],
      ]);
      for (const kind of kinds) {
        expect(kind.perFly.map((fly) => fly.seed)).toEqual([1, 2]);
        expect(typeof kind.pass).toBe("boolean");
        expect(typeof kind.fallingOnlyWhenPooled).toBe("boolean");
      }
    }
    expect(shapes?.agreement.map((each) => [each.bouts, each.stepsPerSecond])).toEqual([
      ["inactivity", [50, 25]],
      ["activity", [50, 25]],
    ]);
    // The targets themselves are judged at the suite's own step size only.
    expect(report.targets.map((each) => each.id)).toEqual(["sleep", "bouts"]);
  });
});

describe("tuning", () => {
  it("never reads a held-out target", () => {
    const pack = tuningPack(PACK);

    expect(pack.targets.map((each) => each.id)).toEqual(["sleep", "video", "later"]);
    expect(pack.targets.some((each) => each.heldOut)).toBe(false);
  });
});

describe("the Evidence Pack's schema", () => {
  it("accepts a pack with every field and a held-out target", () => {
    expect(readEvidencePack(JSON.parse(JSON.stringify(PACK)))).toEqual(PACK);
  });

  it("refuses a target that is missing a field", () => {
    const [first, ...rest] = PACK.targets;
    const withoutCriterion = Object.fromEntries(
      Object.entries(first ?? {}).filter(([field]) => field !== "criterion"),
    );
    expect(() => readEvidencePack({ ...PACK, targets: [withoutCriterion, ...rest] })).toThrow(
      /Target sleep has no criterion.kind/,
    );
    const noLocation = target("sleep", {
      published: [
        { ...(target("x").published[0] as ValidationTarget["published"][number]), location: "" },
      ],
    });
    expect(() => readEvidencePack({ ...PACK, targets: [noLocation, ...rest] })).toThrow(
      /published value 1's location isn't valid/,
    );
  });

  it("refuses a pack with no held-out target", () => {
    expect(() =>
      readEvidencePack({
        ...PACK,
        targets: PACK.targets.map((each) => ({ ...each, heldOut: false })),
      }),
    ).toThrow(EvidencePackError);
  });

  it("refuses a counted target whose source wasn't read in full", () => {
    const unread = target("unread", {
      verification: {
        status: "not-read-in-full",
        readFrom: "https://example.org",
        notes: "abstract",
      },
    });
    expect(() => readEvidencePack({ ...PACK, targets: [...PACK.targets, unread] })).toThrow(
      /unread counts, but its source wasn't read in full/,
    );
  });
});
