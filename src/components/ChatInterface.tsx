import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatMessage } from "./ChatMessage";
import { Mic, MicOff, ImagePlus, Send, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from "uuid";
import { useToast } from "@/hooks/use-toast";

interface Message {
  role: "user" | "assistant";
  content: string;
  images?: string[]; // Base64 images
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
    const stored = localStorage.getItem('parrita_session_id');
    if (stored) return stored;
    const newId = uuidv4();
    localStorage.setItem('parrita_session_id', newId);
    return newId;
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [streamingMessage, setStreamingMessage] = useState("");
  const { toast } = useToast();

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number | null>(null);
  const mimeTypeRef = useRef<string>('audio/webm');

  // Image upload state
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  // ============ VOICE RECORDING ============
  const getSupportedMimeType = () => {
    const types = ['audio/webm', 'audio/mp4', 'audio/ogg'];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return 'audio/webm';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedMimeType();
      mimeTypeRef.current = mimeType;

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recordingStartTimeRef.current = Date.now();

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        await transcribeAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        title: "Erreur microphone",
        description: "Impossible d'accéder au microphone. Vérifiez les permissions.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.requestData();
      }

      setTimeout(() => {
        if (mediaRecorderRef.current) {
          mediaRecorderRef.current.stop();
        }
      }, 100);

      setIsRecording(false);
      recordingStartTimeRef.current = null;
    }
  };

  // Toggle recording on click (clic simple)
  const handleVoiceClick = () => {
    if (isLoading || isTranscribing) return;

    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);

      const base64Audio = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const base64 = reader.result as string;
          const base64Data = base64.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
      });

      const { data, error } = await supabase.functions.invoke('voice-to-text', {
        body: { audio: base64Audio, mimeType: mimeTypeRef.current }
      });

      if (error) throw error;

      if (data?.text) {
        setInput(prev => prev ? `${prev} ${data.text}` : data.text);
      } else {
        throw new Error('No transcription received');
      }
    } catch (error) {
      console.error('Transcription error:', error);
      toast({
        title: "Erreur de transcription",
        description: "Impossible de transcrire l'audio. Réessayez.",
        variant: "destructive",
      });
    } finally {
      setIsTranscribing(false);
    }
  };


  // ============ IMAGE UPLOAD ============
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Format non supporté",
          description: "Seules les images sont acceptées.",
          variant: "destructive",
        });
        return;
      }

      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({
          title: "Fichier trop volumineux",
          description: "La taille maximum est de 10 Mo.",
          variant: "destructive",
        });
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setPendingImages(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });

    // Reset input for re-selection
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [toast]);

  const removeImage = (index: number) => {
    setPendingImages(prev => prev.filter((_, i) => i !== index));
  };

  const triggerImageUpload = () => {
    fileInputRef.current?.click();
  };

  // ============ SEND MESSAGE ============
  const sendMessage = async (message: string, images?: string[]) => {
    if ((!message.trim() && (!images || images.length === 0)) || isLoading) return;

    const userMessage = message.trim();

    // Detect booking intent
    const bookingPatterns = [
      /prend(re|s)?\s*(un\s*)?(rendez[-\s]vous|rdv)/i,
      /r[eé]serv(er|e)/i,
      /booking/i,
      /(je\s*)?(veux|souhaite|voudrais|aimerais)\s*.*(rendez[-\s]vous|rdv|meeting|r[eé]union|cr[eé]neau)/i,
      /planifi(er|e)\s*(un\s*)?(rendez[-\s]vous|rdv|meeting|r[eé]union)/i,
      /organis(er|e)\s*(un\s*)?(rendez[-\s]vous|rdv|meeting|r[eé]union)/i,
      /fix(er|e)\s*(un\s*)?(rendez[-\s]vous|rdv|meeting|cr[eé]neau)/i,
      /^(option\s*)?1$/i
    ];

    const wantsBooking = bookingPatterns.some(pattern => pattern.test(userMessage));
    if (wantsBooking) {
      window.open('https://calendar.app.google/zpx5eazp9NmsvfD46', '_blank');
    }

    setInput("");
    setPendingImages([]);
    setMessages((prev) => [...prev, {
      role: "user",
      content: userMessage,
      images: images
    }]);
    setIsLoading(true);
    setStreamingMessage("");

    try {
      // Build message content with images
      let messageContent = userMessage;
      if (images && images.length > 0) {
        messageContent = `${userMessage}\n\n[L'utilisateur a joint ${images.length} image(s) à analyser]`;
      }

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
            message: messageContent,
            images: images, // Pass images to backend for vision processing
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
            // Ignore parse errors
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
    await sendMessage(input, pendingImages.length > 0 ? pendingImages : undefined);
  };

  const canSend = (input.trim() || pendingImages.length > 0) && !isLoading;

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col h-[90vh] md:h-[680px] frosted-glass overflow-hidden"
      style={{
        borderRadius: '1.5rem',
        boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)'
      }}
    >
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-10 space-y-4 md:space-y-6 scroll-smooth"
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
              images={msg.images}
              referenceCalls={msg.referenceCalls}
            />
          </div>
        ))}
        {streamingMessage && (
          <ChatMessage role="assistant" content={streamingMessage} isStreaming />
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Image Preview Area */}
      {pendingImages.length > 0 && (
        <div className="px-3 md:px-6 py-2 border-t border-white/5 flex gap-2 overflow-x-auto">
          {pendingImages.map((img, idx) => (
            <div key={idx} className="relative flex-shrink-0 group">
              <img
                src={img}
                alt={`Preview ${idx + 1}`}
                className="w-16 h-16 md:w-20 md:h-20 object-cover rounded-lg border border-white/10"
              />
              <button
                onClick={() => removeImage(idx)}
                className="absolute -top-2 -right-2 w-5 h-5 bg-destructive rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="p-3 md:p-6 border-t border-white/5"
        style={{ backdropFilter: 'blur(10px)' }}
      >
        <div className="flex gap-2 md:gap-3 items-center">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageSelect}
            className="hidden"
          />

          {/* Image upload button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={triggerImageUpload}
            disabled={isLoading}
            className="rounded-full w-10 h-10 md:w-11 md:h-11 flex-shrink-0 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
            title="Ajouter une image"
          >
            <ImagePlus className="w-5 h-5" />
          </Button>

          {/* Voice recording button - clic simple */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={isLoading || isTranscribing}
            onClick={handleVoiceClick}
            className={`rounded-full w-10 h-10 md:w-11 md:h-11 flex-shrink-0 transition-all ${
              isRecording
                ? 'bg-destructive text-destructive-foreground animate-pulse scale-110'
                : isTranscribing
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            }`}
            title={isRecording ? "Cliquez pour arrêter" : "Cliquez pour parler"}
          >
            {isTranscribing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isRecording ? (
              <MicOff className="w-5 h-5" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </Button>

          {/* Text input */}
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Décrivez ce que vous souhaitez simplifier…"
            disabled={isLoading}
            className="flex-1 rounded-full border-white/10 focus:ring-primary text-sm md:text-base py-3 px-4 md:py-6 md:px-6 bg-black/20 shadow-sm placeholder:text-muted-foreground placeholder:font-light focus:placeholder:text-muted-foreground/60 transition-all"
          />

          {/* Send button */}
          <Button
            type="submit"
            disabled={!canSend}
            size="icon"
            className="rounded-full w-10 h-10 md:w-12 md:h-12 flex-shrink-0 bg-primary hover:bg-primary/90 text-background hover:scale-110 active:scale-95 transition-all duration-200 shadow-lg hover:shadow-primary/20 disabled:opacity-30 disabled:hover:scale-100"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>

        {/* Recording indicator */}
        {isRecording && (
          <div className="mt-2 flex items-center justify-center gap-2 text-xs text-destructive animate-pulse">
            <span className="w-2 h-2 bg-destructive rounded-full" />
            Enregistrement en cours...
          </div>
        )}
      </form>
    </div>
  );
};
