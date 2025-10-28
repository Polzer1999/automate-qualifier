import { Button } from "@/components/ui/button";
import { Zap, Sparkles, Users } from "lucide-react";

interface QuickRepliesProps {
  onSelect: (message: string) => void;
  isVisible: boolean;
}

const quickReplies = [
  {
    icon: Zap,
    label: "Montrez-moi comment facturer plus vite",
    message: "Je veux automatiser ma facturation pour gagner du temps et me concentrer sur mon cœur de métier.",
    color: "text-amber-500",
  },
  {
    icon: Sparkles,
    label: "Je veux retrouver du temps pour ma stratégie",
    message: "J'aimerais automatiser mes tâches administratives pour me concentrer sur la stratégie et le développement de mon entreprise.",
    color: "text-emerald-500",
  },
  {
    icon: Users,
    label: "J'ai besoin d'automatiser mon RH/Onboarding",
    message: "Je souhaite automatiser le processus d'onboarding et la gestion RH pour économiser du temps et améliorer l'expérience employé.",
    color: "text-blue-500",
  },
];

export const QuickReplies = ({ onSelect, isVisible }: QuickRepliesProps) => {
  if (!isVisible) return null;

  return (
    <div className="px-6 pb-5 animate-fade-in">
      <p className="text-xs text-muted-foreground mb-3 font-medium flex items-center gap-1.5">
        <span className="text-base">👉</span> Quelques pistes pour démarrer :
      </p>
      <div className="space-y-2">
        {quickReplies.map((reply, index) => {
          const Icon = reply.icon;
          return (
            <Button
              key={index}
              variant="outline"
              className="w-full h-auto py-3.5 px-4 justify-start text-left hover:bg-primary/5 hover:border-primary/50 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] group hover:shadow-md"
              onClick={() => onSelect(reply.message)}
            >
              <Icon className={`w-4 h-4 mr-3 flex-shrink-0 ${reply.color} group-hover:scale-110 transition-transform`} />
              <span className="text-sm font-medium leading-relaxed">{reply.label}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
};
