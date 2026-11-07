export interface Deal {
  id: number; name: string; price: number; original: number; discount: number;
  endsAt: number | null; rating: number | null; reviews: number;
  players: number[]; tags: number[]; image: string | null; launch: boolean;
  lowest: number | null; observedAt: number;
}
export interface Catalog {
  version: 1; country: 'VN'; currency: 'VND'; fetchedAt: number;
  source: 'steam' | 'fixture'; trackingSince: number | null;
  total: number; items: Deal[]; tags: Record<string, string>;
}
export interface PricePoint { at: number; price: number; original: number; discount: number }

export const money = (n: number) => new Intl.NumberFormat('vi-VN', {style:'currency',currency:'VND',maximumFractionDigits:0}).format(n);
export function isDeal(value: unknown): value is Deal {
  if (!value || typeof value !== 'object') return false;
  const d = value as Partial<Deal>;
  return Number.isSafeInteger(d.id) && Number(d.id) > 0 && typeof d.name === 'string' &&
    typeof d.price === 'number' && Number.isSafeInteger(d.price) && d.price >= 0 &&
    typeof d.original === 'number' && Number.isSafeInteger(d.original) && d.original >= d.price &&
    typeof d.discount === 'number' && d.discount >= 0 && d.discount <= 100 &&
    Array.isArray(d.players) && Array.isArray(d.tags);
}
