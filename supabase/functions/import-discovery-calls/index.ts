import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { csvData } = await req.json();
    
    console.log('Starting CSV import...');
    
    // Parse CSV
    const lines = csvData.split('\n').filter((line: string) => line.trim());
    const header = lines[0];
    
    let imported = 0;
    let errors = 0;
    
    for (let i = 1; i < lines.length; i++) {
      try {
        // Parse CSV line handling quoted fields with commas
        const parts = parseCsvLine(lines[i]);
        
        if (parts.length < 5) {
          console.error(`Skipping line ${i}: insufficient columns`);
          errors++;
          continue;
        }
        
        const [infosClient, phase1, phase2, phase3, phase4] = parts;
        
        // Parse infos_client to extract structured data
        const clientInfo = parseClientInfo(infosClient);
        
        const { error } = await supabase
          .from('discovery_calls_knowledge')
          .insert({
            entreprise: clientInfo.entreprise,
            secteur: clientInfo.secteur,
            besoin: clientInfo.besoin,
            contexte: clientInfo.contexte,
            phase_1_introduction: phase1,
            phase_2_exploration: phase2,
            phase_3_affinage: phase3,
            phase_4_next_steps: phase4,
            raw_data: {
              infos_client: infosClient,
              line_number: i
            }
          });
        
        if (error) {
          console.error(`Error importing line ${i}:`, error);
          errors++;
        } else {
          imported++;
        }
      } catch (err) {
        console.error(`Exception on line ${i}:`, err);
        errors++;
      }
    }
    
    console.log(`Import completed: ${imported} imported, ${errors} errors`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        imported, 
        errors,
        message: `Successfully imported ${imported} discovery calls` 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in import-discovery-calls:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper function to parse CSV line with quoted fields
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

// Helper function to parse infos_client field
function parseClientInfo(infosClient: string): {
  entreprise: string;
  secteur: string;
  besoin: string;
  contexte: string;
} {
  const info = {
    entreprise: '',
    secteur: '',
    besoin: '',
    contexte: infosClient
  };
  
  // Extract entreprise
  const entrepriseMatch = infosClient.match(/Entreprise:\s*([^|]+)/i);
  if (entrepriseMatch) {
    info.entreprise = entrepriseMatch[1].trim();
  }
  
  // Extract secteur
  const secteurMatch = infosClient.match(/Secteur:\s*([^|]+)/i);
  if (secteurMatch) {
    info.secteur = secteurMatch[1].trim();
  }
  
  // Extract besoin
  const besoinMatch = infosClient.match(/Besoin:\s*([^|]+?)(?:\s*\||$)/i);
  if (besoinMatch) {
    info.besoin = besoinMatch[1].trim();
  }
  
  return info;
}
