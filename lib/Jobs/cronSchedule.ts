import type { ScheduleTrigger } from "./JobTypes";

/** Five cron fields, with optional leading seconds. Evaluated in the configured IANA timezone. */
export const parseCronSchedule = ({ cron, timezone = "UTC" }: ScheduleTrigger) => {
  const fields = cron.trim().split(/\s+/);
  const hasSeconds = fields.length === 6;
  if (fields.length === 5) fields.unshift("0");
  if (fields.length !== 6) throw new Error("Cron requires five fields, or six including seconds");
  const ranges = [
    [0, 59],
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 7],
  ] as const;
  const allowed = fields.map((field, index) =>
    parseField(field, ranges[index]![0], ranges[index]![1], index),
  );
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    second: "2-digit",
    minute: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    day: "2-digit",
    month: "2-digit",
    weekday: "short",
  });
  return (date: Date) => {
    const parts = Object.fromEntries(
      formatter.formatToParts(date).map(({ type, value }) => [type, value]),
    );
    const weekday = weekdays.indexOf(parts.weekday!.toUpperCase());
    const values = [
      +parts.second!,
      +parts.minute!,
      +parts.hour!,
      +parts.day!,
      +parts.month!,
      weekday,
    ];
    const matches = values.map((value, index) => allowed[index]!.has(value));
    // Traditional cron uses OR when both day-of-month and day-of-week are restricted.
    const dayMatches =
      fields[3]!.startsWith("*") || fields[5]!.startsWith("*") ?
        matches[3] && matches[5]
      : matches[3] || matches[5];
    if ((!hasSeconds || matches[0]) && matches[1] && matches[2] && dayMatches && matches[4]) {
      const interval = hasSeconds ? 1000 : 60_000;
      return new Date(Math.floor(date.getTime() / interval) * interval);
    }
  };
};

const weekdays = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const parseField = (field: string, min: number, max: number, index: number) => {
  const values = new Set<number>();
  const numeric = (text: string) => {
    const named =
      index === 4 ? months.indexOf(text.toUpperCase())
      : index === 5 ? weekdays.indexOf(text.toUpperCase())
      : -1;
    const value =
      named >= 0 ? named + (index === 4 ? 1 : 0)
      : /^\d+$/.test(text) ? Number(text)
      : NaN;
    if (!Number.isInteger(value) || value < min || value > max)
      throw new Error(`Invalid cron field: ${field}`);
    return value;
  };
  for (const part of field.split(",")) {
    const [range = "", stepText, ...extra] = part.split("/");
    const step =
      stepText === undefined ? 1
      : /^\d+$/.test(stepText) ? Number(stepText)
      : NaN;
    if (extra.length || !Number.isSafeInteger(step) || step <= 0)
      throw new Error(`Invalid cron step: ${part}`);
    const bounds = range.split("-");
    if (bounds.length > 2) throw new Error(`Invalid cron range: ${part}`);
    const first = range === "*" ? min : numeric(bounds[0]!);
    const last =
      range === "*" || (stepText !== undefined && bounds.length === 1) ? max
      : bounds.length === 2 ? numeric(bounds[1]!)
      : first;
    if (last < first) throw new Error(`Invalid cron range: ${part}`);
    for (let value = first; value <= last; value += step)
      values.add(index === 5 && value === 7 ? 0 : value);
  }
  return values;
};
