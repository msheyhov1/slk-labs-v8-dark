// Ярлык-лейбл (Dala). Маленький капс над телом — сигнальный янтарь (saffron);
// приглушённые — ash. Все тоны читаемы на чёрном void.
// muted — ash; signal / signal-ink — saffron-эмфаза; fg — ash.
const tones = {
  muted: "text-[var(--color-ash)]",
  signal: "text-[var(--color-saffron)]",
  "signal-ink": "text-[var(--color-saffron)]",
  fg: "text-[var(--color-ash)]",
} as const;

export function MonoLabel({
  children,
  tone = "muted",
  className = "",
}: {
  children: React.ReactNode;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <span
      className={`text-label font-semibold uppercase tracking-label ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
