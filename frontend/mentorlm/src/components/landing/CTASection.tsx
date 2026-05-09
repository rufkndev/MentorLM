import { LandingChatTeaser } from "@/components/landing/LandingChatTeaser";
import { Reveal } from "@/components/ui/Reveal";
import { cta } from "@/lib/landing-contents";

export function CTASection() {
  return (
    <section className="relative px-4 py-28 sm:py-36">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div
            className="relative overflow-hidden rounded-[var(--radius-xl)] px-8 py-24 text-center sm:px-16"
            style={{
              background:
                "radial-gradient(120% 80% at 20% 0%, rgba(86,217,255,0.35) 0%, transparent 50%), radial-gradient(120% 80% at 100% 100%, rgba(123,97,255,0.55) 0%, transparent 55%), linear-gradient(180deg, #071B4D 0%, #0E1F58 100%)",
            }}
          >
            <div className="noise pointer-events-none absolute inset-0" aria-hidden />

            {/* glass orb */}
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full"
              style={{
                background:
                  "radial-gradient(closest-side, rgba(86,217,255,0.4), rgba(123,97,255,0.25) 50%, transparent 70%)",
                filter: "blur(20px)",
                animation: "drift 26s ease-in-out infinite alternate",
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-24 -left-16 h-80 w-80 rounded-full"
              style={{
                background:
                  "radial-gradient(closest-side, rgba(23,70,245,0.55), rgba(7,27,77,0) 70%)",
                filter: "blur(24px)",
                animation: "drift 30s ease-in-out -8s infinite alternate-reverse",
              }}
            />

            <h2 className="text-display relative mx-auto max-w-3xl text-[clamp(2rem,5vw,4rem)] font-semibold text-white">
              Тише. Сфокусированнее.{" "}
              <span className="font-editorial bg-gradient-to-r from-[var(--brand-focus)] via-white to-[var(--brand-blue-soft)] bg-clip-text text-transparent">
                Умнее.
              </span>
            </h2>
            <p className="relative mx-auto mt-5 max-w-xl text-lg leading-relaxed text-white/75">
              {cta.description}
            </p>

            <div className="relative mt-10">
              <LandingChatTeaser />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
