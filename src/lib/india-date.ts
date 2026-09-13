/**
 * Today's date in India, as yyyy-mm-dd.
 *
 * The business runs on India time, but the server renders in UTC. A date
 * default built from toISOString() read one day early from midnight to 05:30
 * IST, so a challan entered then was dated the day before, and the form the
 * server sent disagreed with the one the browser rendered. Computed in the
 * same time zone everywhere, both agree and the date is the one on the wall.
 */
export function indiaToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
