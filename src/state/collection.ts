import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Track } from '../types';
import { track as ga } from '../analytics/ga';
import { CRATE_HOLDS, USB_COLOURS, bytesUsed, groupTracks, poolTracks, resolve, type CrateBy } from '../library/sorting';
import { useLibrary } from './library';

/**
 * Your sorted collection: any number of USB drives for the CDJs and labelled
 * record crates for the turntables. Each holds track keys (path + size + date),
 * so the sorting survives reloads as long as the folders are plugged in again.
 */

export interface SortedUsb {
  id: string;
  name: string;
  /** Token name of the stick's colour. */
  colour: string;
  capacityGb: number;
  keys: string[];
}

export interface SortedCrate {
  id: string;
  name: string;
  by: CrateBy;
  keys: string[];
}

export type Target = { kind: 'usb' | 'crate'; id: string };

interface CollectionState {
  usbs: SortedUsb[];
  crates: SortedCrate[];
  addUsb: (name: string, capacityGb: number) => string;
  addCrate: (name: string, by: CrateBy) => string;
  rename: (t: Target, name: string) => void;
  remove: (t: Target) => void;
  setCapacity: (id: string, capacityGb: number) => void;
  /** Add tracks; returns how many went in (a USB stops when it's full). */
  addTracks: (t: Target, tracks: Track[]) => { added: number; full: boolean };
  removeKeys: (t: Target, keys: string[]) => void;
  /** One crate per genre / artist / period, filled with the matching records. Returns crates made or topped up. */
  autoCrates: (by: Exclude<CrateBy, 'category'>, tracks: Track[], min?: number) => number;
}

const uid = () => Math.random().toString(36).slice(2, 9);

export const useCollection = create<CollectionState>()(
  persist(
    (set, get) => {
      const patch = (t: Target, fn: (keys: string[]) => string[]) =>
        set((s) =>
          t.kind === 'usb'
            ? { usbs: s.usbs.map((u) => (u.id === t.id ? { ...u, keys: fn(u.keys) } : u)) }
            : { crates: s.crates.map((c) => (c.id === t.id ? { ...c, keys: fn(c.keys) } : c)) },
        );

      return {
        usbs: [],
        crates: [],

        addUsb(name, capacityGb) {
          const id = uid();
          const colour = USB_COLOURS[get().usbs.length % USB_COLOURS.length];
          set((s) => ({ usbs: [...s.usbs, { id, name: name.trim() || `USB ${s.usbs.length + 1}`, colour, capacityGb, keys: [] }] }));
          ga('usb_drive_created', { capacity_gb: capacityGb });
          return id;
        },

        addCrate(name, by) {
          const id = uid();
          set((s) => ({ crates: [...s.crates, { id, name: name.trim() || `Crate ${s.crates.length + 1}`, by, keys: [] }] }));
          ga('crate_labelled', { by });
          return id;
        },

        rename(t, name) {
          const n = name.trim();
          if (!n) return;
          set((s) =>
            t.kind === 'usb'
              ? { usbs: s.usbs.map((u) => (u.id === t.id ? { ...u, name: n } : u)) }
              : { crates: s.crates.map((c) => (c.id === t.id ? { ...c, name: n } : c)) },
          );
        },

        remove(t) {
          set((s) => (t.kind === 'usb' ? { usbs: s.usbs.filter((u) => u.id !== t.id) } : { crates: s.crates.filter((c) => c.id !== t.id) }));
        },

        setCapacity(id, capacityGb) {
          set((s) => ({ usbs: s.usbs.map((u) => (u.id === id ? { ...u, capacityGb } : u)) }));
        },

        addTracks(t, tracks) {
          let added = 0;
          let full = false;
          if (t.kind === 'usb') {
            const usb = get().usbs.find((u) => u.id === t.id);
            if (!usb) return { added, full };
            const have = new Set(usb.keys);
            // what's already on the stick (the parts that are plugged in) counts against its size
            const byKey = new Map(poolTracks(useLibrary.getState().slots).map((x) => [x.key, x]));
            for (const x of tracks) byKey.set(x.key, x);
            let used = bytesUsed(resolve(usb.keys, byKey));
            const room = usb.capacityGb * 1e9;
            const keys: string[] = [];
            for (const x of tracks) {
              if (have.has(x.key)) continue;
              if (used + x.size > room) {
                full = true;
                break;
              }
              used += x.size;
              have.add(x.key);
              keys.push(x.key);
            }
            added = keys.length;
            patch(t, (k) => [...k, ...keys]);
          } else {
            patch(t, (k) => {
              const have = new Set(k);
              const keys = tracks.map((x) => x.key).filter((key) => !have.has(key) && (have.add(key), true));
              added = keys.length;
              full = k.length + keys.length > CRATE_HOLDS;
              return [...k, ...keys];
            });
          }
          return { added, full };
        },

        removeKeys(t, keys) {
          const drop = new Set(keys);
          patch(t, (k) => k.filter((x) => !drop.has(x)));
        },

        autoCrates(by, tracks, min = 1) {
          let made = 0;
          for (const g of groupTracks(tracks, by)) {
            if (g.label === null || g.tracks.length < min) continue;
            const existing = get().crates.find((c) => c.by === by && c.name.toLowerCase() === g.label!.toLowerCase());
            const id = existing?.id ?? get().addCrate(g.label, by);
            if (get().addTracks({ kind: 'crate', id }, g.tracks).added || !existing) made++;
          }
          ga('crates_auto_sorted', { by, crates: made });
          return made;
        },
      };
    },
    {
      name: 'cfh-collection',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ usbs: s.usbs, crates: s.crates }),
    },
  ),
);
