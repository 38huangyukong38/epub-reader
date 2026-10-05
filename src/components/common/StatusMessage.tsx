interface StatusMessageProps {
  tone: "error" | "info";
  children: React.ReactNode;
}

export function StatusMessage({ tone, children }: StatusMessageProps) {
  return <p className={`status-message status-message--${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</p>;
}
