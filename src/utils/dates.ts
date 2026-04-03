const TIMEZONE = 'America/New_York';
const DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  weekday: 'short',
});
const TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

export function getToday(): string {
  return formatDateInTimeZone(new Date());
}

export function getYesterday(): string {
  return formatDateInTimeZone(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

export function getTomorrow(): string {
  return formatDateInTimeZone(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

export function getCurrentWeek(): string {
  return getWeekForDate(getToday());
}

export function getWeekForDate(dateStr: string): string {
  let cursor = new Date(`${dateStr}T12:00:00Z`);
  while (WEEKDAY_FORMATTER.format(cursor) !== 'Mon') {
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  return formatDateInTimeZone(cursor);
}

export function formatTime(isoString: string): string {
  return TIME_FORMATTER.format(new Date(isoString));
}

export function endOfDay(dateStr: string): string {
  const date = new Date(dateStr);
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

export function startOfDay(dateStr: string): string {
  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function formatDateInTimeZone(date: Date): string {
  const parts = DATE_FORMATTER.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}
