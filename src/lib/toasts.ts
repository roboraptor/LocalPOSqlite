export const DEFAULT_TOAST_DURATION_MS = 4000;
export const TOAST_EXIT_ANIMATION_MS = 300;
export const MAX_VISIBLE_TOASTS = 5;

export type ToastType = "success" | "danger" | "warning" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  title?: string;
  durationMs?: number;
  icon?: string;
  action?: ToastAction;
}

export interface ToastMessage {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  icon?: string;
  action?: ToastAction;
  durationMs: number;
  isExiting: boolean;
  isPaused: boolean;
  count: number;
  resetKey: number;
}

interface AutoTimerEntry {
  timer: ReturnType<typeof setTimeout> | null;
  startedAt: number;
  remainingMs: number;
}

const VALID_FA_ICON_RE = /^Fa[A-Za-z0-9]+$/;

/**
 * Validates and normalizes an optional react-icons/fa6 icon name (e.g. "FaFloppyDisk").
 */
export function normalizeToastIcon(icon?: string): string | undefined {
  if (!icon) return undefined;
  const trimmed = icon.trim();
  return VALID_FA_ICON_RE.test(trimmed) ? trimmed : undefined;
}

export class ToastStore {
  private list: ToastMessage[] = [];
  private readonly serverSnapshot: ToastMessage[] = [];
  private listeners = new Set<() => void>();
  private autoTimers = new Map<string, AutoTimerEntry>();
  private exitTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private nextId = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): ToastMessage[] => this.list;

  getServerSnapshot = (): ToastMessage[] => this.serverSnapshot;

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private clearAutoTimer(id: string) {
    const entry = this.autoTimers.get(id);
    if (entry?.timer) {
      clearTimeout(entry.timer);
    }
    this.autoTimers.delete(id);
  }

  private scheduleAutoClose(id: string, delayMs: number) {
    this.clearAutoTimer(id);
    if (delayMs <= 0) return;

    const timer = setTimeout(() => {
      this.remove(id);
    }, delayMs);

    this.autoTimers.set(id, {
      timer,
      startedAt: Date.now(),
      remainingMs: delayMs,
    });
  }

  add(
    type: ToastType,
    message: string,
    titleOrOptions?: string | ToastOptions,
    durationMs?: number,
  ): string {
    const opts: ToastOptions =
      typeof titleOrOptions === "object" && titleOrOptions !== null
        ? titleOrOptions
        : { title: titleOrOptions, durationMs };

    const title = opts.title;
    const duration = opts.durationMs ?? DEFAULT_TOAST_DURATION_MS;
    const icon = normalizeToastIcon(opts.icon);
    const action = opts.action;

    const existing = this.list.find(
      (t) =>
        !t.isExiting &&
        t.type === type &&
        t.title === title &&
        t.message === message &&
        t.icon === icon,
    );

    if (existing) {
      this.list = this.list.map((t) =>
        t.id === existing.id
          ? {
              ...t,
              count: t.count + 1,
              resetKey: t.resetKey + 1,
              durationMs: duration,
              action: action ?? t.action,
              isPaused: false,
            }
          : t,
      );
      this.scheduleAutoClose(existing.id, duration);
      this.emit();
      return existing.id;
    }

    const active = this.list.filter((t) => !t.isExiting);
    if (active.length >= MAX_VISIBLE_TOASTS) {
      const toRemoveCount = active.length - MAX_VISIBLE_TOASTS + 1;
      for (let i = 0; i < toRemoveCount; i++) {
        this.remove(active[i].id);
      }
    }

    const id = `toast-${++this.nextId}`;
    const toast: ToastMessage = {
      id,
      type,
      title,
      message,
      icon,
      action,
      durationMs: duration,
      isExiting: false,
      isPaused: false,
      count: 1,
      resetKey: 0,
    };

    this.list = [...this.list, toast];
    this.scheduleAutoClose(id, duration);
    this.emit();
    return id;
  }

  success(message: string, titleOrOptions?: string | ToastOptions, durationMs?: number): string {
    return this.add("success", message, titleOrOptions, durationMs);
  }

  danger(message: string, titleOrOptions?: string | ToastOptions, durationMs?: number): string {
    return this.add("danger", message, titleOrOptions, durationMs);
  }

  warning(message: string, titleOrOptions?: string | ToastOptions, durationMs?: number): string {
    return this.add("warning", message, titleOrOptions, durationMs);
  }

  info(message: string, titleOrOptions?: string | ToastOptions, durationMs?: number): string {
    return this.add("info", message, titleOrOptions, durationMs);
  }

  pause(id: string) {
    const target = this.list.find((t) => t.id === id);
    if (!target || target.isExiting || target.isPaused) return;

    const entry = this.autoTimers.get(id);
    if (entry?.timer) {
      clearTimeout(entry.timer);
      const elapsed = Date.now() - entry.startedAt;
      const remainingMs = Math.max(0, entry.remainingMs - elapsed);
      this.autoTimers.set(id, {
        timer: null,
        startedAt: entry.startedAt,
        remainingMs,
      });
    }

    this.list = this.list.map((t) => (t.id === id ? { ...t, isPaused: true } : t));
    this.emit();
  }

  resume(id: string) {
    const target = this.list.find((t) => t.id === id);
    if (!target || target.isExiting || !target.isPaused) return;

    this.list = this.list.map((t) => (t.id === id ? { ...t, isPaused: false } : t));

    const entry = this.autoTimers.get(id);
    if (entry) {
      if (entry.remainingMs > 0) {
        this.scheduleAutoClose(id, entry.remainingMs);
      } else if (target.durationMs > 0) {
        this.remove(id);
        return;
      }
    }

    this.emit();
  }

  remove(id: string) {
    this.clearAutoTimer(id);

    const target = this.list.find((t) => t.id === id);
    if (!target || target.isExiting) return;

    this.list = this.list.map((t) =>
      t.id === id ? { ...t, isExiting: true, isPaused: false } : t,
    );
    this.emit();

    const exitTimer = setTimeout(() => {
      this.exitTimers.delete(id);
      this.list = this.list.filter((t) => t.id !== id);
      this.emit();
    }, TOAST_EXIT_ANIMATION_MS);

    this.exitTimers.set(id, exitTimer);
  }

  clear() {
    for (const id of Array.from(this.autoTimers.keys())) {
      this.clearAutoTimer(id);
    }
    for (const timer of this.exitTimers.values()) {
      clearTimeout(timer);
    }
    this.exitTimers.clear();
    this.list = [];
    this.emit();
  }
}

export const toasts = new ToastStore();
