export function Container({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`mx-auto w-full max-w-[var(--container-max)] px-[var(--gutter)] ${className}`}
    >
      {children}
    </div>
  );
}
