/** Flat rate for all sports (INR 100 per hour). */
const PRICE_PER_HOUR = 100;

function normalizeTime(t) {
  if (!t) return null;
  if (typeof t === 'string') {
    const parts = t.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1] || '0', 10);
    const s = parseInt(parts[2] || '0', 10);
    if (Number.isNaN(h)) return null;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return null;
}

/** Minutes from midnight for TIME string HH:MM:SS */
function timeToMinutes(t) {
  const norm = normalizeTime(t);
  if (!norm) return null;
  const [h, m, s] = norm.split(':').map(Number);
  return h * 60 + m + s / 60;
}

/** Decimal hours between two TIME values (end after start same day). */
function hoursBetween(startTime, endTime) {
  const a = timeToMinutes(startTime);
  const b = timeToMinutes(endTime);
  if (a === null || b === null || b <= a) return null;
  return Math.round(((b - a) / 60) * 100) / 100;
}

function coerceTimeValue(t) {
  if (t == null) return null;
  if (typeof t === 'string') return normalizeTime(t);
  if (typeof t === 'object' && typeof t.toString === 'function') {
    const s = t.toString();
    if (s.includes(':')) return normalizeTime(s.slice(0, 8));
  }
  return normalizeTime(String(t));
}

function intervalsOverlap(startA, endA, startB, endB) {
  const a0 = timeToMinutes(coerceTimeValue(startA));
  const a1 = timeToMinutes(coerceTimeValue(endA));
  const b0 = timeToMinutes(coerceTimeValue(startB));
  const b1 = timeToMinutes(coerceTimeValue(endB));
  if ([a0, a1, b0, b1].some((x) => x === null)) return false;
  return a0 < b1 && b0 < a1;
}

function totalPriceFromHours(hours) {
  if (hours === null || hours <= 0) return null;
  return Math.round(hours * PRICE_PER_HOUR * 100) / 100;
}

function formatHour12(h24) {
  const p = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:00 ${p}`;
}

/** Booked rows must have start_time, end_time. Returns slot options within [openH, closeH] (end by closeH). */
function listAvailableSlots(bookedList, durationHours, openH = 9, closeH = 21) {
  const out = [];
  const dur = Number(durationHours) || 1;
  if (dur < 1 || dur > 12) return out;

  for (let h = openH; h + dur <= closeH; h += 1) {
    const start = `${String(h).padStart(2, '0')}:00:00`;
    const endH = h + dur;
    const end = `${String(endH).padStart(2, '0')}:00:00`;
    const clash = bookedList.some((b) =>
      intervalsOverlap(b.start_time, b.end_time, start, end)
    );
    out.push({
      start,
      end,
      label: formatHour12(h),
      booked: clash,
    });
  }
  return out;
}

module.exports = {
  PRICE_PER_HOUR,
  normalizeTime,
  timeToMinutes,
  hoursBetween,
  intervalsOverlap,
  totalPriceFromHours,
  listAvailableSlots,
};
