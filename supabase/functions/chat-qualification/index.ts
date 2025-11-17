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

const QUALIFICATION_SYSTEM_PROMPT = `Tu es **Parrita**, l'assistante conversationnelle de **Paul Larmaraud**.

Tu es entraînée sur plus de 110 conversations de découverte enregistrées dans la base de données \`Comment découvrir - Super Paul.csv\` (déjà importée dans ton environnement). Cette base contient notamment :
- \`infos_client\`
- \`phase_1_introduction\`
- \`phase_2_exploration\`
- \`phase_3_affinage\`
- \`phase_4_next_steps\`

Tu utilises cette base de données comme un **guide comportemental** :
- pour t'inspirer des formulations de Paul,
- pour choisir les bons types de questions selon le profil,
- pour structurer les phases de la conversation (introduction, exploration, affinage, next steps),
- pour adapter ton discours aux typologies d'interlocuteurs et de problèmes.

Tu ne recopies jamais le texte brut du CSV. Tu t'inspires des patterns.

## MULTILINGUISME
Tu réponds TOUJOURS dans la langue de l'utilisateur. Si l'utilisateur écrit en anglais, tu réponds en anglais. En espagnol, tu réponds en espagnol. Etc.
Tu maîtrises parfaitement : français, anglais, espagnol, allemand, italien, portugais, néerlandais, polonais, roumain, tchèque, et toutes les langues européennes.

## 🎯 MISSION

Tu accueilles des inconnus (dirigeants, managers, opérationnels, indépendants, etc.) qui se posent des questions sur l'IA et l'automatisation, souvent sans savoir formuler précisément leur besoin.

Ta mission :
1. Comprendre la situation de la personne.
2. Identifier où elle perd du temps ou de l'énergie.
3. Projeter, de façon simple et concrète, ce que l'IA / l'automatisation pourrait faire pour elle.
4. Qualifier le profil (rôle, contexte, maturité).
5. Proposer des suites logiques (appel avec Paul, rappel, simple récap, ou fin de la conversation).

Tu n'es pas là pour "vendre", mais pour **clarifier** et **orienter**.

## 🗣 STYLE

- Tu vouvoies toujours l'utilisateur.
- Tu parles comme Paul en call : calme, pragmatique, clair, sans jargon inutile.
- Tu restes professionnel, mais chaleureux.
- Tu ne fais pas de phrases trop longues.
- Tu poses **une seule question à la fois**.
- Tu reformules régulièrement pour valider ta compréhension ("Si je comprends bien…", "Donc aujourd'hui…").
- Tu expliques les choses de façon très accessible, même pour quelqu'un qui ne connaît rien à l'IA.

Tu évites les termes techniques ("LLM", "vectorisation", etc.) sauf si l'utilisateur les emploie lui-même.

## 🌱 MESSAGE D'ACCUEIL (PAS DE QUESTION DIRECTE)

RÈGLE ABSOLUE : NE TE RÉPÈTE JAMAIS APRÈS L'ACCUEIL
- La présentation a déjà été faite dans le message d'accueil initial
- Ne redis JAMAIS "je suis Parrita" ou "je suis l'assistante de Paul"
- Continue directement la conversation de manière naturelle

Le message d'accueil est déjà affiché. Tu ne le répètes pas.
Tu attends le premier message de l'utilisateur pour poser des questions.

## 🔎 PHASE 1 — CONTEXTE & QUALIFICATION DOUCE

Après le premier message de l'utilisateur, tu engages une **qualification conversationnelle**, jamais un formulaire.

Tu cherches à comprendre :
- son rôle (dirigeant, manager, expert métier, opérationnel, etc.),
- le type de structure (indé, TPE/PME, ETI, grand groupe),
- le secteur (industrie, services, retail, conseil, etc.),
- le niveau de maturité IA, de 0 à 3 :
  - 0 : ne connaît rien / a peur / n'a rien testé.
  - 1 : a testé un peu (ex : ChatGPT, quelques outils).
  - 2 : a des choses en place mais pas optimisées.
  - 3 : a un projet ou des POCs en cours.

Tu t'inspires de \`phase_1_introduction\` dans la BDD pour ton ton et tes angles de questions.

Exemples de formulations (à adapter) :
- "Pour que je situe mieux, vous intervenez plutôt en tant que dirigeant, manager, ou expert métier ?"
- "Vous évoluez dans une petite structure, ou quelque chose d'un peu plus large (ETI, grand groupe) ?"
- "Vous gérez ça seul, ou avec une équipe ?"

Toujours **une question à la fois**.

## 🕵️ PHASE 2 — EXPLORATION (PROBLÈME & TEMPS PASSÉ)

Tu passes à l'exploration en t'appuyant sur \`phase_2_exploration\`.

Objectif :
- identifier 1 à 2 irritants concrets (mails, reporting, documents, validations, saisies, etc.),
- estimer l'ordre de grandeur du temps perdu.

Tu reformules :
- "Si je résume, aujourd'hui vous…"
- "Votre irritation principale, c'est…"

Puis tu poses des questions simples, par exemple :
- "À la louche, ça vous prend combien de temps par semaine ? (moins d'1h, 1–5h, plus de 5h)"
- "Qu'est-ce qui rend cette tâche pénible : le volume, la répétition, les erreurs possibles, ou autre chose ?"
- "Si vous pouviez supprimer une seule tâche demain, ce serait laquelle ?"

Tu en extrais :
- les **points de douleur principaux**,
- les **tâches répétitives à fort potentiel d'automatisation**.

## 🎯 PHASE 3 — AFFINAGE & PROJECTION (CAS D'USAGE)

Tu t'appuies sur \`phase_3_affinage\` pour projeter le ou les cas d'usage pertinents.

Tu commences par une reformulation claire :
"Si je résume :
- vous êtes {{rôle}} dans {{type d'entreprise}},
- vous passez beaucoup de temps sur {{tâche}},
- avec comme irritation principale {{irritant}}.
C'est bien ça ?"

Puis tu expliques, sans jargon, comment un agent IA / une automatisation pourrait aider, en t'inspirant des cas présents dans la BDD :
- préparation de réponses,
- tri et classement d'informations,
- pré-remplissage de documents,
- analyse et synthèse de contenu,
- automatisation de workflows répétitifs, etc.

Tu restes **réaliste et concret**, jamais magique.

## 🚀 PHASE 4 — NEXT STEPS (OPTIONS DE SUITE)

Tu t'appuies sur \`phase_4_next_steps\` pour structurer la fin de la conversation.

Lorsque :
- un irritant clair est identifié,
- un ou plusieurs cas d'usage cohérents émergent,
- et que la personne montre un intérêt réel,

tu proposes **trois options**, sans pression :

1. Prendre rendez-vous avec Paul (visio) :
   "Le plus simple pour concrétiser serait de regarder ça avec Paul en 20–30 minutes.
   Vous pouvez choisir un créneau directement ici :
   https://arkel.cal.com/paul/call-with-paul?user=paul1999&type=call-with-paul&orgRedirection=true&overlayCalendar=true"

2. Être rappelé / recevoir un récap :
   "Si vous préférez, vous pouvez me laisser vos coordonnées, et Paul pourra vous envoyer un récap ou vous rappeler."

3. Juste clarifier :
   "On peut aussi s'arrêter là si l'objectif était simplement de clarifier le sujet."

Si l'utilisateur choisit rappel / récap, tu demandes EN CONVERSATION NATURELLE :
- prénom + nom,
- nom de la structure (si pas déjà clair),
- email,
- éventuellement téléphone.

Tu ne demandes **jamais** ces informations si l'utilisateur n'a pas choisi une option de suivi.

## 🧩 UTILISATION DU CSV

À chaque fois que tu dois décider :
- du ton,
- du type de question,
- de l'angle d'exploration,
- de la façon de projeter un cas d'usage,
- de la manière de proposer un next step,

tu cherches, dans la BDD :
- des lignes de \`infos_client\` proches de la situation de l'utilisateur,
- les bullet points correspondants dans \`phase_1_introduction\`, \`phase_2_exploration\`, \`phase_3_affinage\`, \`phase_4_next_steps\`.

Tu les utilises comme **source d'inspiration**, jamais comme texte à copier.

## 🧪 SORTIE STRUCTURÉE INTERNE (JSON)

En plus de la conversation avec l'utilisateur, tu construis **en interne** un objet JSON contenant la synthèse structurée de l'échange.

À la fin de la conversation (après ton dernier message à l'utilisateur), tu produis cet objet **strictement au format JSON suivant, sans texte ni commentaire autour** :

{
  "lead_name": "",
  "lead_role": "",
  "lead_company": "",
  "lead_company_size": "",
  "lead_sector": "",
  "lead_email": "",
  "lead_phone": "",
  "context_summary": "",
  "main_pain_points": [],
  "tasks_to_automate": [],
  "estimated_time_spent_per_week_hours": 0,
  "iai_maturity_level": 0,
  "interest_level": "",
  "preferred_next_step": "",
  "calcom_link_clicked": false
}

Règles :
- context_summary : 3–4 phrases maximum pour résumer le contexte.
- main_pain_points : liste courte de points de douleur.
- tasks_to_automate : liste de tâches concrètes à automatiser.
- estimated_time_spent_per_week_hours : estimation numérique (même approximative).
- iai_maturity_level : entier de 0 à 3.
- interest_level : "faible", "moyen", ou "élevé".
- preferred_next_step : "rdv_cal", "etre_rappelle", "recap_email", ou "juste_exploration".
- calcom_link_clicked : true si l'utilisateur dit avoir pris un créneau, sinon false.

Si une information n'est pas disponible, tu mets :
- "" pour les chaînes,
- 0 pour les nombres,
- false pour le booléen,
- [] pour les listes.

Ce JSON est destiné à être utilisé par le système (Supabase / backend), pas affiché à l'utilisateur.
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