// lib/dates.ts
// Plain-language dates — pure, locale-free, deterministic.
//
// Built by hand rather than via toLocaleDateString so the output is identical on
// every machine and in every Node build (no ICU dependency), and so a date-only
// "YYYY-MM-DD" string never slips a day by being parsed as UTC midnight.

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Date-only strings are local calendar dates; anything else is an instant. */
function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
}

/** "August 16" — near-term dates, where the year is noise. US ordering: the
 *  guarantee is sold in the US only, so month-first is what a customer expects. */
export function formatDayMonth(value: string | Date): string {
  const d = toDate(value);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "August 16, 2026" — the full plain-language date. */
export function formatPlainDate(value: string | Date): string {
  const d = toDate(value);
  return `${formatDayMonth(d)}, ${d.getFullYear()}`;
}
