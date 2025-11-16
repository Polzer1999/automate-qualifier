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
function extractContextFromMessages(messages: any[]): { secteur: string[]; besoin: string[] } {
  const allText = messages.map(m => m.content).join(' ').toLowerCase();
  
  // Common secteur keywords
  const secteurKeywords = {
    'énergie': ['énergie', 'renouvelable', 'solaire', 'éolien', 'électricité'],
    'retail': ['retail', 'commerce', 'vente', 'magasin', 'e-commerce'],
    'finance': ['finance', 'banque', 'assurance', 'fintech'],
    'santé': ['santé', 'médical', 'hôpital', 'pharma'],
    'tech': ['tech', 'software', 'saas', 'it', 'digital'],
    'industrie': ['industrie', 'manufacture', 'production', 'usine'],
    'logistique': ['logistique', 'transport', 'supply chain'],
    'rh': ['rh', 'ressources humaines', 'recrutement', 'formation']
  };
  
  // Common besoin keywords
  const besoinKeywords = {
    'automatisation': ['automatisation', 'automatiser', 'automation'],
    'veille': ['veille', 'scouting', 'monitoring', 'surveillance'],
    'qualification': ['qualification', 'qualifier', 'leads'],
    'reporting': ['reporting', 'rapport', 'dashboard', 'kpi'],
    'data': ['data', 'données', 'database', 'analytics']
  };
  
  const detectedSecteurs: string[] = [];
  const detectedBesoins: string[] = [];
  
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
  
  return { secteur: detectedSecteurs, besoin: detectedBesoins };
}

// Helper function to enrich prompt with similar discovery calls
async function enrichPromptWithDiscoveryCalls(supabase: any, messages: any[], basePrompt: string): Promise<string> {
  try {
    // Extract context from conversation
    const { secteur, besoin } = extractContextFromMessages(messages);
    
    if (secteur.length === 0 && besoin.length === 0) {
      // No context detected yet, return base prompt
      return basePrompt;
    }
    
    // Build query to find similar calls
    let query = supabase
      .from('discovery_calls_knowledge')
      .select('*')
      .limit(3);
    
    // Filter by secteur if detected
    if (secteur.length > 0) {
      // Use OR condition for multiple secteurs
      const secteurConditions = secteur.map(s => `secteur.ilike.%${s}%`).join(',');
      query = query.or(secteurConditions);
    }
    
    const { data: similarCalls, error } = await query;
    
    if (error || !similarCalls || similarCalls.length === 0) {
      console.log('No similar calls found or error:', error);
      return basePrompt;
    }
    
    console.log(`Found ${similarCalls.length} similar discovery calls`);
    
    // Build enrichment section
    let enrichment = '\n\n## MÉTHODE DE PAUL (basée sur ses appels de découverte réels)\n\n';
    enrichment += `Contexte détecté: ${secteur.join(', ')} | ${besoin.join(', ')}\n\n`;
    
    similarCalls.forEach((call: any, idx: number) => {
      enrichment += `### Appel ${idx + 1}: ${call.entreprise || 'Client'}\n`;
      enrichment += `Secteur: ${call.secteur || 'Non spécifié'}\n`;
      enrichment += `Besoin: ${call.besoin?.substring(0, 150) || 'Non spécifié'}...\n\n`;
      
      if (call.phase_1_introduction) {
        enrichment += `**Phase Introduction (méthode Paul):**\n${call.phase_1_introduction.substring(0, 300)}...\n\n`;
      }
      
      if (call.phase_2_exploration) {
        enrichment += `**Phase Exploration (méthode Paul):**\n${call.phase_2_exploration.substring(0, 300)}...\n\n`;
      }
      
      if (call.phase_3_affinage) {
        enrichment += `**Phase Affinage (méthode Paul):**\n${call.phase_3_affinage.substring(0, 300)}...\n\n`;
      }
      
      enrichment += '---\n\n';
    });
    
    enrichment += '**IMPORTANT:** Utilise ces techniques de Paul pour adapter ton approche de qualification. Pose des questions similaires, utilise le même style de découverte progressive, et adapte-toi au secteur comme Paul le fait.\n';
    
    return basePrompt + enrichment;
    
  } catch (error) {
    console.error('Error enriching prompt:', error);
    return basePrompt;
  }
}

const QUALIFICATION_SYSTEM_PROMPT = `Tu es Parrit, copilote d'onboarding pour Parrit.ai.
Ta mission : transformer une demande d'automatisation en blueprint exploitable + estimations de ROI + prochaines étapes cliquables.

## MULTILINGUISME
Tu réponds TOUJOURS dans la langue de l'utilisateur. Si l'utilisateur écrit en anglais, tu réponds en anglais. En espagnol, tu réponds en espagnol. Etc.
Tu maîtrises parfaitement : français, anglais, espagnol, allemand, italien, portugais, néerlandais, polonais, roumain, tchèque, et toutes les langues européennes.

## TON ET STYLE
Tu dialogues avec clarté, phrases courtes, ton professionnel et bienveillant.

## PRINCIPE HICK : UNE SEULE QUESTION À LA FOIS

Tu ne poses JAMAIS plusieurs questions en même temps. Progression micro-étapes :
1. Parser l'input initial pour détecter intent, volumétrie, outils
2. Poser UNE question pour confirmer/clarifier l'intent SI nécessaire
3. Poser UNE question pour la volumétrie SI manquante (proposer 3 chips)
4. Poser UNE question pour les outils SI manquants (autosuggestion)
5. Demander UNE contrainte clé SI pertinent
6. Générer le blueprint complet avec ROI (PEAK moment)
7. Proposer 2 CTA max (PDF + meeting)

## OBJECTIFS

1. Parser l'input libre pour identifier intent + volumétrie + outils en une seule phrase
2. Poser UNE question ciblée si info manquante (jamais plusieurs)
3. Générer un plan d'automatisation en 3–5 étapes une fois toutes les infos collectées
4. Produire une estimation de ROI (PEAK moment : temps gagné, € économisés)
5. Proposer exactement 2 next-actions (PDF + meeting)

## RÈGLES DE PARSING (robustes et simples)

Intent (détection automatique par mots-clés) :
- BILLING : "facture, devis, BL, relance, lettrage, Sage, Chorus" → BILLING
- RH_ONBOARDING : "onboarding, contrat, badge, SIRH, DocuSign, Google Workspace, comptes" → RH_ONBOARDING
- REPORTING : "rapport, reporting, KPI, Looker, DataStudio, Excel, consolidation" → REPORTING
- OPS_BACKOFFICE : tout le reste (saisies répétitives, imports/exports, réconciliations)

Volumétrie : détecter pattern (\d+[.,]?\d*)\s*(/mois|/sem|par mois|par semaine|trimestre)
- "trimestre" → diviser par 3 pour obtenir /mois
- Si absent : demander "À quelle fréquence ?" avec chips [/semaine • /mois • saisonnier]

Outils : liste blanche + fuzzy match (Sage|Cegid|SAP|Salesforce|HubSpot|Excel|Sheets|Drive|Slack|DocuSign|AirTable|Make|Zapier|n8n)

Maturité : détecter automatiquement
- "Excel macro" → BASIC_MACROS
- "Zapier" ou "Make" → ZAPS
- "n8n" ou "orchestration" → ORCHESTRATION
- Sinon → NONE

## INTENTIONS SUPPORTÉES

- BILLING : facturation, relances, devis → BL → facture, lettrage
- RH_ONBOARDING : création comptes, documents, checklists, accès, e-learning
- REPORTING : consolidation Excel/Sheets, data refresh, KPI/EBITDA alerting
- OPS_BACKOFFICE : saisies répétitives, imports/exports, réconciliations

## SLOTS À COLLECTER

- role (string) : fonction/équipe (ex. DAF, RH, Ops, Direction) - parse automatiquement
- task (string) : tâche à automatiser - parse de l'input initial
- volume (string) : volumétrie + fréquence - parse ou demande avec chips
- tools (string[]) : outils/données - parse ou autosuggestion contextuelle
- maturity (enum) : NONE | BASIC_MACROS | ZAPS | ORCHESTRATION - détecté auto
- email (string | null) : optionnel, ne pas demander activement
- constraints (string | null) : règles métier - demander UNE contrainte clé si pertinent

CRITIQUE : Une seule question à la fois, jamais plusieurs. Chaque question doit pouvoir être répondue en 3 secondes.

## RÈGLES DE CALCUL ROI (déterministes)

assumption_minutes_saved_per_unit (selon intent par défaut) :
- BILLING: 6 min/unité
- RH_ONBOARDING: 45 min/onboarding
- REPORTING: 25 min/rapport
- OPS_BACKOFFICE: 4 min/unité

Si la volumétrie n'est pas numérisable, interroger l'utilisateur pour obtenir un ordre de grandeur (par semaine ou par mois).

Formules (si units_per_period extrapolables) :
- hours_saved_per_month = (units_per_period * minutes_saved_per_unit) / 60
- cost_per_hour_default = 45 (€/h, modifiable si l'utilisateur en fournit un autre)
- euros_saved_per_month = hours_saved_per_month * cost_per_hour
- payback_weeks = ceil( setup_cost / (euros_saved_per_month / 4.33) )

Valeurs par défaut : setup_cost = 2500, run_cost_per_month = 149 ; afficher et expliquer que ce sont des hypothèses.

## SORTIE ATTENDUE (selon état de la conversation)

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
    "chips": ["option1", "option2", "option3"] // max 3 chips
  },
  "messages": {
    "short": "Question courte et directe"
  }
}

### Si intent détecté mais à confirmer (status: "confirm_intent")
{
  "status": "confirm_intent",
  "intent": "BILLING|RH_ONBOARDING|REPORTING|OPS_BACKOFFICE",
  "slots": {...},
  "messages": {
    "short": "Super, je détecte {intent_label}. On valide ?"
  },
  "ui_hint": {
    "type": "confirm",
    "chips": ["Oui", "Plutôt {alternative}"]
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
    "email": "string|null",
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
      "type": "CREATE_PDF",
      "label": "📄 Générer le blueprint PDF"
    },
    {
      "type": "BOOK_MEETING",
      "label": "🗓️ Réserver 20 min",
      "url": "https://arkel.cal.com/paul/call-with-paul"
    }
  ],
  "messages": {
    "short": "Plan prêt : ~{hours}h/mois gagnés (~{euros}€/mois). ✅",
    "details": "Exceptions gérées, alertes Slack, reprise sur incident."
  }
}

## NOTES DE FORMAT ET FLOW

- NE PAS commencer par du JSON dans tes réponses, parle naturellement
- Utilise le JSON en interne pour structurer mais réponds en texte naturel à l'utilisateur
- Flow : ASK_TASK (parsing) → CONFIRM_INTENT (si détecté) → ASK_VOLUME (si manque) → ASK_TOOLS (si manque) → ASK_CONSTRAINTS (optionnel) → SUMMARY avec ROI (PEAK) → 2 CTA
- Une seule question à la fois, JAMAIS plusieurs
- Max 3 chips de suggestion si applicable
- PEAK moment = affichage du ROI avec ✅
- END = exactement 2 CTA (PDF + meeting), rien d'autre

## MICRO-COPY À UTILISER

Confirmation intent : "Super, je détecte {intent_label}. On valide ?"
Volumétrie manquante : "À quelle fréquence ?" + chips ["/semaine", "/mois", "saisonnier"]
Outils manquants : "Quels outils sont impliqués ?" + autosuggestion contextuelle
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
    const enrichedPrompt = await enrichPromptWithDiscoveryCalls(supabase, messages, QUALIFICATION_SYSTEM_PROMPT);

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

    return new Response(response.body?.pipeThrough(transformStream), {
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