import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const body = await req.json();
    
    console.log('Received lead data:', JSON.stringify(body, null, 2));

    // Insert lead data into parrita_leads table
    const { data, error } = await supabase
      .from('parrita_leads')
      .insert({
        lead_name: body.lead_name ?? null,
        lead_role: body.lead_role ?? null,
        lead_company: body.lead_company ?? null,
        lead_company_size: body.lead_company_size ?? null,
        lead_sector: body.lead_sector ?? null,
        lead_email: body.lead_email ?? null,
        lead_phone: body.lead_phone ?? null,
        context_summary: body.context_summary ?? null,
        main_pain_points: body.main_pain_points ?? [],
        tasks_to_automate: body.tasks_to_automate ?? [],
        estimated_time_spent_per_week_hours: body.estimated_time_spent_per_week_hours ?? 0,
        iai_maturity_level: body.iai_maturity_level ?? 0,
        interest_level: body.interest_level ?? 'faible',
        preferred_next_step: body.preferred_next_step ?? 'juste_exploration',
        calcom_link_clicked: body.calcom_link_clicked ?? false
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting lead:', error);
      return new Response(
        JSON.stringify({ error: error.message }), 
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Lead saved successfully:', data.id);

    return new Response(
      JSON.stringify({ status: 'ok', lead_id: data.id }), 
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in save-qualified-lead function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }), 
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
