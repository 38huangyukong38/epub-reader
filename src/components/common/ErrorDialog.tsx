import { useEffect } from "react";

interface ErrorDialogProps {
  title: string;
  message: string;
  onClose(): void;
}

export function ErrorDialog({ title, message, onClose }: ErrorDialogProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return <div className="confirm-dialog__backdrop" role="presentation">
    <section className="confirm-dialog" role="dialog" aria-modal="true" aria-label={title}>
      <h2>{title}</h2>
      <p>{message}</p>
      <div className="confirm-dialog__actions">
        <button type="button" onClick={onClose}>关闭</button>
      </div>
    </section>
  </div>;
}
