import { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface OfferCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  badge?: string;
  cta: string;
  bullets?: string[];
  steps?: string[];
  examples?: string[];
  mention?: string;
  onClick: () => void;
}

export const OfferCard = ({
  icon: Icon,
  title,
  description,
  badge,
  cta,
  bullets,
  steps,
  examples,
  mention,
  onClick,
}: OfferCardProps) => {
  return (
    <button
      onClick={onClick}
      className="group relative p-6 md:p-8 rounded-2xl bg-[#111111] border border-[#333333] text-left transition-all duration-300 hover:border-[#808000] hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(128,128,0,0.15)] backdrop-blur-sm w-full flex flex-col"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="p-3 rounded-xl bg-[#1a1a1a] text-[#9ACD32] group-hover:bg-[#808000]/10 transition-colors">
          <Icon className="w-6 h-6" />
        </div>
        {badge && (
          <Badge className="bg-[#9ACD32]/20 text-[#9ACD32] border-[#9ACD32]/30 hover:bg-[#9ACD32]/30">
            {badge}
          </Badge>
        )}
      </div>
      
      <h3 className="text-xl font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground mb-4">{description}</p>
      
      {/* Bullets list */}
      {bullets && bullets.length > 0 && (
        <ul className="text-sm text-muted-foreground mb-4 space-y-1">
          {bullets.map((bullet, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className="text-[#9ACD32] mt-1">•</span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}
      
      {/* Numbered steps */}
      {steps && steps.length > 0 && (
        <ol className="text-sm text-muted-foreground mb-4 space-y-1">
          {steps.map((step, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className="text-[#9ACD32] font-semibold">{index + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}
      
      {/* Examples in italic */}
      {examples && examples.length > 0 && (
        <ul className="text-sm text-muted-foreground/80 mb-4 space-y-1 italic">
          {examples.map((example, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className="text-[#9ACD32] not-italic mt-1">•</span>
              <span>{example}</span>
            </li>
          ))}
        </ul>
      )}
      
      {/* Mention */}
      {mention && (
        <p className="text-sm text-[#9ACD32]/80 mb-4">{mention}</p>
      )}
      
      <div className="mt-auto">
        <span className="inline-flex items-center text-[#9ACD32] font-medium group-hover:underline">
          {cta}
          <svg
            className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </div>
    </button>
  );
};
