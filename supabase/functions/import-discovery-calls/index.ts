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
    
    // Parse CSV with proper multi-line field handling
    const rows = parseCSV(csvData);
    
    if (rows.length === 0) {
      console.error('No data found in CSV');
      return new Response(
        JSON.stringify({ error: 'No data found in CSV' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const header = rows[0];
    console.log(`CSV has ${rows.length - 1} data rows (excluding header)`);
    
    let imported = 0;
    let errors = 0;
    
    for (let i = 1; i < rows.length; i++) {
      try {
        const row = rows[i];
        
        if (row.length < 5) {
          console.error(`Skipping row ${i}: insufficient columns (got ${row.length}, expected 5)`);
          errors++;
          continue;
        }
        
        const [infosClient, phase1, phase2, phase3, phase4] = row;
        
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

// Helper function to parse entire CSV with multi-line field support
function parseCSV(csvData: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < csvData.length; i++) {
    const char = csvData[i];
    const nextChar = csvData[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote ("" → ")
        currentField += '"';
        i++;
      } else {
        // Start or end of quoted field
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field (comma outside quotes)
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      // End of row (newline outside quotes)
      if (char === '\r' && nextChar === '\n') {
        // Skip \r in \r\n
        i++;
      }
      if (currentField || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        // Only add non-empty rows
        if (currentRow.some(f => f)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      }
    } else {
      // Normal character (including \n inside quotes)
      currentField += char;
    }
  }
  
  // Add last row if exists
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(f => f)) {
      rows.push(currentRow);
    }
  }
  
  return rows;
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
