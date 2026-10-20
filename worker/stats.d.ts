export const STATS_PATH: string;
export const CAPS: Record<string, number>;
export const FIELDS: string[];
export function emptyTotals(): Record<string, number>;
export function sanitizeDelta(body: unknown): Record<string, number> | null;
