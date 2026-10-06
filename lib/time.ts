/**
 * Time conversion at the edges. Spec §12: the server computes all times, the
 * browser sends an ISO instant and never a naive local time, everything is
 * stored as timestamptz.
 *
 * Africa/Johannesburg has no daylight saving, so the offset is a constant +02:00.
 * The functions below still do a real DST-safe conversion rather than hardcoding
 * +2, because a hardcoded offset is exactly the kind of thing that silently
 * survives until the business opens a branch somewhere else.
 */

export type IsoDate = string; // 'YYYY-MM-DD' — a calendar date in the business timezone
export type WallTime = string; // 'HH:MM' or 'HH:MM:SS' — a clock time, no zone

/** The UTC offset (in ms) that `tz` was observing at `instant`. */
function zoneOffsetMs(instant: Date, tz: string): number {
  // 'en-CA' gives ISO-ish YYYY-MM-DD ordering, but we read parts explicitly.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  // Intl renders midnight as hour 24 in some engines; normalise it.
  const hour = get('hour') % 24;

  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return asUtc - instant.getTime();
}

/**
 * Turn a wall-clock date+time in `tz` into a real instant.
 * e.g. ('2026-08-11', '10:00', 'Africa/Johannesburg') -> 2026-08-11T08:00:00Z
 */
export function zonedToUtc(date: IsoDate, time: WallTime, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm, ss = 0] = time.split(':').map(Number);

  const naive = Date.UTC(y, m - 1, d, hh, mm, ss);
  // First guess using the offset in force near that wall time, then confirm.
  const firstOffset = zoneOffsetMs(new Date(naive), tz);
  let instant = naive - firstOffset;
  const secondOffset = zoneOffsetMs(new Date(instant), tz);
  if (secondOffset !== firstOffset) instant = naive - secondOffset;

  return new Date(instant);
}

/** The calendar date `instant` falls on, as seen in `tz`. */
export function utcToZonedDate(instant: Date, tz: string): IsoDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** 'HH:MM' as seen in `tz`. */
export function utcToZonedTime(instant: Date, tz: string): WallTime {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).format(instant);
}

/** 0 = Sunday … 6 = Saturday, matching working_hours.day_of_week. */
export function dayOfWeekInZone(date: IsoDate, tz: string): number {
  // Noon avoids any edge where midnight lands on the far side of an offset shift.
  const instant = zonedToUtc(date, '12:00', tz);
  const name = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(instant);
  const index = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
  if (index < 0) throw new Error(`Could not resolve weekday for ${date} in ${tz}`);
  return index;
}

/** Today's calendar date in `tz`. */
export function todayInZone(tz: string, now: Date = new Date()): IsoDate {
  return utcToZonedDate(now, tz);
}

/** Add whole days to a 'YYYY-MM-DD' without touching timezones. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}

/** Whole days between two calendar dates (b - a). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(ms / 86_400_000);
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

/** 'HH:MM[:SS]' -> minutes since midnight. */
export function wallTimeToMinutes(time: WallTime): number {
  const [hh, mm] = time.split(':').map(Number);
  return hh * 60 + mm;
}

/** Human labels for the booking UI, rendered in the business timezone. */
export function formatSlotLabel(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-ZA', {
    timeZone: tz,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).format(instant);
}

export function formatDateLabel(date: IsoDate, tz: string): string {
  const instant = zonedToUtc(date, '12:00', tz);
  return new Intl.DateTimeFormat('en-ZA', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(instant);
}

export function formatDateTimeLabel(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-ZA', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant);
}
