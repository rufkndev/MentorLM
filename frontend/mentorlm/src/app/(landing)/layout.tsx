import { MarketingNavbar } from "@/components/landing/MarketingNavbar";
import { MarketingFooter } from "@/components/landing/MarketingFooter";

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen text-ink">
      <MarketingNavbar />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}
