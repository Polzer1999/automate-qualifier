import { useState } from "react";
import { Bot, Rocket, Puzzle, GraduationCap } from "lucide-react";
import { OfferCard } from "./OfferCard";
import { ContactModal, OfferType } from "./ContactModal";

interface Offer {
  id: OfferType;
  icon: typeof Bot;
  title: string;
  description: string;
  badge?: string;
  cta: string;
  bullets?: string[];
  steps?: string[];
  examples?: string[];
  mention?: string;
}

const offers: Offer[] = [
  {
    id: "sap",
    icon: Bot,
    title: "Chatbot SAP",
    description: "Assistant IA pour utilisateurs et consultants SAP",
    badge: "Accès Bêta",
    cta: "Demander l'accès",
    bullets: [
      "Déploiement on-premise ou test cloud disponible",
      "Architecture, transactions, support fonctionnel",
    ],
  },
  {
    id: "growth",
    icon: Rocket,
    title: "Prospection Signaux d'Intention",
    description: "Remplissez votre pipeline de RDV qualifiés",
    badge: "5K€",
    cta: "Découvrir",
    steps: [
      "Sélectionnez vos sources de données",
      "Décrivez votre ICP",
      "Recevez des leads chauds dans votre pipeline",
    ],
    mention: "Coaching acquisition inclus",
  },
  {
    id: "custom",
    icon: Puzzle,
    title: "Projets Agentiques",
    description: "IA & Automatisation sur-mesure, pilotés de A à Z",
    cta: "Prendre RDV",
    examples: [
      "Remplissage auto de catalogue (maison de ventes aux enchères)",
      "Automatisation ouverture de franchises (bail, juridique, process)",
    ],
  },
  {
    id: "formation",
    icon: GraduationCap,
    title: "Formation & Prise de parole",
    description: "Éveillez les consciences, actionnez le change management",
    cta: "En savoir plus",
    bullets: [
      "Formation : déployer agents & automatisations par métier",
      "Masterclass : de l'IA générative à l'agentique",
      "Accompagnement change management",
    ],
  },
];

export const OffersGrid = () => {
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleCardClick = (offer: Offer) => {
    setSelectedOffer(offer);
    setIsModalOpen(true);
  };

  return (
    <>
      <section className="px-4 pb-16 md:pb-24">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {offers.map((offer) => (
            <OfferCard
              key={offer.id}
              icon={offer.icon}
              title={offer.title}
              description={offer.description}
              badge={offer.badge}
              cta={offer.cta}
              bullets={offer.bullets}
              steps={offer.steps}
              examples={offer.examples}
              mention={offer.mention}
              onClick={() => handleCardClick(offer)}
            />
          ))}
        </div>
      </section>

      <ContactModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        offerType={selectedOffer?.id ?? null}
        offerTitle={selectedOffer?.title ?? ""}
      />
    </>
  );
};
