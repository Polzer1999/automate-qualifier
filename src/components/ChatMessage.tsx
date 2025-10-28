import { User } from "lucide-react";
import { ParritGlyph } from "./ParritGlyph";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

export const ChatMessage = ({ role, content, isStreaming }: ChatMessageProps) => {
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