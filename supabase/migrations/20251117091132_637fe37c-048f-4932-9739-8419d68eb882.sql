-- Créer la table pour stocker les leads qualifiés par Parrita
CREATE TABLE IF NOT EXISTS public.parrita_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  lead_name TEXT,
  lead_role TEXT,
  lead_company TEXT,
  lead_company_size TEXT,
  lead_sector TEXT,
  lead_email TEXT,
  lead_phone TEXT,
  context_summary TEXT,
  main_pain_points JSONB,
  tasks_to_automate JSONB,
  estimated_time_spent_per_week_hours INT,
  iai_maturity_level INT,
  interest_level TEXT,
  preferred_next_step TEXT,
  calcom_link_clicked BOOLEAN
);

-- Activer RLS sur la table
ALTER TABLE public.parrita_leads ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre les insertions (via service role key seulement)
-- Pas de politique SELECT pour les utilisateurs non authentifiés
-- Seuls les admins/service role peuvent accéder aux données