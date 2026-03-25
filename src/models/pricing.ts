// ── Turf pricing registry ────────────────────────────────────────────────────
// Football & Cricket: Day ₹600/hr · Night ₹1000/hr
// Badminton:          Flat ₹300/hr (day & night same)

interface TurfPricing { day: number; night: number; }

// Map turfId → pricing. Badminton courts use flat rate (day === night === 300).
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
  // Badminton (flat ₹300 all hours)
  'smash-court-a':    { day: 300, night: 300  },
  'shuttle-court-b':  { day: 300, night: 300  },
  'ace-court-c':      { day: 300, night: 300  },
};

// Default pricing when no turfId supplied (Football/Cricket standard)
const DEFAULT_PRICING: TurfPricing = { day: 600, night: 1000 };

/** Get pricing config for a turfId (falls back to default). */
export function getTurfPricing(turfId?: string): TurfPricing {
  if (turfId && TURF_PRICING[turfId]) return TURF_PRICING[turfId];
  return DEFAULT_PRICING;
}

/** Returns whether hour h is a night hour (6 PM – 6 AM). */
function isNightHour(h: number): boolean {
  return h >= 18 || h < 6;
}

/**
 * Returns slot price based on slot label and turfId.
 * Slot label format: "6:00 PM - 7:00 PM"
 */
export function getSlotPrice(slotLabel: string, turfId?: string): number {
  const pricing = getTurfPricing(turfId);
  // Flat pricing (badminton) — same regardless of time
  if (pricing.day === pricing.night) return pricing.day;

  const m = slotLabel.match(/^(\d+):00\s(AM|PM)/);
  if (!m) return pricing.night;
  let h = parseInt(m[1]);
  const ap = m[2];
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return isNightHour(h) ? pricing.night : pricing.day;
}

/** Calculate total with multi-slot discount. */
export function calcPricing(
  slots: string[],
  turfId?: string,
): { baseAmount: number; discountAmount: number; totalAmount: number } {
  const base  = slots.reduce((s, slot) => s + getSlotPrice(slot, turfId), 0);
  const count = slots.length;
  const pct   = count === 2 ? 10 : count >= 3 ? 20 : 0;
  const disc  = Math.round(base * pct / 100);
  return { baseAmount: base, discountAmount: disc, totalAmount: base - disc };
}

/** Builds human-readable slot label from hour index 0–23. */
export function buildSlotLabel(h: number): string {
  const fmt = (hour: number) => {
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${h12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
  };
  const nh = (h + 1) % 24;
  return `${fmt(h)} - ${fmt(nh)}`;
}