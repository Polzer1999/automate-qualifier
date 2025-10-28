import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatMessage } from "./ChatMessage";
import { ChatHeader } from "./ChatHeader";
import { QuickReplies } from "./QuickReplies";
import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from "uuid";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export const ChatInterface = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "👋 Hey ! Je suis Parrit, votre copilote IA pour l'efficacité.\n\nDites adieu aux tâches ennuyeuses ! Mon seul objectif est de transformer vos corvées administratives et back-office en temps libre pour vous.\n\nPrêt(e) à décoller ? Décrivez simplement, ci-dessous, la tâche la plus lourde de votre semaine. Je m'occupe du plan de vol ! 🚀",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sessionId] = useState(() => uuidv4());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [streamingMessage, setStreamingMessage] = useState("");
  const [showQuickReplies, setShowQuickReplies] = useState(true);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  const sendMessage = async (message: string) => {
    if (!message.trim() || isLoading) return;

    setShowQuickReplies(false);
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
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
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
        setMessages((prev) => [...prev, { role: "assistant", content: currentMessage }]);
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

  const handleQuickReply = async (message: string) => {
    setInput(message);
    await sendMessage(message);
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col h-[650px] bg-card rounded-3xl shadow-medium overflow-hidden border border-border">
      <ChatHeader />
      <div className="flex-1 overflow-y-auto p-8 space-y-4 scroll-smooth"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'hsl(var(--primary) / 0.3) transparent'
        }}
      >
        {messages.map((msg, idx) => (
          <ChatMessage key={idx} role={msg.role} content={msg.content} />
        ))}
        {streamingMessage && (
          <ChatMessage role="assistant" content={streamingMessage} isStreaming />
        )}
        <div ref={messagesEndRef} />
      </div>

      <QuickReplies onSelect={handleQuickReply} isVisible={showQuickReplies} />

      <form onSubmit={handleSubmit} className="p-5 border-t border-border bg-background/80"
        style={{ backdropFilter: 'blur(10px)' }}
      >
        <div className="flex gap-3 items-center">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Écrivez ici la tâche que vous voulez automatiser..."
            disabled={isLoading}
            className="flex-1 rounded-full border-border focus:ring-primary text-base py-6 px-5 bg-background shadow-sm placeholder:text-muted-foreground/60"
          />
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            size="icon"
            className="rounded-full w-12 h-12 flex-shrink-0 hover:scale-110 active:scale-95 transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:hover:scale-100"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </form>
    </div>
  );
};