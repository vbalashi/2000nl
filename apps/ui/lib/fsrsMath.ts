export const fsrs6Defaults = [
  0.212, // w0 S0(again)
  1.2931,
  2.3065,
  8.2956,
  6.4133,
  0.8334,
  3.0194,
  0.001,
  1.8722,
  0.1666,
  0.796,
  1.4835,
  0.0614,
  0.2629,
  1.6483,
  0.6014,
  1.8729,
  0.5425,
  0.0912,
  0.0658,
  0.1542,
] as const;

type Params = typeof fsrs6Defaults;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const intervalForRetention = (stability: number, retention: number, w20: number) => {
  const factor = Math.pow(0.9, -1 / w20) - 1;
  return stability / factor * (Math.pow(retention, -1 / w20) - 1);
};

export type FsrsState = {
  stability: number | null;
  difficulty: number | null;
  lastReview?: number; // days elapsed since last review
  reps?: number;
  lapses?: number;
};

export function fsrsCompute(
  grade: 1 | 2 | 3 | 4,
  state: FsrsState,
  targetRetention = 0.9,
  params: Params = fsrs6Defaults
) {
  const [
    w0,
    w1,
    w2,
    w3,
    w4,
    w5,
    w6,
    w7,
    w8,
    w9,
    w10,
    w11,
    w12,
    w13,
    w14,
    w15,
    w16,
    w17,
    w18,
    w19,
    w20,
  ] = params;

  const reps = state.reps ?? 0;
  const lapses = state.lapses ?? 0;

  if (state.stability == null || state.difficulty == null) {
    const stability = [w0, w1, w2, w3][grade - 1];
    const difficulty = clamp(w4 - Math.exp(w5 * (grade - 1)) + 1, 1, 10);
    const interval = intervalForRetention(stability, targetRetention, w20);
    return { stability, difficulty, interval, reps: 1, lapses: grade === 1 ? 1 : 0 };
  }

  const elapsed = state.lastReview ?? 0;
  const retrievability =
    Math.pow(1 + (Math.pow(0.9, -1 / w20) - 1) * elapsed / Math.max(state.stability, 1e-4), -w20);

  // Difficulty update
  const tmpD = state.difficulty + (-w6 * (grade - 3)) * (10 - state.difficulty) / 9;
  const d0Easy = w4 - Math.exp(w5 * 3) + 1;
  const difficulty = clamp(w7 * d0Easy + (1 - w7) * tmpD, 1, 10);

  let stability: number;
  if (grade === 1) {
    stability =
      w11 *
      Math.pow(difficulty, -w12) *
      (Math.pow(state.stability + 1, w13) - 1) *
      Math.exp(w14 * (1 - retrievability));
  } else {
    stability =
      state.stability *
      (Math.exp(w8) *
        (11 - difficulty) *
        Math.pow(state.stability, -w9) *
        (Math.exp(w10 * (1 - retrievability)) - 1) *
        (grade === 2 ? w15 : 1) *
        (grade === 4 ? w16 : 1) +
        1);
  }

  const interval = intervalForRetention(stability, targetRetention, w20);
  return {
    stability,
    difficulty,
    interval,
    reps: reps + 1,
    lapses: lapses + (grade === 1 ? 1 : 0),
  };
}
