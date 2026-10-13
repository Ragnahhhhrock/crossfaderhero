import { create } from 'zustand';
import type { Analysis, SlotId, Track } from '../types';
import { readTags } from '../library/id3';
import { track } from '../analytics/ga';
import { decodeForAnalysis, analyzeBuffer, getCachedAnalysis, saveAnalysis } from '../library/analysisService';
import {
  hasPermission,
  loadSlot,
  pickFolder,
  requestPermission,
  saveSlot,
  scanFolder,
  supportsFolderAccess,
  type UsbFolder,
} from '../library/usb';

export type SlotStatus = 'empty' | 'locked' | 'scanning' | 'ready';

export interface SlotState {
  folders: UsbFolder[];
  status: SlotStatus;
  found: number;
  tracks: Track[];
}

export const SLOTS: SlotId[] = ['A', 'B', 'crate'];

interface LibraryState {
  /** USB sticks A and B for the CDJs, and the record crates for the turntables. */
  slots: Record<SlotId, SlotState>;
  analysing: string | null; // key of the track being analysed in the background
  queued: number;
  init: () => Promise<void>;
  insertFolder: (slot: SlotId) => Promise<void>;
  unlock: (slot: SlotId) => Promise<void>;
  eject: (slot: SlotId) => void;
  removeFolder: (slot: SlotId, index: number) => Promise<void>;
  setAnalysis: (key: string, analysis: Analysis) => void;
  findTrack: (key: string) => Track | undefined;
}

const emptySlot = (): SlotState => ({ folders: [], status: 'empty', found: 0, tracks: [] });

const artworkUrls = new Map<string, string>();

function trackKey(path: string, file: File): string {
  return `${path}|${file.size}|${file.lastModified}`;
}

export const useLibrary = create<LibraryState>((setState, getState) => {
  const patchSlot = (slot: SlotId, patch: Partial<SlotState>) =>
    setState((s) => ({ slots: { ...s.slots, [slot]: { ...s.slots[slot], ...patch } } }));

  const patchTrack = (key: string, patch: Partial<Track>) =>
    setState((s) => {
      const slots = { ...s.slots };
      for (const id of SLOTS) {
        const i = slots[id].tracks.findIndex((t) => t.key === key);
        if (i >= 0) {
          const tracks = slots[id].tracks.slice();
          tracks[i] = { ...tracks[i], ...patch };
          slots[id] = { ...slots[id], tracks };
        }
      }
      return { slots };
    });

  const scanToken: Record<SlotId, number> = { A: 0, B: 0, crate: 0 };

  async function scan(slot: SlotId) {
    const token = ++scanToken[slot];
    const { folders } = getState().slots[slot];
    patchSlot(slot, { status: 'scanning', found: 0, tracks: [] });
    const tracks: Track[] = [];
    let flushAt = 0;
    for (const [folderIndex, folder] of folders.entries()) {
      for await (const f of scanFolder(folder)) {
        if (token !== scanToken[slot]) return;
        try {
          const file = await f.getFile();
          const key = trackKey(f.path, file);
          const meta = await readTags(file);
          let artworkUrl = artworkUrls.get(key);
          if (!artworkUrl && meta.artwork) {
            artworkUrl = URL.createObjectURL(new Blob([meta.artwork.data as Uint8Array<ArrayBuffer>], { type: meta.artwork.mime }));
            artworkUrls.set(key, artworkUrl);
          }
          delete meta.artwork;
          const analysis = await getCachedAnalysis(key);
          tracks.push({
            key,
            slot,
            folder: folderIndex,
            path: f.path,
            name: f.name,
            size: file.size,
            lastModified: file.lastModified,
            meta,
            artworkUrl,
            analysis,
            analysisState: analysis ? 'done' : 'pending',
            getFile: f.getFile,
          });
        } catch {
          /* unreadable file — skip */
        }
        if (tracks.length - flushAt >= 25) {
          flushAt = tracks.length;
          patchSlot(slot, { found: tracks.length, tracks: tracks.slice() });
        }
      }
    }
    if (token !== scanToken[slot]) return;
    tracks.sort((a, b) => a.path.localeCompare(b.path));
    patchSlot(slot, { status: 'ready', found: tracks.length, tracks });
    pumpQueue();
  }

  // ---- background analysis queue (one track at a time) ----
  let pumping = false;
  async function pumpQueue() {
    if (pumping) return;
    pumping = true;
    try {
      for (;;) {
        const all = SLOTS.flatMap((id) => getState().slots[id].tracks);
        const next = all.find((t) => t.analysisState === 'pending');
        setState({ queued: all.filter((t) => t.analysisState === 'pending').length });
        if (!next) break;
        setState({ analysing: next.key });
        patchTrack(next.key, { analysisState: 'running' });
        try {
          const file = await next.getFile();
          const buf = await decodeForAnalysis(file);
          const analysis = await analyzeBuffer(buf, next.meta.genre);
          await saveAnalysis(next.key, analysis);
          // the deck may have analysed it first
          if (getState().findTrack(next.key)?.analysisState !== 'done') patchTrack(next.key, { analysis, analysisState: 'done' });
        } catch {
          patchTrack(next.key, { analysisState: 'error' });
        }
        // give the UI and audio thread room to breathe between tracks
        await new Promise((r) => setTimeout(r, 150));
      }
    } finally {
      setState({ analysing: null });
      pumping = false;
    }
  }

  return {
    slots: { A: emptySlot(), B: emptySlot(), crate: emptySlot() },
    analysing: null,
    queued: 0,

    async init() {
      for (const slot of SLOTS) {
        const folders = await loadSlot(slot);
        if (!folders.length) continue;
        const granted = (await Promise.all(folders.map(hasPermission))).every(Boolean);
        patchSlot(slot, { folders, status: granted ? 'scanning' : 'locked' });
        if (granted) void scan(slot);
      }
    },

    async insertFolder(slot) {
      const folder = await pickFolder();
      if (!folder) return;
      const current = getState().slots[slot].folders;
      if (folder.handle) {
        for (const f of current) {
          if (f.handle && (await f.handle.isSameEntry(folder.handle))) return void scan(slot);
        }
      }
      const folders = [...current, folder];
      patchSlot(slot, { folders });
      track(slot === 'crate' ? 'crate_added' : 'usb_folder_added', { deck: slot, folder_access: supportsFolderAccess ? 'native' : 'fallback', folder_count: folders.length });
      await saveSlot(slot, folders);
      await scan(slot);
    },

    async unlock(slot) {
      const { folders } = getState().slots[slot];
      let ok = true;
      for (const f of folders) ok = (await requestPermission(f)) && ok;
      if (ok) await scan(slot);
    },

    eject(slot) {
      scanToken[slot]++;
      patchSlot(slot, emptySlot());
      void saveSlot(slot, []);
    },

    async removeFolder(slot, index) {
      const folders = getState().slots[slot].folders.filter((_, i) => i !== index);
      patchSlot(slot, { folders });
      await saveSlot(slot, folders);
      if (folders.length) await scan(slot);
      else patchSlot(slot, emptySlot());
    },

    setAnalysis(key, analysis) {
      patchTrack(key, { analysis, analysisState: 'done' });
      void saveAnalysis(key, analysis);
    },

    findTrack(key) {
      for (const id of SLOTS) {
        const t = getState().slots[id].tracks.find((x) => x.key === key);
        if (t) return t;
      }
      return undefined;
    },
  };
});

export { supportsFolderAccess };
