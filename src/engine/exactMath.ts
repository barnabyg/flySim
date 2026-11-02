/**
 * Elementary functions that give the same result on every JavaScript engine. Math's exp, log,
 * sin, cos, tanh, hypot and pow are only approximated, and their last bits differ between Node
 * and browsers, and between browsers, so a run would reproduce only where it was made. These are
 * ports of fdlibm's, which are accurate to within an ulp, and use only arithmetic that IEEE 754
 * rounds exactly, so a seed gives the same run in the batch runner as in any viewer.
 */

// The two 32-bit halves of a double, which fdlibm's algorithms read and write.
const float = new Float64Array(1);
const words = new Uint32Array(float.buffer);
const littleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
const HIGH = littleEndian ? 1 : 0;
const LOW = littleEndian ? 0 : 1;

/** The sign, exponent and top of the mantissa, as a signed integer. */
function highWord(x: number): number {
  float[0] = x;
  return (words[HIGH] ?? 0) | 0;
}

function lowWord(x: number): number {
  float[0] = x;
  return (words[LOW] ?? 0) >>> 0;
}

function fromWords(high: number, low: number): number {
  words[HIGH] = high >>> 0;
  words[LOW] = low >>> 0;
  return float[0] ?? NaN;
}

function withHighWord(x: number, high: number): number {
  return fromWords(high, lowWord(x));
}

const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.442695040888963387;
const OVERFLOW_THRESHOLD = 7.09782712893383973096e2;
const UNDERFLOW_THRESHOLD = -7.4513321910194110842e2;
const TWO_TO_MINUS_1000 = 9.3326361850321887899e-302;

/** e to the power x, from fdlibm's e_exp.c. */
export function exp(x: number): number {
  let high = highWord(x);
  const negative = high < 0;
  high &= 0x7fffffff;

  if (high >= 0x40862e42) {
    if (high >= 0x7ff00000) {
      if (((high & 0xfffff) | lowWord(x)) !== 0) return NaN;
      return negative ? 0 : Infinity;
    }
    if (x > OVERFLOW_THRESHOLD) return Infinity;
    if (x < UNDERFLOW_THRESHOLD) return 0;
  }

  let hi = 0;
  let lo = 0;
  let k = 0;
  if (high > 0x3fd62e42) {
    if (high < 0x3ff0a2b2) {
      hi = negative ? x + LN2_HI : x - LN2_HI;
      lo = negative ? -LN2_LO : LN2_LO;
      k = negative ? -1 : 1;
    } else {
      k = (INV_LN2 * x + (negative ? -0.5 : 0.5)) | 0;
      hi = x - k * LN2_HI;
      lo = k * LN2_LO;
    }
    x = hi - lo;
  } else if (high < 0x3e300000) {
    return 1 + x;
  }

  const t = x * x;
  const c =
    x -
    t *
      (1.66666666666666019037e-1 +
        t *
          (-2.77777777770155933842e-3 +
            t *
              (6.61375632143793436117e-5 +
                t * (-1.6533902205465251539e-6 + t * 4.13813679705723846039e-8))));
  if (k === 0) return 1 - ((x * c) / (c - 2) - x);
  const y = 1 - (lo - (x * c) / (2 - c) - hi);
  if (k >= -1021) return withHighWord(y, highWord(y) + (k << 20));
  return withHighWord(y, highWord(y) + ((k + 1000) << 20)) * TWO_TO_MINUS_1000;
}

/** e to the power x, less 1, accurate even when x is near 0, from fdlibm's s_expm1.c. */
export function expm1(x: number): number {
  let high = highWord(x);
  const negative = high < 0;
  high &= 0x7fffffff;

  if (high >= 0x4043687a) {
    if (high >= 0x40862e42) {
      if (high >= 0x7ff00000) {
        if (((high & 0xfffff) | lowWord(x)) !== 0) return NaN;
        return negative ? -1 : Infinity;
      }
      if (x > OVERFLOW_THRESHOLD) return Infinity;
    }
    if (negative) return -1;
  }

  let hi: number;
  let lo: number;
  let k: number;
  let c = 0;
  if (high > 0x3fd62e42) {
    if (high < 0x3ff0a2b2) {
      hi = negative ? x + LN2_HI : x - LN2_HI;
      lo = negative ? -LN2_LO : LN2_LO;
      k = negative ? -1 : 1;
    } else {
      k = (INV_LN2 * x + (negative ? -0.5 : 0.5)) | 0;
      hi = x - k * LN2_HI;
      lo = k * LN2_LO;
    }
    x = hi - lo;
    c = hi - x - lo;
  } else if (high < 0x3c900000) {
    return x;
  } else {
    k = 0;
  }

  const halfX = 0.5 * x;
  const halfXSquared = x * halfX;
  const r1 =
    1 +
    halfXSquared *
      (-3.33333333333331316428e-2 +
        halfXSquared *
          (1.58730158725481460165e-3 +
            halfXSquared *
              (-7.93650757867487942473e-5 +
                halfXSquared *
                  (4.00821782732936239552e-6 + halfXSquared * -2.01099218183624371326e-7))));
  let t = 3 - r1 * halfX;
  let e = halfXSquared * ((r1 - t) / (6 - x * t));
  if (k === 0) return x - (x * e - halfXSquared);

  e = x * (e - c) - c;
  e -= halfXSquared;
  if (k === -1) return 0.5 * (x - e) - 0.5;
  if (k === 1) return x < -0.25 ? -2 * (e - (x + 0.5)) : 1 + 2 * (x - e);
  if (k <= -2 || k > 56) {
    const y = 1 - (e - x);
    return withHighWord(y, highWord(y) + (k << 20)) - 1;
  }
  let y: number;
  if (k < 20) {
    t = fromWords(0x3ff00000 - (0x200000 >> k), 0);
    y = t - (e - x);
  } else {
    t = fromWords((0x3ff - k) << 20, 0);
    y = x - (e + t) + 1;
  }
  return withHighWord(y, highWord(y) + (k << 20));
}

const TWO_TO_54 = 1.8014398509481984e16;

/** The natural logarithm, from fdlibm's e_log.c. */
export function log(x: number): number {
  let high = highWord(x);
  let k = 0;
  if (high < 0x00100000) {
    if (((high & 0x7fffffff) | lowWord(x)) === 0) return -Infinity;
    if (high < 0) return NaN;
    k -= 54;
    x *= TWO_TO_54;
    high = highWord(x);
  }
  if (high >= 0x7ff00000) return x + x;
  k += (high >> 20) - 1023;
  high &= 0x000fffff;
  let i = (high + 0x95f64) & 0x100000;
  // Scales x into [sqrt(2)/2, sqrt(2)), and k by the same power of two.
  x = withHighWord(x, high | (i ^ 0x3ff00000));
  k += i >> 20;
  const f = x - 1;
  const dk = k;

  if ((0x000fffff & (2 + high)) < 3) {
    if (f === 0) return k === 0 ? 0 : dk * LN2_HI + dk * LN2_LO;
    const r = f * f * (0.5 - 0.3333333333333333 * f);
    return k === 0 ? f - r : dk * LN2_HI - (r - dk * LN2_LO - f);
  }

  const s = f / (2 + f);
  const z = s * s;
  i = high - 0x6147a;
  const w = z * z;
  const j = 0x6b851 - high;
  const t1 =
    w * (3.999999999940941908e-1 + w * (2.222219843214978396e-1 + w * 1.531383769920937332e-1));
  const t2 =
    z *
    (6.66666666666673513e-1 +
      w * (2.857142874366239149e-1 + w * (1.818357216161805012e-1 + w * 1.479819860511658591e-1)));
  i |= j;
  const r = t2 + t1;
  if (i > 0) {
    const halfFSquared = 0.5 * f * f;
    return k === 0
      ? f - (halfFSquared - s * (halfFSquared + r))
      : dk * LN2_HI - (halfFSquared - (s * (halfFSquared + r) + dk * LN2_LO) - f);
  }
  return k === 0 ? f - s * (f - r) : dk * LN2_HI - (s * (f - r) - dk * LN2_LO - f);
}

/** Sine on [-pi/4, pi/4], of x + tail if it has one, from fdlibm's k_sin.c. */
function kernelSin(x: number, tail: number, hasTail: boolean): number {
  if ((highWord(x) & 0x7fffffff) < 0x3e400000) return x;
  const z = x * x;
  const v = z * x;
  const r =
    8.33333333332248946124e-3 +
    z *
      (-1.98412698298579493134e-4 +
        z *
          (2.75573137070700676789e-6 +
            z * (-2.50507602534068634195e-8 + z * 1.58969099521155010221e-10)));
  if (!hasTail) return x + v * (-1.66666666666666324348e-1 + z * r);
  return x - (z * (0.5 * tail - v * r) - tail - v * -1.66666666666666324348e-1);
}

/** Cosine on [-pi/4, pi/4], of x + tail, from fdlibm's k_cos.c. */
function kernelCos(x: number, tail: number): number {
  const high = highWord(x) & 0x7fffffff;
  if (high < 0x3e400000) return 1;
  const z = x * x;
  const r =
    z *
    (4.16666666666666019037e-2 +
      z *
        (-1.38888888888741095749e-3 +
          z *
            (2.48015872894767294178e-5 +
              z *
                (-2.75573143513906633035e-7 +
                  z * (2.0875723212981748279e-9 + z * -1.13596475577881948265e-11)))));
  if (high < 0x3fd33333) return 1 - (0.5 * z - (z * r - x * tail));
  const quarter = high > 0x3fe90000 ? 0.28125 : fromWords(high - 0x00200000, 0);
  return 1 - quarter - (0.5 * z - quarter - (z * r - x * tail));
}

const INV_PIO2 = 6.36619772367581382433e-1;
const PIO2_1 = 1.57079632673412561417;
const PIO2_1T = 6.07710050650619224932e-11;
const PIO2_2 = 6.0771005063039659766e-11;
const PIO2_2T = 2.02226624879595063154e-21;
const PIO2_3 = 2.0222662487111664558e-21;
const PIO2_3T = 8.47842766036889956997e-32;

/** x less a whole number of quarter turns, as a head and tail, and how many quarter turns. */
const reduced = { head: 0, tail: 0 };

/**
 * Reduces x to [-pi/4, pi/4] from fdlibm's e_rem_pio2.c, for x within about a million radians,
 * which is far more than any angle the engine takes.
 */
function reduceQuarterTurns(x: number): number {
  const high = highWord(x);
  const size = high & 0x7fffffff;
  if (size <= 0x3fe921fb) {
    reduced.head = x;
    reduced.tail = 0;
    return 0;
  }
  if (size < 0x4002d97c) {
    const sign = high > 0 ? 1 : -1;
    let z = x - sign * PIO2_1;
    if (size !== 0x3ff921fb) {
      reduced.head = z - sign * PIO2_1T;
      reduced.tail = z - reduced.head - sign * PIO2_1T;
    } else {
      z -= sign * PIO2_2;
      reduced.head = z - sign * PIO2_2T;
      reduced.tail = z - reduced.head - sign * PIO2_2T;
    }
    return sign;
  }
  if (size > 0x413921fb) throw new RangeError(`An angle of ${x} radians is too large to reduce`);

  const magnitude = Math.abs(x);
  const n = (magnitude * INV_PIO2 + 0.5) | 0;
  let r = magnitude - n * PIO2_1;
  let w = n * PIO2_1T;
  // Subtracts more of pi/2 for as long as the subtraction cancels the leading bits.
  const exponent = size >> 20;
  let head = r - w;
  if (exponent - ((highWord(head) >> 20) & 0x7ff) > 16) {
    let t = r;
    w = n * PIO2_2;
    r = t - w;
    w = n * PIO2_2T - (t - r - w);
    head = r - w;
    if (exponent - ((highWord(head) >> 20) & 0x7ff) > 49) {
      t = r;
      w = n * PIO2_3;
      r = t - w;
      w = n * PIO2_3T - (t - r - w);
      head = r - w;
    }
  }
  const tail = r - head - w;
  reduced.head = high < 0 ? -head : head;
  reduced.tail = high < 0 ? -tail : tail;
  return high < 0 ? -n : n;
}

export function sin(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  if ((highWord(x) & 0x7fffffff) <= 0x3fe921fb) return kernelSin(x, 0, false);
  const quarterTurns = reduceQuarterTurns(x) & 3;
  const { head, tail } = reduced;
  switch (quarterTurns) {
    case 0:
      return kernelSin(head, tail, true);
    case 1:
      return kernelCos(head, tail);
    case 2:
      return -kernelSin(head, tail, true);
    default:
      return -kernelCos(head, tail);
  }
}

export function cos(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  const quarterTurns = reduceQuarterTurns(x) & 3;
  const { head, tail } = reduced;
  switch (quarterTurns) {
    case 0:
      return kernelCos(head, tail);
    case 1:
      return -kernelSin(head, tail, true);
    case 2:
      return -kernelCos(head, tail);
    default:
      return kernelSin(head, tail, true);
  }
}

/** The hyperbolic tangent, from fdlibm's s_tanh.c. */
export function tanh(x: number): number {
  if (Number.isNaN(x)) return NaN;
  const size = highWord(x) & 0x7fffffff;
  let z: number;
  if (size >= 0x40360000) {
    z = 1;
  } else if (size < 0x3c800000) {
    return x;
  } else if (size >= 0x3ff00000) {
    z = 1 - 2 / (expm1(2 * Math.abs(x)) + 2);
  } else {
    const t = expm1(-2 * Math.abs(x));
    z = -t / (t + 2);
  }
  return x < 0 ? -z : z;
}

/** The length of a vector, for the small, finite lengths the Room has. */
export function hypot(x: number, y: number, z = 0): number {
  return Math.sqrt(x * x + y * y + z * z);
}

/** x to a small whole power, by repeated multiplication. */
export function power(x: number, exponent: number): number {
  let result = 1;
  for (let i = 0; i < exponent; i++) result *= x;
  return result;
}
