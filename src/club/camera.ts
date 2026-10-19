/**
 * A small camera dialog: the webcam on a computer, the front or back camera on a phone.
 * Resolves with the captured frame, or null if the player backs out. The picture never
 * leaves the browser, and the camera is switched off as soon as the dialog closes.
 */
import { chooseImages, fileToSource, type Source } from './photos';

export interface CameraOptions {
  /** Preview as a square, for profile pictures. */
  square?: boolean;
  title?: string;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** What to tell the player when the camera won't open. */
export function cameraProblem(name: string | undefined): string {
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return "The camera is blocked. Allow it for this site in your browser's settings, or upload a picture instead.";
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera found on this device. You can upload a picture instead.';
    case 'NotReadableError':
    case 'AbortError':
      return 'The camera is busy in another app. Close it there and try again, or upload a picture instead.';
    default:
      return "Couldn't start the camera. You can upload a picture instead.";
  }
}

export function cameraSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

export function takePhoto(opts: CameraOptions = {}): Promise<Source | null> {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const back = el('div', 'cam-backdrop');
    const box = el('div', 'cam');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', opts.title ?? 'Take a photo');
    box.append(el('h2', 'cam-title', opts.title ?? 'Take a photo'));

    const stage = el('div', `cam-stage${opts.square ? ' square' : ''}`);
    const video = el('video', 'cam-video');
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;
    const count = el('div', 'cam-count');
    count.setAttribute('aria-live', 'assertive');
    const status = el('p', 'cam-status');
    status.setAttribute('role', 'status');
    stage.append(video, count, status);

    const bar = el('div', 'cam-bar');
    const flip = el('button', 'tiny', 'Flip camera');
    flip.hidden = true;
    const timer = el('button', 'tiny', 'Timer: off');
    const shoot = el('button', 'primary', 'Take photo');
    const upload = el('button', 'tiny', 'Upload instead');
    const cancel = el('button', 'tiny', 'Cancel');
    bar.append(flip, timer, upload, el('span', 'cb-spacer'), cancel, shoot);
    box.append(stage, bar);
    back.append(box);

    let stream: MediaStream | null = null;
    let facing: 'user' | 'environment' = 'user';
    let delay = 0;
    let counting: number | null = null;
    let closed = false;

    const stop = () => {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      video.srcObject = null;
    };
    const close = (result: Source | null) => {
      if (closed) return;
      closed = true;
      if (counting !== null) clearInterval(counting);
      stop();
      window.removeEventListener('keydown', onKey, true);
      back.remove();
      previouslyFocused?.focus?.();
      resolve(result);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(null);
      } else if (e.key === 'Tab') {
        // keep focus inside the dialog
        const items = [...box.querySelectorAll<HTMLElement>('button:not([hidden]):not(:disabled)')];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    const start = async () => {
      stop();
      status.textContent = 'Starting the camera…';
      status.hidden = false;
      shoot.disabled = true;
      if (!cameraSupported()) {
        status.textContent = "This browser can't open the camera here (it needs a secure connection). You can upload a picture instead.";
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
        if (closed) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        video.srcObject = s;
        video.classList.toggle('mirror', facing === 'user');
        await video.play();
        status.hidden = true;
        shoot.disabled = false;
        // more than one camera: let the player pick (phones, laptops with an external webcam)
        const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
        flip.hidden = cams.length < 2;
      } catch (e) {
        status.textContent = cameraProblem((e as DOMException)?.name);
      }
    };

    const snap = () => {
      if (!video.videoWidth) return;
      const c = document.createElement('canvas');
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      c.getContext('2d')!.drawImage(video, 0, 0);
      close(Object.assign(c, { width: c.width, height: c.height }));
    };

    shoot.onclick = () => {
      if (!delay) return snap();
      if (counting !== null) return;
      let n = delay;
      count.textContent = String(n);
      shoot.disabled = true;
      counting = window.setInterval(() => {
        n--;
        if (n > 0) count.textContent = String(n);
        else {
          clearInterval(counting!);
          counting = null;
          count.textContent = '';
          shoot.disabled = false;
          snap();
        }
      }, 1000);
    };
    timer.onclick = () => {
      delay = delay === 0 ? 3 : delay === 3 ? 10 : 0;
      timer.textContent = delay ? `Timer: ${delay}s` : 'Timer: off';
    };
    flip.onclick = () => {
      facing = facing === 'user' ? 'environment' : 'user';
      void start();
    };
    upload.onclick = async () => {
      const [file] = await chooseImages(false);
      if (!file || closed) return;
      try {
        close(await fileToSource(file));
      } catch {
        status.textContent = "That file couldn't be opened as a picture.";
        status.hidden = false;
      }
    };
    cancel.onclick = () => close(null);
    back.onclick = (e) => e.target === back && close(null);

    window.addEventListener('keydown', onKey, true);
    document.body.append(back);
    shoot.focus();
    void start();
  });
}
