import { describe, expect, it } from "vitest";
import { cos, exp, expm1, hypot, log, power, sin, tanh } from "../../src/engine/exactMath";

/** How many doubles apart two numbers are. */
function ulpsApart(a: number, b: number): number {
  if (Object.is(a, b)) return 0;
  const bits = new BigInt64Array(new Float64Array([a, b]).buffer);
  const [x = 0n, y = 0n] = [...bits].map((each) =>
    each < 0n ? -(each & 0x7fffffffffffffffn) : each,
  );
  return Number(x > y ? x - y : y - x);
}

/** Many inputs spread over a range, from a fixed sequence, plus the range's ends. */
function inputs(from: number, to: number, count = 20_000): number[] {
  let state = 7;
  const values = [from, to];
  for (let i = 0; i < count; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    values.push(from + (state / 2 ** 32) * (to - from));
  }
  return values;
}

/** The worst disagreement with Math's own function, which is accurate to about an ulp. */
function worstUlps(ours: (x: number) => number, reference: (x: number) => number, xs: number[]) {
  return Math.max(...xs.map((x) => ulpsApart(ours(x), reference(x))));
}

describe("the engine's exact elementary functions", () => {
  it("agree with Math to within an ulp or so over the ranges the engine uses, and beyond", () => {
    expect(worstUlps(exp, Math.exp, inputs(-745, 709))).toBeLessThanOrEqual(1);
    expect(worstUlps(exp, Math.exp, inputs(-1, 1))).toBeLessThanOrEqual(1);
    expect(worstUlps(expm1, Math.expm1, inputs(-40, 700))).toBeLessThanOrEqual(1);
    expect(worstUlps(expm1, Math.expm1, inputs(-1e-3, 1e-3))).toBeLessThanOrEqual(1);
    expect(worstUlps(log, Math.log, inputs(1e-300, 1e300))).toBeLessThanOrEqual(1);
    expect(worstUlps(log, Math.log, inputs(1e-9, 1))).toBeLessThanOrEqual(1);
    expect(worstUlps(log, Math.log, inputs(0.999, 1.001))).toBeLessThanOrEqual(1);
    for (const [from, to] of [
      [-0.8, 0.8],
      [-7, 7],
      [-1000, 1000],
      [-1e6, 1e6],
    ] as const) {
      expect(worstUlps(sin, Math.sin, inputs(from, to))).toBeLessThanOrEqual(1);
      expect(worstUlps(cos, Math.cos, inputs(from, to))).toBeLessThanOrEqual(1);
    }
    expect(worstUlps(tanh, Math.tanh, inputs(-25, 25))).toBeLessThanOrEqual(2);
    expect(worstUlps(tanh, Math.tanh, inputs(-1e-4, 1e-4))).toBeLessThanOrEqual(2);
  });

  it("are exact where the answer is", () => {
    expect([exp(0), exp(-Infinity), exp(Infinity), exp(1000), exp(-1000)]).toEqual([
      1,
      0,
      Infinity,
      Infinity,
      0,
    ]);
    expect([log(1), log(0), log(-0), log(Infinity)]).toEqual([0, -Infinity, -Infinity, Infinity]);
    expect([sin(0), cos(0), tanh(0), tanh(Infinity), tanh(-Infinity)]).toEqual([0, 1, 0, 1, -1]);
    expect(Object.is(sin(-0), -0)).toBe(true);
    expect(Object.is(tanh(-0), -0)).toBe(true);
    expect([expm1(0), expm1(-Infinity), expm1(Infinity)]).toEqual([0, -1, Infinity]);
    for (const f of [exp, expm1, log, sin, cos, tanh]) expect(f(NaN)).toBeNaN();
    expect(log(-1)).toBeNaN();
    expect(sin(Infinity)).toBeNaN();
    expect(cos(-Infinity)).toBeNaN();
    expect(log(Number.MIN_VALUE)).toBeCloseTo(-744.44007192138, 9);
    expect(hypot(3, 4)).toBe(5);
    expect(hypot(2, 3, 6)).toBe(7);
    expect([power(0.5, 0), power(0.5, 1), power(0.5, 4), power(3, 3)]).toEqual([
      1, 0.5, 0.0625, 27,
    ]);
  });

  it("refuses an angle too large to reduce accurately", () => {
    expect(() => sin(1e7)).toThrow(RangeError);
  });
});
