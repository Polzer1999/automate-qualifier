import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatMessage } from "./ChatMessage";
import { ChatHeader } from "./ChatHeader";

import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from "uuid";

interface Message {
  role: "user" | "assistant";
  content: string;
  referenceCalls?: Array<{
    entreprise: string;
    secteur: string;
    phase: string;
  }>;
}

export const ChatInterface = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Bonjour, je suis Parrita. Je vous aide à identifier ce qui peut être simplifié ou automatisé dans votre quotidien professionnel — même si vous partez de zéro.\n\nÉcrivez librement ce que vous souhaitez améliorer, clarifier ou fluidifier. Je m'adapte à vous.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sessionId] = useState(() => {
    // Persist sessionId in localStorage to maintain user context across page reloads
    const stored = localStorage.getItem('parrita_session_id');
    if (stored) return stored;
    const newId = uuidv4();
    localStorage.setItem('parrita_session_id', newId);
    return newId;
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [streamingMessage, setStreamingMessage] = useState("");
  

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  const sendMessage = async (message: string) => {
    if (!message.trim() || isLoading) return;

    const userMessage = message.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);
    setStreamingMessage("");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-qualification`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            conversationId,
            sessionId,
            message: userMessage,
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to get response");

      const convId = response.headers.get("X-Conversation-Id");
      if (convId && !conversationId) {
        setConversationId(convId);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader available");

      const decoder = new TextDecoder();
      let buffer = "";
      let currentMessage = "";
      let referenceCalls: any[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (let line of lines) {
          line = line.trim();
          if (!line || line.startsWith(":")) continue;
          if (!line.startsWith("data: ")) continue;

          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            
            // Check for reference calls metadata
            if (parsed.reference_calls) {
              referenceCalls = parsed.reference_calls;
              continue;
            }
            
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              currentMessage += content;
              setStreamingMessage(currentMessage);
            }
          } catch (e) {
            // Ignore parse errors for incomplete JSON
          }
        }
      }

      // Flush remaining buffer
      if (buffer.trim() && buffer.trim() !== "data: [DONE]") {
        try {
          const line = buffer.trim();
          if (line.startsWith("data: ")) {
            const parsed = JSON.parse(line.slice(6));
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              currentMessage += content;
            }
          }
        } catch (e) {
          // Ignore
        }
      }

      if (currentMessage) {
        setMessages((prev) => [...prev, { 
          role: "assistant", 
          content: currentMessage,
          referenceCalls: referenceCalls.length > 0 ? referenceCalls : undefined
        }]);
      }
      setStreamingMessage("");
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Désolé, une erreur s'est produite. Pouvez-vous réessayer ?",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMessage(input);
  };


  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col h-[680px] frosted-glass overflow-hidden"
      style={{
        borderRadius: '2.5rem',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)'
      }}
    >
      <div className="flex-1 overflow-y-auto p-10 space-y-6 scroll-smooth"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'hsl(var(--primary) / 0.3) transparent'
        }}
      >
        {messages.map((msg, idx) => (
          <div 
            key={idx}
            className={idx === 0 ? "animate-fade-in" : ""}
            style={idx === 0 ? { animationDelay: '300ms', animationDuration: '800ms' } : {}}
          >
            <ChatMessage 
              role={msg.role} 
              content={msg.content}
              referenceCalls={msg.referenceCalls}
            />
          </div>
        ))}
        {streamingMessage && (
          <ChatMessage role="assistant" content={streamingMessage} isStreaming />
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="p-6 border-t border-white/5"
        style={{ backdropFilter: 'blur(10px)' }}
      >
        <div className="flex gap-3 items-center">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Décrivez ce que vous souhaitez simplifier, améliorer ou automatiser…"
            disabled={isLoading}
            className="flex-1 rounded-full border-white/10 focus:ring-primary text-base py-6 px-6 bg-black/20 shadow-sm placeholder:text-primary placeholder:font-light focus:placeholder:text-primary/60 transition-all"
          />
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            size="icon"
            className="rounded-full w-12 h-12 flex-shrink-0 bg-primary hover:bg-primary/90 text-background hover:scale-110 active:scale-95 transition-all duration-200 shadow-lg hover:shadow-primary/20 disabled:opacity-30 disabled:hover:scale-100"
          >
            <span className="text-xl font-light">→</span>
          </Button>
        </div>
      </form>
    </div>
  );
};