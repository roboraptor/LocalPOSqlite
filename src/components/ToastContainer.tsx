"use client";

import { useSyncExternalStore } from "react";
import IconByName from "@/components/IconByName";
import { toasts, type ToastType } from "@/lib/toasts";

const TOAST_THEME: Record<
  ToastType,
  {
    surfaceClass: string;
    closeBtnClass: string;
    progressBg: string;
    actionBtnClass: string;
    defaultIcon: string;
    assertive: boolean;
  }
> = {
  success: {
    surfaceClass: "text-bg-success",
    closeBtnClass: "btn-close btn-close-white",
    progressBg: "rgba(255, 255, 255, 0.45)",
    actionBtnClass: "btn-outline-light",
    defaultIcon: "FaCircleCheck",
    assertive: false,
  },
  danger: {
    surfaceClass: "text-bg-danger",
    closeBtnClass: "btn-close btn-close-white",
    progressBg: "rgba(255, 255, 255, 0.45)",
    actionBtnClass: "btn-outline-light",
    defaultIcon: "FaTriangleExclamation",
    assertive: true,
  },
  warning: {
    surfaceClass: "text-bg-warning",
    closeBtnClass: "btn-close",
    progressBg: "rgba(0, 0, 0, 0.28)",
    actionBtnClass: "btn-outline-dark",
    defaultIcon: "FaCircleExclamation",
    assertive: true,
  },
  info: {
    surfaceClass: "text-bg-info",
    closeBtnClass: "btn-close",
    progressBg: "rgba(0, 0, 0, 0.28)",
    actionBtnClass: "btn-outline-dark",
    defaultIcon: "FaCircleInfo",
    assertive: false,
  },
};

export default function ToastContainer() {
  const list = useSyncExternalStore(
    toasts.subscribe,
    toasts.getSnapshot,
    toasts.getServerSnapshot,
  );

  if (list.length === 0) return null;

  return (
    <div className="toast-container-custom" aria-label="Oznámení">
      {list.map((toast) => {
        const theme = TOAST_THEME[toast.type];
        const iconName = toast.icon || theme.defaultIcon;

        return (
          <div
            key={toast.id}
            role={theme.assertive ? "alert" : "status"}
            aria-live={theme.assertive ? "assertive" : "polite"}
            aria-atomic="true"
            className={`toast show shadow-lg border-0 position-relative overflow-hidden toast-item ${theme.surfaceClass} ${
              toast.isExiting ? "toast-item--out" : "toast-item--in"
            }`}
            onMouseEnter={() => toasts.pause(toast.id)}
            onMouseLeave={() => toasts.resume(toast.id)}
            onFocus={() => toasts.pause(toast.id)}
            onBlur={() => toasts.resume(toast.id)}
          >
            <div className="d-flex align-items-start gap-2 p-3">
              <span className="flex-shrink-0 d-inline-flex align-items-center pt-1">
                <IconByName name={iconName} size={18} />
              </span>

              <div className="flex-grow-1 min-w-0">
                {(toast.title || toast.count > 1) && (
                  <div className="d-flex align-items-center gap-2 fw-bold mb-1">
                    {toast.title && <span>{toast.title}</span>}
                    {toast.count > 1 && (
                      <span className="badge bg-dark bg-opacity-25">×{toast.count}</span>
                    )}
                  </div>
                )}

                <div className="toast-message-text small">{toast.message}</div>

                {toast.action && (
                  <div className="mt-2">
                    <button
                      type="button"
                      className={`btn btn-sm ${theme.actionBtnClass}`}
                      onClick={() => {
                        toast.action?.onClick();
                        toasts.remove(toast.id);
                      }}
                    >
                      {toast.action.label}
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                className={`${theme.closeBtnClass} flex-shrink-0 ms-1`}
                aria-label="Zavřít oznámení"
                onClick={() => toasts.remove(toast.id)}
              />
            </div>

            {toast.durationMs > 0 && (
              <div
                key={toast.resetKey}
                className="toast-progress"
                style={{
                  backgroundColor: theme.progressBg,
                  animationDuration: `${toast.durationMs}ms`,
                  animationPlayState: toast.isPaused ? "paused" : "running",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
