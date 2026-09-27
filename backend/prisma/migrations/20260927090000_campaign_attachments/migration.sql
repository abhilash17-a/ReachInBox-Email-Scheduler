ALTER TABLE "Campaign"
ADD COLUMN "attachments" JSONB NOT NULL DEFAULT '[]'::jsonb;
