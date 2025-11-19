-- Add lead_id column to lead_conversations to link conversations to qualified leads
ALTER TABLE public.lead_conversations 
ADD COLUMN lead_id uuid REFERENCES public.parrita_leads(id) ON DELETE SET NULL;