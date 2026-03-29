import { format, addDays, subDays, startOfWeek } from 'date-fns';
import { utcToZonedTime } from 'date-fns-tz';

const TIMEZONE = 'America/New_York';

export function getToday(): string {
  const now = new Date();
  const zoned = utcToZonedTime(now, TIMEZONE);
  return format(zoned, 'yyyy-MM-dd');
}

export function getYesterday(): string {
  const yesterday = subDays(new Date(), 1);
  const zoned = utcToZonedTime(yesterday, TIMEZONE);
  return format(zoned, 'yyyy-MM-dd');
}

export function getTomorrow(): string {
  const tomorrow = addDays(new Date(), 1);
  const zoned = utcToZonedTime(tomorrow, TIMEZONE);
  return format(zoned, 'yyyy-MM-dd');
}

export function getCurrentWeek(): string {
  const now = new Date();
  const start = startOfWeek(now, { weekStartsOn: 1 });
  const zoned = utcToZonedTime(start, TIMEZONE);
  return format(zoned, 'yyyy-MM-dd');
}

export function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const zoned = utcToZonedTime(date, TIMEZONE);
  return format(zoned, 'h:mm a zzz');
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
