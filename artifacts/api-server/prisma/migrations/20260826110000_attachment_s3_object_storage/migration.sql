ALTER TABLE "email_attachment_objects"
  ADD COLUMN "organization_id" TEXT NOT NULL DEFAULT 'personal';

CREATE INDEX "email_attachment_objects_org_owner_idx"
  ON "email_attachment_objects"("organization_id", "owner_user_id");
