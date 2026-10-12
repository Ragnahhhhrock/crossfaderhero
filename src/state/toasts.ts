import { create } from 'zustand';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'warn';
}

interface ToastState {
  toasts: Toast[];
  push: (text: string, tone?: Toast['tone']) => void;
  dismiss: (id: number) => void;
}

let next = 1;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push(text, tone = 'info') {
    const id = next++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4500);
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

export const toast = (text: string, tone?: Toast['tone']) => useToasts.getState().push(text, tone);
