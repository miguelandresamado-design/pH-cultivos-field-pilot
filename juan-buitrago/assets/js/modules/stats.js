export function validPh(value) {
  if (value === "" || value === null || value === undefined) return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 14;
}

export function validValues(values) {
  return values.map(Number).filter(validPh).sort((a, b) => a - b);
}

export function median(values) {
  const sorted = validValues(values);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function mean(values) {
  const clean = validValues(values);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

export function stddev(values) {
  const clean = validValues(values);
  if (!clean.length) return null;
  const average = mean(clean);
  return Math.sqrt(clean.reduce((sum, value) => sum + (value - average) ** 2, 0) / clean.length);
}

export function summarize(values) {
  const clean = validValues(values);
  return { count: clean.length, median: median(clean), mean: mean(clean), stddev: stddev(clean), min: clean[0] ?? null, max: clean.at(-1) ?? null };
}
