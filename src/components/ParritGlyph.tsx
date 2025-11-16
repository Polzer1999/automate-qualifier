interface ParritGlyphProps {
  isThinking?: boolean;
  className?: string;
}

export const ParritGlyph = ({ isThinking = false, className = "" }: ParritGlyphProps) => {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={isThinking ? "animate-[pulse-toxophile_2s_ease-in-out_infinite]" : ""}
      >
        {/* Le Glyphe Feuille-Fuselage : fusion organique/aérodynamique */}
        <path
          d="M 4 16 C 4 16, 8 8, 16 8 C 24 8, 28 12, 28 16 C 28 20, 24 24, 16 24 C 12 24, 8 22, 6 20 L 16 16 L 10 12 Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          className="text-foreground"
        />
        {/* Nervure centrale (comme une feuille) */}
        <path
          d="M 16 8 L 16 24"
          stroke="currentColor"
          strokeWidth="0.8"
          strokeLinecap="round"
          className="text-foreground/60"
        />
        {/* Nervures latérales */}
        <path
          d="M 12 12 L 16 16 M 20 12 L 16 16 M 12 20 L 16 16 M 20 20 L 16 16"
          stroke="currentColor"
          strokeWidth="0.6"
          strokeLinecap="round"
          className="text-foreground/40"
        />
      </svg>
      
      <span className="text-sm font-light tracking-wide text-foreground/80">
        parrit.ai
      </span>
    </div>
  );
};
