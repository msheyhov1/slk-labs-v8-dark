// Моно-лейбл «слой прибора» (v7). Тоны по поверхности:
// muted — серый на светлом; signal — зелёный на тёмном (только как свет);
// signal-ink — читаемый зелёный на светлом; fg — приглушённый на тёмном.
const tones = {
  muted: "text-ink-2",
  signal: "text-signal",
  "signal-ink": "text-signal-ink",
  fg: "text-[var(--color-ink-fg-3)]",
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
      className={`font-mono text-label uppercase tracking-label ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
