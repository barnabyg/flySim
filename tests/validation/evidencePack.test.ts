import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { countedTargets, readEvidencePack } from "../../src/validation";

const pack = readEvidencePack(
  JSON.parse(readFileSync(new URL("../../evidence/evidencePack.json", import.meta.url), "utf8")),
);

describe("the Evidence Pack for inactivity and sleep", () => {
  it("follows its schema, with at least one counted target held out from tuning", () => {
    expect(countedTargets(pack).some((target) => target.heldOut)).toBe(true);
  });

  it("names the Reference Fly's strain, as the glossary does", () => {
    expect(pack.referenceFly.strain).toBe("Canton-S");
    expect(readFileSync(new URL("../../GLOSSARY.md", import.meta.url), "utf8")).toMatch(
      /strain Canton-S/,
    );
  });

  it("counts only male phase 5 targets whose sources were read in full", () => {
    for (const target of countedTargets(pack)) {
      expect(target.phase, target.id).toBe(5);
      expect(target.fly.sex, target.id).toBe("male");
      expect(target.verification.status, target.id).toBe("read-in-full");
      for (const value of target.published) expect(value.location, target.id).not.toBe("");
    }
  });
});
