/**
 * Главная страница лендинга (/).
 * Собирает маркетинговые секции по порядку — от героя до финального CTA.
 */

import { HeroSection } from "@/components/landing/HeroSection";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { SolutionSection } from "@/components/landing/SolutionSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { WorkflowSection } from "@/components/landing/WorkflowSection";
import { SocialproofSection } from "@/components/landing/SocialproofSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { CTASection } from "@/components/landing/CTASection";

// Секции лендинга в порядке прокрутки.
export default function LandingPage() {
  return (
    <>
      <HeroSection />
      <ProblemSection />
      <SolutionSection />
      <FeaturesSection />
      <WorkflowSection />
      <SocialproofSection />
      <PricingSection />
      <CTASection />
    </>
  );
}
