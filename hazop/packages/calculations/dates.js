// packages/calculations/dates.js
// Permit expiry / renewal / recurring-obligation arithmetic. Deterministic,
// UTC-day based, no timezone drift, no LLM.

export const DATES_VERSION = 'dates-1.0.0';

const MS_DAY = 86400000;

/** Parse an ISO date (yyyy-mm-dd or full ISO) to a UTC midnight timestamp. */
export function toUtcDay(input) {
  if (!input) return null;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate());
  }
  const s = String(input).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function isoDay(ts) {
  if (ts === null || ts === undefined) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromInput, toInput) {
  const a = toUtcDay(fromInput);
  const b = toUtcDay(toInput);
  if (a === null || b === null) return null;
  return Math.round((b - a) / MS_DAY);
}

export function addDays(input, n) {
  const a = toUtcDay(input);
  if (a === null) return null;
  return isoDay(a + Math.round(n) * MS_DAY);
}

/** Calendar-correct month addition, clamping to the end of a short month. */
export function addMonths(input, n) {
  const a = toUtcDay(input);
  if (a === null) return null;
  const d = new Date(a);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(y, mo + Math.round(n), 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return isoDay(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, lastDay)));
}

export const DEFAULT_NOTICE_DAYS = 90;
export const DEFAULT_RENEWAL_DAYS = 30;

/**
 * Status of a dated permit / licence / consent / approval.
 *
 * @param {Object} req { expiryDate, renewalDate, today, noticeDays, renewalWindowDays, revoked }
 * @returns {Object} { status, daysRemaining, reason, effectiveDate }
 */
export function expiryStatus(req) {
  const r = req || {};
  const today = toUtcDay(r.today || new Date());
  const noticeDays = Number.isFinite(Number(r.noticeDays)) ? Number(r.noticeDays) : DEFAULT_NOTICE_DAYS;
  const renewalWindow = Number.isFinite(Number(r.renewalWindowDays)) ? Number(r.renewalWindowDays) : DEFAULT_RENEWAL_DAYS;

  if (r.revoked) return { status: 'EXPIRED', daysRemaining: null, reason: 'REVOKED', effectiveDate: null };

  // A renewal date earlier than expiry is the date action is due.
  const expiry = toUtcDay(r.expiryDate);
  const renewal = toUtcDay(r.renewalDate);

  if (expiry === null && renewal === null) {
    return { status: 'UNKNOWN', daysRemaining: null, reason: 'NO_DATES_RECORDED', effectiveDate: null };
  }
  if (expiry === null && renewal !== null) {
    const dr = Math.round((renewal - today) / MS_DAY);
    if (dr < 0) return { status: 'RENEWAL_DUE', daysRemaining: dr, reason: 'RENEWAL_DATE_PASSED', effectiveDate: isoDay(renewal) };
    if (dr <= renewalWindow) return { status: 'RENEWAL_DUE', daysRemaining: dr, reason: 'INSIDE_RENEWAL_WINDOW', effectiveDate: isoDay(renewal) };
    return { status: 'VALID', daysRemaining: dr, reason: 'RENEWAL_AHEAD', effectiveDate: isoDay(renewal) };
  }

  const dr = Math.round((expiry - today) / MS_DAY);
  if (dr < 0) return { status: 'EXPIRED', daysRemaining: dr, reason: 'EXPIRY_PASSED', effectiveDate: isoDay(expiry) };
  if (renewal !== null) {
    const rdr = Math.round((renewal - today) / MS_DAY);
    if (rdr <= renewalWindow) {
      return { status: 'RENEWAL_DUE', daysRemaining: dr, reason: 'RENEWAL_ACTION_DUE', effectiveDate: isoDay(renewal) };
    }
  }
  if (dr <= noticeDays) return { status: 'EXPIRING_SOON', daysRemaining: dr, reason: 'INSIDE_NOTICE_WINDOW', effectiveDate: isoDay(expiry) };
  return { status: 'VALID', daysRemaining: dr, reason: 'OUTSIDE_NOTICE_WINDOW', effectiveDate: isoDay(expiry) };
}

export const FREQUENCIES = Object.freeze({
  DAILY: { days: 1, label: 'Daily' },
  WEEKLY: { days: 7, label: 'Weekly' },
  FORTNIGHTLY: { days: 14, label: 'Fortnightly' },
  MONTHLY: { months: 1, label: 'Monthly' },
  QUARTERLY: { months: 3, label: 'Quarterly' },
  HALF_YEARLY: { months: 6, label: 'Half-yearly' },
  ANNUAL: { months: 12, label: 'Annual' },
  BIENNIAL: { months: 24, label: 'Every 2 years' },
  FIVE_YEARLY: { months: 60, label: 'Every 5 years' },
  ON_EVENT: { label: 'On event', eventDriven: true },
  ONE_TIME: { label: 'One time', oneTime: true },
});

/**
 * Next due date for a recurring statutory obligation (returns, monitoring,
 * inspection, testing).
 */
export function nextDue(req) {
  const r = req || {};
  const freq = FREQUENCIES[r.frequency];
  const today = r.today || isoDay(toUtcDay(new Date()));
  if (!freq) return { dueDate: null, status: 'UNKNOWN_FREQUENCY', reason: 'FREQUENCY_NOT_RECOGNIZED' };
  if (freq.eventDriven) return { dueDate: null, status: 'EVENT_DRIVEN', reason: 'DUE_ON_EVENT' };
  if (freq.oneTime) {
    if (r.lastCompleted) return { dueDate: null, status: 'COMPLETE', reason: 'ONE_TIME_DONE' };
    return { dueDate: r.startFrom || null, status: r.startFrom ? 'DUE' : 'UNKNOWN', reason: 'ONE_TIME_PENDING' };
  }
  const anchor = r.lastCompleted || r.startFrom;
  if (!anchor) return { dueDate: null, status: 'UNKNOWN', reason: 'NO_ANCHOR_DATE' };

  const due = freq.months ? addMonths(anchor, freq.months) : addDays(anchor, freq.days);
  const dr = daysBetween(today, due);
  let status = 'SCHEDULED';
  if (dr === null) status = 'UNKNOWN';
  else if (dr < 0) status = 'OVERDUE';
  else if (dr <= (Number.isFinite(Number(r.noticeDays)) ? Number(r.noticeDays) : 30)) status = 'DUE_SOON';
  return { dueDate: due, daysRemaining: dr, status, reason: 'ANCHOR_PLUS_FREQUENCY', anchor, frequency: r.frequency };
}

/** Sort key for the "expiring items" panel: most urgent first. */
export function urgencyKey(status, daysRemaining) {
  const order = { EXPIRED: 0, RENEWAL_DUE: 1, EXPIRING_SOON: 2, OVERDUE: 0, DUE_SOON: 2, VALID: 3, SCHEDULED: 3, UNKNOWN: 4, NO_EXPIRY: 5 };
  const base = Object.prototype.hasOwnProperty.call(order, status) ? order[status] : 4;
  const d = Number.isFinite(Number(daysRemaining)) ? Number(daysRemaining) : 99999;
  return base * 100000 + Math.min(d + 50000, 99999);
}
