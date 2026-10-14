export interface CoverQuery { artist: string; title?: string; album?: string }
export interface CoverCandidate { artist?: string; album?: string; title?: string; image?: string }
export const COVER_PATH: string;
export function norm(s: string | undefined): string;
export function similarity(wanted: string, found: string | undefined): number;
export function pickBest<T extends CoverCandidate>(q: CoverQuery, candidates: T[]): T | null;
export function findCover(q: CoverQuery): Promise<string | null>;
export function handleCover(request: Request): Promise<Response>;
