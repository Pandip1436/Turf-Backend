export const PRICING = { day: 600, night: 1000 } as const;

/** Returns slot price based on start-hour label e.g. "6:00 PM - 7:00 PM" */
export function getSlotPrice(slotLabel: string): number {
  const m = slotLabel.match(/^(\d+):00\s(AM|PM)/);
  if (!m) return PRICING.night;
  let h = parseInt(m[1]);
  const ap = m[2];
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h >= 18 || h < 6 ? PRICING.night : PRICING.day;
}

export function calcPricing(slots: string[]): {
  baseAmount: number;
  discountAmount: number;
  totalAmount: number;
} {
  const base  = slots.reduce((s, slot) => s + getSlotPrice(slot), 0);
  const count = slots.length;
  const pct   = count === 2 ? 10 : count >= 3 ? 20 : 0;
  const disc  = Math.round(base * pct / 100);
  return { baseAmount: base, discountAmount: disc, totalAmount: base - disc };
}

/** Builds human-readable slot label from hour index (0-23) */
export function buildSlotLabel(h: number): string {
  const fmt = (hour: number) => {
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${h12}:00 ${hour < 12 ? 'AM' : 'PM'}`;
  };
  const nh = (h + 1) % 24;
  return `${fmt(h)} - ${fmt(nh)}`;
}
