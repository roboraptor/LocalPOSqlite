import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ToastStore,
  normalizeToastIcon,
  DEFAULT_TOAST_DURATION_MS,
  TOAST_EXIT_ANIMATION_MS,
  MAX_VISIBLE_TOASTS,
} from "@/lib/toasts";

describe("ToastStore & normalizeToastIcon", () => {
  let store: ToastStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new ToastStore();
  });

  afterEach(() => {
    store.clear();
    vi.useRealTimers();
  });

  it("normalizes valid FontAwesome names and rejects unsafe strings", () => {
    expect(normalizeToastIcon(" FaFloppyDisk ")).toBe("FaFloppyDisk");
    expect(normalizeToastIcon("FaTriangleExclamation")).toBe("FaTriangleExclamation");
    expect(normalizeToastIcon("bi-check")).toBeUndefined();
    expect(normalizeToastIcon("FaBad Icon!")).toBeUndefined();
    expect(normalizeToastIcon("")).toBeUndefined();
    expect(normalizeToastIcon(undefined)).toBeUndefined();
  });

  it("supports both positional args and ToastOptions object", () => {
    const id1 = store.success("Uloženo", "Hotovo", 2500);
    const onAction = vi.fn();
    const id2 = store.warning("Pozor", {
      title: "Varování",
      icon: "FaTriangleExclamation",
      durationMs: 0,
      action: { label: "Opakovat", onClick: onAction },
    });

    const snap = store.getSnapshot();
    expect(snap).toHaveLength(2);
    expect(snap[0]).toMatchObject({
      id: id1,
      type: "success",
      title: "Hotovo",
      message: "Uloženo",
      durationMs: 2500,
      count: 1,
    });
    expect(snap[1]).toMatchObject({
      id: id2,
      type: "warning",
      title: "Varování",
      icon: "FaTriangleExclamation",
      durationMs: 0,
    });
    expect(snap[1].action?.label).toBe("Opakovat");
  });

  it("auto-dismisses after durationMs + TOAST_EXIT_ANIMATION_MS and keeps durationMs=0 persistent", () => {
    store.info("Krátká zpráva", undefined, 1000);
    store.danger("Trvalá chyba", { durationMs: 0 });

    vi.advanceTimersByTime(999);
    expect(store.getSnapshot()[0].isExiting).toBe(false);

    vi.advanceTimersByTime(1);
    expect(store.getSnapshot()[0].isExiting).toBe(true);

    vi.advanceTimersByTime(TOAST_EXIT_ANIMATION_MS);
    expect(store.getSnapshot()).toHaveLength(1);
    expect(store.getSnapshot()[0].message).toBe("Trvalá chyba");

    vi.advanceTimersByTime(60_000);
    expect(store.getSnapshot()).toHaveLength(1);
  });

  it("preserves exact remaining duration across pause and resume", () => {
    const id = store.success("Časovač", { durationMs: 4000 });

    vi.advanceTimersByTime(1500);
    store.pause(id);
    expect(store.getSnapshot()[0].isPaused).toBe(true);

    // Waiting while paused should not advance auto-close
    vi.advanceTimersByTime(10_000);
    expect(store.getSnapshot()[0].isExiting).toBe(false);

    store.resume(id);
    expect(store.getSnapshot()[0].isPaused).toBe(false);

    vi.advanceTimersByTime(2499);
    expect(store.getSnapshot()[0].isExiting).toBe(false);

    vi.advanceTimersByTime(1);
    expect(store.getSnapshot()[0].isExiting).toBe(true);

    vi.advanceTimersByTime(TOAST_EXIT_ANIMATION_MS);
    expect(store.getSnapshot()).toHaveLength(0);
  });

  it("deduplicates identical active toasts by incrementing count, resetKey, and resetting timer", () => {
    const id1 = store.success("Uloženo", "Stav", 2000);
    vi.advanceTimersByTime(1500);

    const id2 = store.success("Uloženo", "Stav", 2000);
    expect(id2).toBe(id1);
    expect(store.getSnapshot()).toHaveLength(1);
    expect(store.getSnapshot()[0].count).toBe(2);
    expect(store.getSnapshot()[0].resetKey).toBe(1);

    // Old 1500ms + 1000ms would have expired; reset timer keeps it alive until +2000ms
    vi.advanceTimersByTime(1000);
    expect(store.getSnapshot()[0].isExiting).toBe(false);

    vi.advanceTimersByTime(1000);
    expect(store.getSnapshot()[0].isExiting).toBe(true);
  });

  it("caps active visible toasts at MAX_VISIBLE_TOASTS by dismissing oldest active toast", () => {
    for (let i = 1; i <= MAX_VISIBLE_TOASTS + 1; i++) {
      store.info(`Zpráva ${i}`);
    }

    const snap = store.getSnapshot();
    expect(snap[0].isExiting).toBe(true);
    expect(snap.filter((t) => !t.isExiting)).toHaveLength(MAX_VISIBLE_TOASTS);

    vi.advanceTimersByTime(TOAST_EXIT_ANIMATION_MS);
    expect(store.getSnapshot()).toHaveLength(MAX_VISIBLE_TOASTS);
    expect(store.getSnapshot()[0].message).toBe("Zpráva 2");
  });

  it("cancels all timers cleanly on manual remove() and clear()", () => {
    const listener = vi.fn();
    const unsub = store.subscribe(listener);

    const id = store.info("Test", { durationMs: DEFAULT_TOAST_DURATION_MS });
    store.remove(id);
    expect(store.getSnapshot()[0].isExiting).toBe(true);

    store.clear();
    expect(store.getSnapshot()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(DEFAULT_TOAST_DURATION_MS + TOAST_EXIT_ANIMATION_MS);
    expect(store.getSnapshot()).toEqual([]);
    unsub();
  });
});
