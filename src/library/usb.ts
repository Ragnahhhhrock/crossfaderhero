import { createStore, del, get, set } from 'idb-keyval';
import type { DeckId } from '../types';

/**
 * A virtual USB stick = one or more folders the DJ granted read access to.
 * Chromium browsers get persistent handles (File System Access API); others fall
 * back to a one-off folder upload that lasts for the session.
 */

export interface UsbFolder {
  name: string;
  handle?: FileSystemDirectoryHandle;
  files?: File[]; // fallback mode
}

export interface FoundFile {
  path: string;
  name: string;
  getFile: () => Promise<File>;
}

const store = createStore('cfh-usb', 'slots');

export const supportsFolderAccess = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export async function pickFolder(): Promise<UsbFolder | null> {
  if (supportsFolderAccess) {
    try {
      const handle = await window.showDirectoryPicker({ id: 'cfh-music', mode: 'read' });
      return { name: handle.name, handle };
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return null;
      throw e;
    }
  }
  return pickFolderFallback();
}

function pickFolderFallback(): Promise<UsbFolder | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.setAttribute('webkitdirectory', '');
    input.style.display = 'none';
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      input.remove();
      if (!files.length) return resolve(null);
      const name = files[0].webkitRelativePath.split('/')[0] || 'Music';
      resolve({ name, files });
    };
    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    });
    document.body.appendChild(input);
    input.click();
  });
}

export const isAudioFile = (name: string) => /\.mp3$/i.test(name) && !name.startsWith('._');

export async function* scanFolder(folder: UsbFolder): AsyncGenerator<FoundFile> {
  if (folder.files) {
    for (const f of folder.files) {
      if (!isAudioFile(f.name)) continue;
      yield { path: f.webkitRelativePath || f.name, name: f.name, getFile: async () => f };
    }
    return;
  }
  if (!folder.handle) return;
  const stack: { dir: FileSystemDirectoryHandle; prefix: string }[] = [{ dir: folder.handle, prefix: folder.name }];
  while (stack.length) {
    const { dir, prefix } = stack.pop()!;
    const subdirs: { dir: FileSystemDirectoryHandle; prefix: string }[] = [];
    for await (const entry of dir.values()) {
      if (entry.name.startsWith('.')) continue;
      if (entry.kind === 'directory') subdirs.push({ dir: entry as FileSystemDirectoryHandle, prefix: `${prefix}/${entry.name}` });
      else if (isAudioFile(entry.name)) {
        const fh = entry as FileSystemFileHandle;
        yield { path: `${prefix}/${entry.name}`, name: entry.name, getFile: () => fh.getFile() };
      }
    }
    subdirs.sort((a, b) => b.prefix.localeCompare(a.prefix));
    stack.push(...subdirs);
  }
}

/** Persist handle-based folders so the USB comes back next session. */
export async function saveSlot(slot: DeckId, folders: UsbFolder[]): Promise<void> {
  const handles = folders.filter((f) => f.handle).map((f) => f.handle!);
  try {
    if (handles.length) await set(slot, handles, store);
    else await del(slot, store);
  } catch {
    /* ignore */
  }
}

export async function loadSlot(slot: DeckId): Promise<UsbFolder[]> {
  try {
    const handles = ((await get(slot, store)) as FileSystemDirectoryHandle[] | undefined) ?? [];
    return handles.map((handle) => ({ name: handle.name, handle }));
  } catch {
    return [];
  }
}

export async function hasPermission(folder: UsbFolder): Promise<boolean> {
  if (!folder.handle) return true;
  return (await folder.handle.queryPermission({ mode: 'read' })) === 'granted';
}

/** Must be called from a user gesture. */
export async function requestPermission(folder: UsbFolder): Promise<boolean> {
  if (!folder.handle) return true;
  return (await folder.handle.requestPermission({ mode: 'read' })) === 'granted';
}
