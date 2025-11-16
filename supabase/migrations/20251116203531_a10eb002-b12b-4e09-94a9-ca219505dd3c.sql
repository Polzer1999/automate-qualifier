-- Add import_batch_id to track which import session each call belongs to
ALTER TABLE discovery_calls_knowledge 
ADD COLUMN import_batch_id uuid DEFAULT NULL;

-- Add index for better query performance
CREATE INDEX idx_discovery_calls_import_batch ON discovery_calls_knowledge(import_batch_id);