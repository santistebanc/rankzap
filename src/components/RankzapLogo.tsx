import { Zap } from "lucide-react";

/** Brand lockup: icon mark + “rankzap” wordmark. */
export function RankzapLogo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`} role="img" aria-label="Rankzap">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent shadow-card">
        <Zap className="size-[22px]" strokeWidth={2.25} aria-hidden />
      </span>
      <span className="select-none text-2xl font-bold tracking-tight lowercase leading-none text-text sm:text-[1.75rem]">
        rank<span className="text-accent">zap</span>
      </span>
    </div>
  );
}
