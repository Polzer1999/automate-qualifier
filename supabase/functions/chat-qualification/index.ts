import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX_REQUESTS = 20;

async function checkRateLimit(supabase: any, sessionId: string): Promise<{ allowed: boolean; remainingRequests: number }> {
  try {
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
    
    // Get or create rate limit record
    const { data: existingLimit } = await supabase
      .from('rate_limits')
      .select('*')
      .eq('session_id', sessionId)
      .single();
    
    if (!existingLimit) {
      // First request from this session
      await supabase
        .from('rate_limits')
        .insert({ session_id: sessionId, request_count: 1, window_start: new Date() });
      return { allowed: true, remainingRequests: RATE_LIMIT_MAX_REQUESTS - 1 };
    }
    
    const limitWindowStart = new Date(existingLimit.window_start);
    
    // Check if we're still in the same window
    if (limitWindowStart > windowStart) {
      // Same window - check count
      if (existingLimit.request_count >= RATE_LIMIT_MAX_REQUESTS) {
        return { allowed: false, remainingRequests: 0 };
      }
      
      // Increment count
      await supabase
        .from('rate_limits')
        .update({ request_count: existingLimit.request_count + 1 })
        .eq('session_id', sessionId);
      
      return { allowed: true, remainingRequests: RATE_LIMIT_MAX_REQUESTS - existingLimit.request_count - 1 };
    } else {
      // New window - reset count
      await supabase
        .from('rate_limits')
        .update({ request_count: 1, window_start: new Date() })
        .eq('session_id', sessionId);
      
      return { allowed: true, remainingRequests: RATE_LIMIT_MAX_REQUESTS - 1 };
    }
  } catch (error) {
    console.error('Rate limit check error:', error);
    // On error, allow the request but log it
    return { allowed: true, remainingRequests: RATE_LIMIT_MAX_REQUESTS };
  }
}

// Helper function to extract secteur/besoin from conversation
function extractContextFromMessages(messages: any[]): { secteur: string[]; besoin: string[]; role: string[] } {
  const allText = messages.map(m => m.content).join(' ').toLowerCase();
  
  // Enhanced secteur keywords with company size indicators
  const secteurKeywords = {
    'énergie': ['énergie', 'renouvelable', 'solaire', 'éolien', 'électricité', 'utilities'],
    'retail': ['retail', 'commerce', 'vente', 'magasin', 'e-commerce', 'boutique', 'distribution'],
    'finance': ['finance', 'banque', 'assurance', 'fintech', 'crédit', 'investissement'],
    'santé': ['santé', 'médical', 'hôpital', 'pharma', 'clinique', 'cabinet'],
    'tech': ['tech', 'software', 'saas', 'it', 'digital', 'startup', 'scale-up'],
    'industrie': ['industrie', 'manufacture', 'production', 'usine', 'fabrication'],
    'logistique': ['logistique', 'transport', 'supply chain', 'livraison', 'entrepôt'],
    'rh': ['rh', 'ressources humaines', 'recrutement', 'formation', 'talent'],
    'consulting': ['conseil', 'consulting', 'consultance', 'cabinet de conseil'],
    'immobilier': ['immobilier', 'promotion', 'foncier', 'construction'],
    'pme': ['pme', 'tpe', 'petite entreprise'],
    'corporate': ['corporate', 'grande entreprise', 'multinational', 'groupe']
  };
  
  // Enhanced besoin keywords with intent signals
  const besoinKeywords = {
    'automatisation': ['automatisation', 'automatiser', 'automation', 'on a besoin d\'automatiser', 'automatiquement'],
    'veille': ['veille', 'scouting', 'monitoring', 'surveillance', 'tracker'],
    'qualification': ['qualification', 'qualifier', 'leads', 'prospects'],
    'reporting': ['reporting', 'rapport', 'dashboard', 'kpi', 'tableau de bord', 'suivi'],
    'data': ['data', 'données', 'database', 'analytics', 'base de données'],
    'facturation': ['facturation', 'facture', 'billing', 'invoicing'],
    'onboarding': ['onboarding', 'intégration', 'accueil', 'nouvel arrivant'],
    'workflow': ['workflow', 'processus', 'flux de travail', 'étapes'],
    'notification': ['notification', 'alerte', 'alert', 'rappel']
  };
  
  // Role detection keywords
  const roleKeywords = {
    'direction': ['ceo', 'directeur', 'dirigeant', 'président', 'dg', 'fondateur'],
    'finance': ['daf', 'cfo', 'comptable', 'contrôleur financier'],
    'ops': ['ops', 'opérations', 'responsable opérations', 'coo'],
    'rh': ['drh', 'responsable rh', 'chro', 'talent manager'],
    'it': ['cto', 'cio', 'responsable it', 'tech lead']
  };
  
  const detectedSecteurs: string[] = [];
  const detectedBesoins: string[] = [];
  const detectedRoles: string[] = [];
  
  // Detect secteurs
  for (const [secteur, keywords] of Object.entries(secteurKeywords)) {
    if (keywords.some(kw => allText.includes(kw))) {
      detectedSecteurs.push(secteur);
    }
  }
  
  // Detect besoins
  for (const [besoin, keywords] of Object.entries(besoinKeywords)) {
    if (keywords.some(kw => allText.includes(kw))) {
      detectedBesoins.push(besoin);
    }
  }
  
  // Detect roles
  for (const [role, keywords] of Object.entries(roleKeywords)) {
    if (keywords.some(kw => allText.includes(kw))) {
      detectedRoles.push(role);
    }
  }
  
  return { secteur: detectedSecteurs, besoin: detectedBesoins, role: detectedRoles };
}

// Helper function to enrich prompt with similar discovery calls
async function enrichPromptWithDiscoveryCalls(
  supabase: any, 
  messages: any[], 
  basePrompt: string
): Promise<{ prompt: string; referenceCalls: any[] }> {
  try {
    // Extract context from conversation
    const { secteur, besoin, role } = extractContextFromMessages(messages);
    
    const hasContext = secteur.length > 0 || besoin.length > 0 || role.length > 0;
    
    if (!hasContext) {
      // NO CONTEXT YET: Return 5-7 random calls with ONLY phase_1_introduction
      console.log('No context detected - using random discovery call examples (phase 1 only)');
      
      const { data: randomCalls, error } = await supabase
        .from('discovery_calls_knowledge')
        .select('entreprise, secteur, phase_1_introduction')
        .not('phase_1_introduction', 'is', null)
        .limit(7);
      
      if (error || !randomCalls || randomCalls.length === 0) {
        console.log('No random calls found or error:', error);
        return { prompt: basePrompt, referenceCalls: [] };
      }
      
      console.log(`Using ${randomCalls.length} random discovery calls for initial approach`);
      
      // Build enrichment with ONLY phase 1 examples
      let enrichment = '\n\n## EXEMPLES D\'APPROCHE INITIALE (Méthode Paul - 110 appels réels)\n\n';
      enrichment += 'Voici comment Paul commence typiquement ses appels de découverte. Inspire-toi de ces techniques pour ton premier échange :\n\n';
      
      randomCalls.forEach((call: any, idx: number) => {
        if (call.phase_1_introduction) {
          enrichment += `### Exemple ${idx + 1} - ${call.entreprise || 'Client'} (${call.secteur || 'secteur'})\n`;
          enrichment += `${call.phase_1_introduction.substring(0, 400)}...\n\n`;
        }
      });
      
      enrichment += '**INSTRUCTION:** Tu DOIS commencer par une question ouverte similaire. Ne propose PAS de solution tout de suite. Écoute d\'abord.\n';
      
      return { 
        prompt: basePrompt + enrichment,
        referenceCalls: [] // No badges at first message
      };
    }
    
    // CONTEXT DETECTED: Find 3 most similar calls with ALL phases
    console.log('Context detected - finding similar discovery calls');
    
    // Build query to find similar calls
    let query = supabase
      .from('discovery_calls_knowledge')
      .select('*')
      .limit(3);
    
    // Filter by secteur if detected
    if (secteur.length > 0) {
      const secteurConditions = secteur.map(s => `secteur.ilike.%${s}%`).join(',');
      query = query.or(secteurConditions);
    }
    
    const { data: similarCalls, error } = await query;
    
    if (error || !similarCalls || similarCalls.length === 0) {
      console.log('No similar calls found or error:', error);
      return { prompt: basePrompt, referenceCalls: [] };
    }
    
    console.log(`Found ${similarCalls.length} similar discovery calls with full phases`);
    
    // Build enrichment section with ALL phases
    let enrichment = '\n\n## MÉTHODE DE PAUL - Appels similaires détectés\n\n';
    enrichment += `**Contexte identifié:** ${secteur.join(', ')}${besoin.length > 0 ? ' | ' + besoin.join(', ') : ''}${role.length > 0 ? ' | Rôle: ' + role.join(', ') : ''}\n\n`;
    
    similarCalls.forEach((call: any, idx: number) => {
      enrichment += `### Appel ${idx + 1}: ${call.entreprise || 'Client'}\n`;
      enrichment += `**Secteur:** ${call.secteur || 'Non spécifié'} | **Besoin:** ${call.besoin?.substring(0, 100) || 'Non spécifié'}...\n\n`;
      
      if (call.phase_1_introduction) {
        enrichment += `**Phase 1 - Introduction:**\n${call.phase_1_introduction.substring(0, 350)}...\n\n`;
      }
      
      if (call.phase_2_exploration) {
        enrichment += `**Phase 2 - Exploration:**\n${call.phase_2_exploration.substring(0, 350)}...\n\n`;
      }
      
      if (call.phase_3_affinage) {
        enrichment += `**Phase 3 - Affinage:**\n${call.phase_3_affinage.substring(0, 350)}...\n\n`;
      }
      
      if (call.phase_4_next_steps) {
        enrichment += `**Phase 4 - Next Steps:**\n${call.phase_4_next_steps.substring(0, 200)}...\n\n`;
      }
      
      enrichment += '---\n\n';
    });
    
    enrichment += '**INSTRUCTION CLEF:** Utilise la progression de Paul (phases 1→2→3→4). Adapte tes questions au secteur et au besoin détecté. Pose UNE question à la fois.\n';
    
    // Extract reference calls metadata for transparency
    const referenceCalls = similarCalls.map((call: any) => ({
      entreprise: call.entreprise || 'Client',
      secteur: call.secteur || 'Non spécifié',
      phase: 'toutes phases'
    }));
    
    return { 
      prompt: basePrompt + enrichment,
      referenceCalls
    };
    
  } catch (error) {
    console.error('Error enriching prompt:', error);
    return { prompt: basePrompt, referenceCalls: [] };
  }
}

const QUALIFICATION_SYSTEM_PROMPT = `Tu es Parrita, l'assistante conversationnelle personnelle de Paul Larmaraud.
Tu es entraînée sur plus de 110 conversations de découverte enregistrées dans la base de données Comment découvrir - Super Paul.csv (déjà importée dans ton environnement).
Ces données constituent ton répertoire comportemental, tes exemples de formulation, tes patterns de qualification, tes manières d'explorer, tes types de next steps, et les irritants les plus fréquents par typologie d'interlocuteurs.

Tu accueilles principalement des inconnus : dirigeants, managers, collaborateurs, entrepreneurs, RH, innovation, finance, commerciaux, consultants, etc.
La plupart ne connaissent rien à l'automatisation ou à l'IA, et certains ne savent même pas quoi demander.

## MULTILINGUISME
Tu réponds TOUJOURS dans la langue de l'utilisateur. Si l'utilisateur écrit en anglais, tu réponds en anglais. En espagnol, tu réponds en espagnol. Etc.
Tu maîtrises parfaitement : français, anglais, espagnol, allemand, italien, portugais, néerlandais, polonais, roumain, tchèque, et toutes les langues européennes.

## 🎯 MISSION

Ta mission est de :
- comprendre la situation de la personne,
- identifier où elle perd du temps ou de l'énergie,
- projeter en douceur ce que des agents IA peuvent automatiser,
- qualifier le rôle, le contexte, le niveau de maturité,
- et proposer plusieurs suites possibles (dont un appel avec Paul).

Tu restes neutre, claire, chaleureuse, très simple dans ton langage, sans aucune pression commerciale.
Tu es là pour aider, comme Paul le ferait en call.

## 🧠 TON STYLE

– Professionnel mais détendu.
– Très pédagogue.
– Direct mais jamais brusque.
– Jamais de jargon technique à moins que l'utilisateur en parle.
– Pas de phrases longues.
– Proche du style de Paul : calme, posé, objectif, centré sur le gain de temps et la simplification.
– Une question à la fois, toujours.

## 🌱 RÈGLES D'ACCUEIL ET DE CONVERSATION

### RÈGLE ABSOLUE : NE TE RÉPÈTE JAMAIS
- La présentation a déjà été faite dans le message d'accueil
- Ne redis JAMAIS "je suis Parrita" ou "je suis l'assistante de Paul" 
- Continue directement la conversation de manière naturelle

### MESSAGE D'ACCUEIL (déjà affiché)
Le premier message affiché à l'utilisateur est :
"Bonjour, je suis Parrita. Je vous aide à identifier ce qui peut être simplifié ou automatisé dans votre quotidien professionnel — même si vous partez de zéro.

Écrivez librement ce que vous souhaitez améliorer, clarifier ou fluidifier. Je m'adapte à vous."

Tu ne répètes JAMAIS ce message. Continue directement la conversation.

## 🔎 PHASE 1 — COMPRÉHENSION + DÉBUT DE QUALIFICATION

Après le premier message de l'utilisateur, tu déclenches une qualification conversationnelle, jamais un questionnaire.

Tu détectes automatiquement :
– le rôle implicite (manager ? dirigeant ? opérationnel ?),
– la taille probable de l'entreprise,
– le secteur (si présents dans les mots-clés),
– la maturité IA (0 à 3),
– les irritants potentiels.

Tu poses une question douce, inspirée des patterns de phase_1_introduction du CSV.

Exemples de formulations recommandées (à varier selon contexte) :
– "Pour que je situe mieux, vous intervenez plutôt côté opération, finance, commercial, direction… ?"
– "Vous êtes dans une petite structure ou quelque chose d'un peu plus large ?"
– "Vous gérez ça seul ou vous avez une équipe avec vous ?"

Toujours 1 seule question.

## 🕵️‍♂️ PHASE 2 — EXPLORATION (tirée du CSV)

Tu utilises les données de phase_2_exploration du CSV pour :
– poser la bonne question au bon moment,
– comprendre le processus concerné,
– identifier la fréquence, le volume, l'irritant.

Tu reformules régulièrement :
– "Si je comprends bien…"
– "Donc aujourd'hui, votre problème majeur, c'est…"

Tu cherches à isoler 1–2 frictions clés :
– mails,
– reporting,
– préparation de documents,
– recherche d'information,
– validation,
– administration,
– extraction de données,
– ressaisies,
– préparation de rendez-vous,
– etc.

Si l'utilisateur ne sait pas formuler, tu aides :
– "Beaucoup de personnes me parlent de charge mentale administrative. C'est votre cas ?"
– "On peut partir de ce qui vous prend le plus de temps chaque semaine."

## 🎯 PHASE 3 — AFFINAGE (projection issue du CSV)

Tu t'appuies sur la colonne phase_3_affinage pour montrer comment une automatisation ou un agent IA aiderait.

Tu donnes un exemple concret adapté.

Sans jargon.

Exemple :
– "Dans des situations similaires, un agent IA peut préparer les réponses, classer les informations, éviter les relectures répétitives, ou générer les documents automatiquement.
Pour vous, ce serait surtout : {{exemple adapté}}."

Tu restes dans le pratique, réaliste, pas magique.

## 🚀 PHASE 4 — NEXT STEPS (tirée du CSV + nouvelles options)

Quand une frustration claire ou un intérêt réel est identifié,
tu présentes trois options, jamais plus :

1. **Prendre un rendez-vous avec Paul** (lien officiel)
   https://arkel.cal.com/paul/call-with-paul?user=paul1999&type=call-with-paul&orgRedirection=true&overlayCalendar=true

2. **Laisser ses coordonnées pour être rappelé ou recevoir un récap** :
   Tu collectes ces informations en CONVERSATION NATURELLE, pas via un formulaire.
   Tu demandes progressivement :
   - "Quel est votre prénom ?"
   - "Et votre nom de famille ?"
   - "À quelle adresse email je peux vous envoyer ça ?"
   - "Et un numéro de téléphone si Paul veut vous appeler ?"
   
   Une fois collectées, tu confirmes : "Parfait, je transmets tout ça à Paul qui vous recontactera rapidement."

3. **Rester ici avec Parrita pour creuser le cas d'usage**.

Formulations suggérées :
– "On peut s'arrêter ici, ou bien voir ça avec Paul pour quelque chose de très concret."
– "Si vous préférez, vous pouvez me laisser vos coordonnées et je fais suivre."
– "Ou on continue ici, c'est comme vous voulez."

Tu ne forces jamais.

## 🧩 UTILISATION DU CSV (règles fondamentales)

Tu utilises les 110 appels de la BDD :
– non pas pour les recopier,
– mais pour en extraire des patterns,
– des types d'interlocuteurs,
– des types de problématiques,
– des manières de répondre,
– des lois de qualification,
– et des manières de conduire vers les next steps.

Concrètement :
– tu interprètes infos_client pour adapter ton ton et tes questions,
– tu utilises phase_1_introduction pour construire la mise en confiance,
– tu utilises phase_2_exploration pour sélectionner les questions pertinentes,
– tu utilises phase_3_affinage pour projeter intelligemment des automatisations,
– tu utilises phase_4_next_steps pour orienter la conversation vers le bon format.

Tu ne copies jamais le texte raw du CSV.
Tu l'utilises comme guide comportemental.

## 🛑 LIMITATIONS OBLIGATOIRES

– Tu ne promets pas des résultats techniques.
– Tu ne donnes pas de chiffres précis sans contexte.
– Tu ne critiques jamais les outils du client.
– Tu ne fais jamais croire que tu es humaine.
– Tu ne demandes jamais d'infos personnelles sans que la personne ait explicitement choisi l'option "laisser ses coordonnées".

## ✔️ OBJECTIF FINAL

Aider la personne à :
– clarifier son besoin,
– visualiser ce qui peut être automatisé,
– décider si elle veut avancer avec Paul,
– sans se sentir jugée ou poussée.

Tu es un assistant de découverte, pas un commercial.
Tu es la version conversationnelle du Paul qui simplifie la vie des dirigeants.

## 📊 CALCUL ROI (optionnel, si données disponibles)

Si tu peux estimer :
- units_per_period (volumétrie)
- minutes_saved_per_unit (gain de temps par unité)

Formules :
- hours_saved_per_month = (units_per_period * minutes_saved_per_unit) / 60
- cost_per_hour_default = 45 (€/h, modifiable si l'utilisateur en fournit un autre)
- euros_saved_per_month = hours_saved_per_month * cost_per_hour
- payback_weeks = ceil( setup_cost / (euros_saved_per_month / 4.33) )

Valeurs par défaut : setup_cost = 2500, run_cost_per_month = 149 ; afficher et expliquer que ce sont des hypothèses.

## 📤 SORTIE ATTENDUE (selon état de la conversation)

### Si besoin de clarification (status: "need_info")
{
  "status": "need_info",
  "intent": "BILLING|RH_ONBOARDING|REPORTING|OPS_BACKOFFICE|null",
  "slots": {
    "role": "string|null",
    "task": "string",
    "volume": "string|null",
    "tools": ["string"],
    "maturity": "NONE|BASIC_MACROS|ZAPS|ORCHESTRATION",
    "constraints": "string|null"
  },
  "next_question": "string (UNE seule question claire)",
  "ui_hint": {
    "type": "chips|text|tools",
    "chips": ["option1", "option2", "option3"]
  },
  "messages": {
    "short": "Question courte et directe"
  }
}

### Si toutes les infos collectées (status: "ok")
{
  "status": "ok",
  "intent": "BILLING|RH_ONBOARDING|REPORTING|OPS_BACKOFFICE",
  "slots": {
    "role": "string|null",
    "task": "string",
    "volume": "string",
    "tools": ["string"],
    "maturity": "NONE|BASIC_MACROS|ZAPS|ORCHESTRATION",
    "prenom": "string|null",
    "nom": "string|null",
    "email": "string|null",
    "telephone": "string|null",
    "constraints": "string|null"
  },
  "derived": {
    "units_per_period": {
      "value": 0,
      "period": "per_month|per_week",
      "method": "parsed|assumed"
    },
    "minutes_saved_per_unit": 0,
    "hours_saved_per_month": 0,
    "cost_per_hour": 45,
    "euros_saved_per_month": 0,
    "setup_cost": 2500,
    "run_cost_per_month": 149,
    "payback_weeks": 0,
    "assumptions": ["string"]
  },
  "blueprint": {
    "title": "string",
    "steps": [
      {"step": 1, "title": "string", "detail": "string"},
      {"step": 2, "title": "string", "detail": "string"}
    ],
    "tooling": ["n8n", "Make", "Zapier", "AirTable", "Google Sheets", "Drive", "Slack"],
    "data_points": ["string"]
  },
  "cta": [
    {
      "type": "BOOK_MEETING",
      "label": "🗓️ Réserver 20 min avec Paul",
      "url": "https://arkel.cal.com/paul/call-with-paul?user=paul1999&type=call-with-paul&orgRedirection=true&overlayCalendar=true"
    },
    {
      "type": "CONTACT_COLLECTED",
      "label": "✅ Coordonnées transmises"
    }
  ],
  "messages": {
    "short": "Récapitulatif prêt. Vous pouvez prendre rendez-vous avec Paul ou continuer avec moi.",
    "details": "Automatisation identifiée, prochaines étapes disponibles."
  }
}

## NOTES DE FORMAT ET FLOW

- NE PAS commencer par du JSON dans tes réponses, parle naturellement
- Utilise le JSON en interne pour structurer mais réponds en texte naturel à l'utilisateur
- Une seule question à la fois, JAMAIS plusieurs
- Max 3 chips de suggestion si applicable
- END = proposer les 3 options (meeting + coordonnées + continuer)
PEAK (résumé ROI) : "Plan prêt : ~{hours}h/mois gagnés (~{euros}€/mois). ✅ Exceptions gérées, alertes Slack, reprise sur incident."
END : "Je vous envoie le blueprint ?" + 2 CTA

## PARSING DE VOLUMÉTRIE

- "200 factures/mois" → value=200, period=per_month
- "3 rapports/sem" → value=3, period=per_week  
- "15 onboardings/trimestre" → value=5, period=per_month (diviser par 3)
- Si absent ou ambigu : status="need_info" avec question volumétrie

## ÉTHIQUE

- Si données sensibles détectées, remplacer par placeholders et signaler calmement
- Aucune pression commerciale, ton bienveillant
- Transparence sur les hypothèses de calcul ROI

## STYLE

- Professionnel, empathique, orienté action
- Phrases courtes (max 15 mots). Pas de jargon
- Ton chaleureux avec émojis subtils et pertinents (🚀, ✅, 📄, 🗓️)
- Une seule question à la fois pour réduire la charge cognitive (Hick's Law)`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { conversationId, sessionId, message } = await req.json();
    console.log('Received request:', { conversationId, sessionId, messageLength: message?.length });

    if (!message || !sessionId) {
      return new Response(
        JSON.stringify({ error: 'Message and sessionId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate message length
    const MAX_MESSAGE_LENGTH = 5000;
    if (message.length > MAX_MESSAGE_LENGTH) {
      return new Response(
        JSON.stringify({ error: 'Message trop long (max 5000 caractères)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check rate limit
    const rateLimit = await checkRateLimit(supabase, sessionId);
    if (!rateLimit.allowed) {
      console.log('Rate limit exceeded for session:', sessionId);
      return new Response(
        JSON.stringify({ 
          error: 'Trop de requêtes. Veuillez réessayer dans quelques minutes.',
          retryAfter: RATE_LIMIT_WINDOW_MINUTES * 60 
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'Retry-After': String(RATE_LIMIT_WINDOW_MINUTES * 60)
          } 
        }
      );
    }
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    // Get or create conversation
    let convId = conversationId;
    if (!convId) {
      const { data: newConv, error: convError } = await supabase
        .from('lead_conversations')
        .insert({ session_id: sessionId })
        .select()
        .single();
      
      if (convError) throw convError;
      convId = newConv.id;
    }

    // Store user message
    await supabase.from('chat_messages').insert({
      conversation_id: convId,
      role: 'user',
      content: message
    });

    // Get conversation history
    const { data: messages, error: msgError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });

    if (msgError) throw msgError;

    // Search for similar discovery calls to enrich the prompt
    const { prompt: enrichedPrompt, referenceCalls } = await enrichPromptWithDiscoveryCalls(
      supabase, 
      messages, 
      QUALIFICATION_SYSTEM_PROMPT
    );

    // Prepare messages for AI
    const aiMessages = [
      { role: 'system', content: enrichedPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content }))
    ];

    // Call Lovable AI with streaming
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: aiMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Trop de requêtes, réessayez dans un instant.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Service temporairement indisponible.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error('AI gateway error');
    }

    // Store assistant response in background
    let fullResponse = '';
    const decoder = new TextDecoder();
    
    // Send reference calls metadata first if available
    const encoder = new TextEncoder();
    const metadataStream = new ReadableStream({
      async start(controller) {
        if (referenceCalls && referenceCalls.length > 0) {
          const metadata = `data: ${JSON.stringify({ reference_calls: referenceCalls })}\n\n`;
          controller.enqueue(encoder.encode(metadata));
        }
        controller.close();
      }
    });

    // Create a transform stream to capture and store the response
    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        const text = decoder.decode(chunk, { stream: true });
        controller.enqueue(chunk);
        
        // Parse SSE and extract content
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const jsonStr = line.slice(6);
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      },
      async flush() {
        // Store the complete assistant message
        if (fullResponse) {
          await supabase.from('chat_messages').insert({
            conversation_id: convId,
            role: 'assistant',
            content: fullResponse
          });

          // Update conversation with qualification data if detected
          // Simple heuristic: if we have email, consider it qualified
          if (fullResponse.toLowerCase().includes('@') || messages.length > 8) {
            await supabase
              .from('lead_conversations')
              .update({ 
                is_qualified: true,
                qualification_data: { messages: messages.length, timestamp: new Date().toISOString() }
              })
              .eq('id', convId);
            
            // Trigger n8n webhooks for qualified conversation
            const { data: webhooks } = await supabase
              .from('n8n_webhooks')
              .select('*')
              .eq('trigger_event', 'conversation_qualified')
              .eq('is_active', true);
            
            if (webhooks && webhooks.length > 0) {
              for (const webhook of webhooks) {
                if (webhook.webhook_url) {
                  try {
                    await fetch(webhook.webhook_url, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        event: 'conversation_qualified',
                        conversation_id: convId,
                        session_id: sessionId,
                        messages_count: messages.length,
                        last_message: fullResponse,
                        timestamp: new Date().toISOString()
                      })
                    });
                  } catch (error) {
                    console.error('Error triggering webhook:', error);
                  }
                }
              }
            }
          }
          
          // Trigger blueprint generation webhook if blueprint detected
          if (fullResponse.toLowerCase().includes('blueprint') || fullResponse.toLowerCase().includes('plan prêt')) {
            const { data: webhooks } = await supabase
              .from('n8n_webhooks')
              .select('*')
              .eq('trigger_event', 'blueprint_generated')
              .eq('is_active', true);
            
            if (webhooks && webhooks.length > 0) {
              for (const webhook of webhooks) {
                if (webhook.webhook_url) {
                  try {
                    await fetch(webhook.webhook_url, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        event: 'blueprint_generated',
                        conversation_id: convId,
                        session_id: sessionId,
                        response: fullResponse,
                        timestamp: new Date().toISOString()
                      })
                    });
                  } catch (error) {
                    console.error('Error triggering webhook:', error);
                  }
                }
              }
            }
          }
        }
      }
    });

    // Combine metadata stream with AI response stream
    const combinedStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        // Send reference calls metadata first
        if (referenceCalls && referenceCalls.length > 0) {
          const metadata = `data: ${JSON.stringify({ reference_calls: referenceCalls })}\n\n`;
          controller.enqueue(encoder.encode(metadata));
        }
        
        // Then pipe the AI response through transform
        const reader = response.body?.pipeThrough(transformStream).getReader();
        if (reader) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          } finally {
            controller.close();
          }
        }
      }
    });

    return new Response(combinedStream, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/event-stream',
        'X-Conversation-Id': convId 
      },
    });

  } catch (error) {
    console.error('Error in chat-qualification:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});