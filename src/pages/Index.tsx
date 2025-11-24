import { ChatInterface } from "@/components/ChatInterface";

const Index = () => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-2 md:p-4">
      <div className="w-full max-w-5xl animate-fade-in">
        <ChatInterface />
      </div>
    </div>
  );
};

export default Index;