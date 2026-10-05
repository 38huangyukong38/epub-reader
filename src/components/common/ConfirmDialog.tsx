import { useEffect } from "react";

interface ConfirmDialogProps {
  title: string;
  message: string;
  onCancel(): void;
  onConfirm(): void;
}

export function ConfirmDialog({ title, message, onCancel, onConfirm }: ConfirmDialogProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return <div className="confirm-dialog__backdrop" role="presentation">
    <section className="confirm-dialog" role="dialog" aria-modal="true" aria-label={title}>
      <h2>{title}</h2>
      <p>{message}</p>
      <div className="confirm-dialog__actions">
        <button type="button" onClick={onCancel}>取消</button>
        <button type="button" onClick={onConfirm}>跳转</button>
      </div>
    </section>
  </div>;
}
