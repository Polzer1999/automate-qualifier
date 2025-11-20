import { User, Sparkles } from "lucide-react";
import { ParritGlyph } from "./ParritGlyph";
import { Badge } from "@/components/ui/badge";
import ReactMarkdown from "react-markdown";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
      className={`flex gap-4 mb-6 ${
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
          <TooltipProvider>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild>
                <div className="inline-flex items-center gap-1.5 mb-2 px-2 py-1 rounded-md bg-primary/5 border border-primary/10 cursor-help hover:bg-primary/10 transition-colors">
                  <Sparkles className="w-3 h-3 text-primary/70" />
                  <span className="text-[10px] text-muted-foreground/80 font-medium tracking-wide uppercase">
                    {referenceCalls.length} référence{referenceCalls.length > 1 ? 's' : ''}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="start" className="max-w-xs">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium mb-2">Appels similaires utilisés :</p>
                  <div className="flex flex-wrap gap-1">
                    {referenceCalls.map((call, idx) => (
                      <Badge key={idx} variant="secondary" className="text-[10px] font-normal">
                        {call.entreprise} · {call.secteur}
                      </Badge>
                    ))}
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <div className="prose prose-sm max-w-none prose-p:my-2 prose-headings:my-2 prose-ul:my-2 prose-li:my-0 dark:prose-invert">
          {isAssistant ? (
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {children}
                  </a>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          ) : (
            <p className="whitespace-pre-wrap">{content}</p>
          )}
          {isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse" />}
        </div>
      </div>
      {!isAssistant && (
        <div className="flex-shrink-0 w-8 h-8 mt-1 rounded-full bg-muted flex items-center justify-center">
          <User className="w-4 h-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
};