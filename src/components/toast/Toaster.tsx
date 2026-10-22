"use client";

import { Toaster as Sonner, toast } from "sonner";
import { Toast, type ToastProps } from "./Toast";

// Sonner only queues and places the toasts; each one is drawn by our Toast (guide §7, §14).
// Bottom right, 32px from the edge (gutter) and 24px up; on phone, full width minus 16px gutters.

/** Mount once, in AppShell. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      offset={{ right: 32, bottom: 24 }}
      mobileOffset={{ left: 16, right: 16, bottom: 16 }}
      gap={8}
      toastOptions={{ unstyled: true }}
    />
  );
}

/** Shows a toast that stays until closed or retried. Returns its id. */
export function showToast({ onRetry, ...props }: Omit<ToastProps, "onClose">): string | number {
  return toast.custom(
    (id) => (
      <Toast
        {...props}
        onRetry={
          onRetry
            ? () => {
                toast.dismiss(id);
                onRetry();
              }
            : undefined
        }
        onClose={() => toast.dismiss(id)}
      />
    ),
    { duration: Infinity },
  );
}
