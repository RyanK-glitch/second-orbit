"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Native <dialog> modal: focus trapping, Escape and backdrop handled by the browser. */
export function Dialog({ open, onClose, labelledBy, children }: { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" aria-labelledby={labelledBy} onClose={onClose}>
      {open && children}
    </dialog>
  );
}
