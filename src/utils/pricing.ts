// ── Turf pricing registry ─────────────────────────────────────────────────────
// Must stay in sync with TURFS[] in frontend BookingPage.tsx.
//
// Football & Cricket: Day ₹600/hr  · Night ₹1000/hr
// Badminton:          Flat ₹300/hr (day === night — no time-of-day variation)

interface TurfPricing { day: number; night: number; }

const TURF_PRICING: Record<string, TurfPricing> = {
  // Football
  'thunder-arena':    { day: 600, night: 1000 },
  'blitz-ground':     { day: 600, night: 1000 },
  'kickoff-zone':     { day: 600, night: 1000 },
  'goal-rush-field':  { day: 600, night: 1000 },
  // Cricket
  'century-pitch':    { day: 600, night: 1000 },
  'spin-king-nets':   { day: 600, night: 1000 },
  'powerplay-arena':  { day: 600, night: 1000 },
  // Badminton — flat ₹300 regardless of time
  'smash-court-a':    { day: 300, night: 300 },
  'shuttle-court-b':  { day: 300, night: 300 },
  'ace-court-c':      { day: 300, night: 300 },
};

// Fallback when no turfId supplied (legacy / global calls)
const DEFAULT_PRICING: TurfPricing = { day: 600, night: 1000 };

/** Returns the pricing config for a turfId, falling back to default. */
export function getTurfPricing(turfId?: string): TurfPricing {
  if (turfId && TURF_PRICING[turfId]) return TURF_PRICING[turfId];
  return DEFAULT_PRICING;
}

/** Returns true if hour h is a night hour (6 PM – 6 AM). */
function isNightHour(h: number): boolean {
  return h >= 18 || h < 6;
}

/**
 * Returns the price for one slot hour given its label and optional turfId.
 *
 * @param slotLabel - e.g. "6:00 PM - 7:00 PM"
 * @param turfId    - e.g. "thunder-arena" (optional — falls back to DEFAULT_PRICING)
 */
export function getSlotPrice(slotLabel: string, turfId?: string): number {
  const pricing = getTurfPricing(turfId);
  // Flat-rate turfs (badminton): same price regardless of time of day
  if (pricing.day === pricing.night) return pricing.day;

  const m = slotLabel.match(/^(\d+):00\s(AM|PM)/);
  if (!m) return pricing.night; // safe fallback
  let h = parseInt(m[1]);
  if (m[2] === 'PM' && h !== 12) h += 12;
  if (m[2] === 'AM' && h === 12) h = 0;
  return isNightHour(h) ? pricing.night : pricing.day;
}

/**
 * Calculates base, discount, and total for an array of slot labels.
 * Multi-slot discounts: 2 slots = 10% off, 3+ = 20% off.
 *
 * @param slots  - array of slot labels e.g. ["6:00 PM - 7:00 PM", ...]
 * @param turfId - optional turf ID for per-turf pricing
 */
export function calcPricing(
  slots: string[],
  turfId?: string,
): { baseAmount: number; discountAmount: number; totalAmount: number } {
  const base  = slots.reduce((sum, slot) => sum + getSlotPrice(slot, turfId), 0);
  const count = slots.length;
  const pct   = count === 2 ? 10 : count >= 3 ? 20 : 0;
  const disc  = Math.round(base * pct / 100);
  return { baseAmount: base, discountAmount: disc, totalAmount: base - disc };
}

/**
 * Builds a human-readable slot label from a 0–23 hour index.
 * e.g. h=18 → "6:00 PM - 7:00 PM"
 */
export function buildSlotLabel(h: number): string {
  const fmt = (hour: number): string => {
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${h12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
  };
  const next = (h + 1) % 24;
  return `${fmt(h)} - ${fmt(next)}`;
}