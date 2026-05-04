import { GlassCard } from "@/components/ui/GlassCard";
import { Marquee } from "@/components/ui/Marquee";
import { Reveal } from "@/components/ui/Reveal";
import { socialproof } from "@/lib/landing-contents";

export function SocialproofSection() {
  return (
    <section id="faq" className="relative py-28 sm:py-36">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-end">
          <Reveal>
            <p className="text-eyebrow">{socialproof.eyebrow}</p>
            <h2 className="text-display mt-4 text-[clamp(2rem,4.6vw,3.6rem)] font-semibold text-ink">
              Создано для тех, кто учится{" "}
              <span className="font-editorial text-gradient">всерьёз</span>.
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              {socialproof.description}
            </p>
          </Reveal>

          <dl className="grid grid-cols-3 gap-3">
            {socialproof.stats.map((s, i) => (
              <Reveal key={s.label} delay={0.1 * (i + 1)}>
                <GlassCard className="flex h-full flex-col items-start p-5">
                  <dt className="text-eyebrow">{s.label}</dt>
                  <dd className="text-display mt-3 text-4xl font-semibold text-ink">
                    {s.value}
                  </dd>
                </GlassCard>
              </Reveal>
            ))}
          </dl>
        </div>

        <Reveal delay={0.2} className="mt-16">
          <Marquee>
            {socialproof.logos.map((logo) => (
              <span
                key={logo}
                className="font-mono text-sm uppercase tracking-[0.22em] text-muted"
              >
                {logo}
              </span>
            ))}
          </Marquee>
        </Reveal>
      </div>
    </section>
  );
}
