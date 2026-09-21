/**
 * Probability-based random selection using a cumulative distribution.
 * Returns exactly one segment index (0-based). Uses fixed scale PROBABILITY_SCALE (100).
 *
 * Algorithm:
 * 1. Build probability vector per segment (0–100), from segments or segmentProbabilitiesByIndex.
 * 2. Normalize so probabilities sum to PROBABILITY_SCALE (continuous, no gaps/overlaps).
 * 3. Build cumulative probabilities: cum[i] = sum(probs[0..i]) in [0, PROBABILITY_SCALE].
 * 4. Draw r uniformly in [0, PROBABILITY_SCALE).
 * 5. Return the first segment index i for which cumulative[i] > r.
 *
 * @param {Array<{ probability?: number }>} segments - segments with probability (0–100)
 * @param {Object} [segmentProbabilitiesByIndex] - optional override by index: { "0": 25, "1": 10, ... } (0–100)
 * @returns {number} index in segments array
 */
const PROBABILITY_SCALE = 100;

function probabilityRandomIndex(segments, segmentProbabilitiesByIndex) {
  if (!segments || segments.length === 0) return 0;

  const probs = segments.map((s, i) => {
    if (segmentProbabilitiesByIndex && segmentProbabilitiesByIndex[String(i)] !== undefined) {
      return Math.max(0, Math.min(100, Number(segmentProbabilitiesByIndex[String(i)]) || 0));
    }
    return Math.max(0, Math.min(100, Number(s.probability) || 0));
  });

  const total = probs.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;

  // Build cumulative distribution on fixed scale [0, PROBABILITY_SCALE]. Last value is exactly PROBABILITY_SCALE to avoid gaps.
  const cumulative = [];
  let cum = 0;
  for (let i = 0; i < probs.length; i++) {
    cum += probs[i];
    cumulative[i] = i === probs.length - 1 ? PROBABILITY_SCALE : (cum / total) * PROBABILITY_SCALE;
  }
  cumulative[probs.length - 1] = PROBABILITY_SCALE;

  // Random value in [0, PROBABILITY_SCALE) so it maps into non-overlapping, gap-free ranges.
  const r = Math.random() * PROBABILITY_SCALE;

  // First segment whose cumulative probability exceeds r. Guaranteed exactly one because cumulative[last] === PROBABILITY_SCALE and r < PROBABILITY_SCALE.
  for (let i = 0; i < cumulative.length; i++) {
    if (r < cumulative[i]) return i;
  }
  return segments.length - 1;
}

module.exports = { probabilityRandomIndex, PROBABILITY_SCALE };
