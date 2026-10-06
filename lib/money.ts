/**
 * Money is integer ZAR cents everywhere. Spec §12: no floats anywhere near ZAR.
 * These helpers are for DISPLAY ONLY — never round-trip a formatted string back
 * into a number.
 */

/** 50000 -> "R500", 28050 -> "R280,50" (en-ZA uses a comma decimal separator). */
export function formatZar(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error(`formatZar expects integer cents, got ${cents}`);
  }
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const rand = Math.floor(abs / 100);
  const remainder = abs % 100;

  const grouped = rand.toLocaleString('en-ZA');
  const body = remainder === 0 ? `R${grouped}` : `R${grouped},${String(remainder).padStart(2, '0')}`;

  return negative ? `-${body}` : body;
}

/** 60 -> "1 hr", 45 -> "45 min", 90 -> "1 hr 30 min" */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourPart = `${hours} hr`;
  return rest === 0 ? hourPart : `${hourPart} ${rest} min`;
}
