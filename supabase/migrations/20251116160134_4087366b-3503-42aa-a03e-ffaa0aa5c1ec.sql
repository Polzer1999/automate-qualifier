-- Create table for Paul's discovery calls knowledge base
CREATE TABLE IF NOT EXISTS public.discovery_calls_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Client metadata from infos_client column
  entreprise TEXT,
  secteur TEXT,
  besoin TEXT,
  contexte TEXT,
  
  -- Four qualification phases (raw text from CSV)
  phase_1_introduction TEXT,
  phase_2_exploration TEXT,
  phase_3_affinage TEXT,
  phase_4_next_steps TEXT,
  
  -- Store original data for reference
  raw_data JSONB
);

-- Enable RLS
ALTER TABLE public.discovery_calls_knowledge ENABLE ROW LEVEL SECURITY;

-- Service role can manage all data
CREATE POLICY "Service role can manage discovery calls knowledge"
  ON public.discovery_calls_knowledge
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create index for faster secteur searches
CREATE INDEX IF NOT EXISTS idx_discovery_calls_secteur ON public.discovery_calls_knowledge(secteur);
CREATE INDEX IF NOT EXISTS idx_discovery_calls_besoin ON public.discovery_calls_knowledge(besoin);