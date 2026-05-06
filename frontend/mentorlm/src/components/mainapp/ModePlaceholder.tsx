type Props = {
  title: string;
  description: string;
  tag: string;
};

export function ModePlaceholder({ title, description, tag }: Props) {
  return (
    <div className="flex h-[calc(100vh-6rem)] items-center justify-center px-6">
      <div className="glass-strong mx-auto flex max-w-md flex-col items-center rounded-3xl px-8 py-10 text-center">
        <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--brand-primary)]">
          {tag}
        </span>
        <h1 className="text-display mt-3 text-2xl font-semibold text-ink">
          {title}
        </h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-ink-soft">
          {description}
        </p>
      </div>
    </div>
  );
}
