/**
 * Your own pictures on the club's screens, and the DJ's profile picture.
 *
 * Everything stays in the browser: wall photos are shrunk and kept in IndexedDB, the
 * profile picture is a small JPEG data URL saved with the character. Nothing is uploaded.
 */
import { createStore, get, set } from 'idb-keyval';
import { coverRect, fitWithin, PROFILE_MAX_CHARS } from './imageMath';

export { coverRect, fitWithin, isProfilePhoto, PROFILE_MAX_CHARS } from './imageMath';

/** Most pictures the screens will cycle through. */
export const MAX_PHOTOS = 12;
/** Longest side of a wall photo once stored. */
export const WALL_MAX_SIDE = 1024;
/** Profile pictures are square, this many pixels a side. */
export const PROFILE_PX = 256;
const db = createStore('crossfaderhero-club', 'photos');
const KEY = 'wall.v1';

export type Source = CanvasImageSource & { width: number; height: number };

const canvasOf = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/** Decode an image file the way the camera roll shows it (rotated upright). */
export async function fileToSource(file: Blob): Promise<Source> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through to an <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = url;
  });
}

/** A wall photo: the whole picture, shrunk to at most WALL_MAX_SIDE. */
export function toWallCanvas(src: Source): HTMLCanvasElement {
  const { w, h } = fitWithin(src.width, src.height, WALL_MAX_SIDE);
  const c = canvasOf(w, h);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

/** A profile picture: the middle square of the picture. */
export function toProfileCanvas(src: Source, px = PROFILE_PX): HTMLCanvasElement {
  const c = canvasOf(px, px);
  const ctx = c.getContext('2d')!;
  const r = coverRect(src.width, src.height, px, px);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, r.sx, r.sy, r.sw, r.sh, 0, 0, px, px);
  return c;
}

/** The profile picture as a data URL, backing off the quality if it comes out too big. */
export function profileDataUrl(src: Source): string {
  const c = toProfileCanvas(src);
  for (const q of [0.88, 0.75, 0.6, 0.45]) {
    const url = c.toDataURL('image/jpeg', q);
    if (url.length <= PROFILE_MAX_CHARS) return url;
  }
  return '';
}

/** Decode a saved profile picture for drawing on a screen. */
export async function urlToCanvas(url: string): Promise<HTMLCanvasElement> {
  const img = await loadImage(url);
  const c = canvasOf(img.naturalWidth, img.naturalHeight);
  c.getContext('2d')!.drawImage(img, 0, 0);
  return c;
}

/** Ask for pictures with the browser's file chooser (on a phone: the library or the camera). */
export function chooseImages(multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = multiple;
    input.style.display = 'none';
    let settled = false;
    const done = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.onchange = () => done([...(input.files ?? [])]);
    input.oncancel = () => done([]);
    document.body.appendChild(input);
    input.click();
  });
}

// ------------------------------------------------------------------ the wall's photo store

export interface WallPhoto {
  id: string;
  url: string;
  canvas: HTMLCanvasElement;
}

type Saved = { id: string; url: string };

/** The pictures on the club's screens, kept in this browser. */
class PhotoStore {
  private photos: WallPhoto[] = [];
  private listeners = new Set<() => void>();
  private loaded: Promise<void> | null = null;

  list(): readonly WallPhoto[] {
    return this.photos;
  }

  canvases(): HTMLCanvasElement[] {
    return this.photos.map((p) => p.canvas);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Read what was saved last time. Safe to call more than once. */
  load(): Promise<void> {
    this.loaded ??= (async () => {
      try {
        const saved = (await get<Saved[]>(KEY, db)) ?? [];
        const out: WallPhoto[] = [];
        for (const s of saved.slice(0, MAX_PHOTOS)) {
          try {
            out.push({ ...s, canvas: await urlToCanvas(s.url) });
          } catch {
            /* a picture that won't decode is dropped */
          }
        }
        // anything added while we were reading stays
        this.photos = [...out, ...this.photos];
        this.emit();
      } catch {
        /* IndexedDB blocked (private window): photos last until the tab closes */
      }
    })();
    return this.loaded;
  }

  get full(): boolean {
    return this.photos.length >= MAX_PHOTOS;
  }

  /** Add a picture; returns false when the screens already have the most they can hold. */
  async add(src: Source): Promise<boolean> {
    await this.load();
    if (this.full) return false;
    const canvas = toWallCanvas(src);
    const url = canvas.toDataURL('image/jpeg', 0.82);
    this.photos = [...this.photos, { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, url, canvas }];
    this.emit();
    void this.persist();
    return true;
  }

  remove(id: string): void {
    this.photos = this.photos.filter((p) => p.id !== id);
    this.emit();
    void this.persist();
  }

  private emit(): void {
    this.listeners.forEach((f) => f());
  }

  private async persist(): Promise<void> {
    try {
      await set(KEY, this.photos.map(({ id, url }): Saved => ({ id, url })), db);
    } catch {
      /* out of space or blocked: the photos still show this visit */
    }
  }
}

export const photoStore = new PhotoStore();
