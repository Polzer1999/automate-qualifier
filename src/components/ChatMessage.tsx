import { User, Sparkles } from "lucide-react";
import { ParritGlyph } from "./ParritGlyph";
import { Badge } from "@/components/ui/badge";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  referenceCalls?: Array<{
    entreprise: string;
    secteur: string;
    phase: string;
  }>;
}

export const ChatMessage = ({ role, content, isStreaming, referenceCalls }: ChatMessageProps) => {
  const isAssistant = role === "assistant";

  return (
    <div
      className={`flex gap-4 mb-6 animate-fade-in ${
        isAssistant ? "justify-start" : "justify-end"
      }`}
    >
      {isAssistant && (
        <ParritGlyph isThinking={isStreaming} className="flex-shrink-0 mt-1" />
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-6 py-4 text-sm leading-relaxed ${
          isAssistant
            ? "bg-transparent text-foreground font-light"
            : "bg-primary/10 text-foreground ml-auto border border-primary/20"
        }`}
      >
        {isAssistant && referenceCalls && referenceCalls.length > 0 && (
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border/30">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">
              Mode Paul activé - {referenceCalls.length} appel{referenceCalls.length > 1 ? 's' : ''} similaire{referenceCalls.length > 1 ? 's' : ''} utilisé{referenceCalls.length > 1 ? 's' : ''}
            </span>
            <div className="flex gap-1 flex-wrap">
              {referenceCalls.map((call, idx) => (
                <Badge key={idx} variant="outline" className="text-xs bg-primary/5 border-primary/20">
                  {call.entreprise} ({call.secteur})
                </Badge>
              ))}
            </div>
          </div>
        )}
        <p className="whitespace-pre-wrap">
          {content}
          {isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />}
        </p>
      </div>
      {!isAssistant && (
        <div className="flex-shrink-0 w-8 h-8 mt-1 rounded-full bg-muted flex items-center justify-center">
          <User className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
};