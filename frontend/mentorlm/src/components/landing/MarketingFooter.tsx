import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { brand, footer } from "@/lib/landing-contents";

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative mt-32 border-t border-line">
      <div className="aurora opacity-50" aria-hidden />
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-muted">
            {footer.description}
          </p>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            built for learners · early access
          </p>
        </div>

        {footer.columns.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h4 className="text-eyebrow">{col.title}</h4>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="group inline-flex items-center gap-1.5 text-sm text-ink-soft transition-colors hover:text-ink"
                  >
                    <span className="h-px w-0 bg-current transition-all duration-300 group-hover:w-3" />
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 px-6 py-6 text-xs text-muted md:flex-row md:items-center">
          <p>
            © {year} {brand.name}. Все права защищены.
          </p>
          <p className="font-mono uppercase tracking-widest">
            quiet intelligence · {year}
          </p>
        </div>
      </div>
    </footer>
  );
}
