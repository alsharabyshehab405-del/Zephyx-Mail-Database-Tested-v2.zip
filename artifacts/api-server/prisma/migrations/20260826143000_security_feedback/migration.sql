CREATE TABLE "email_security_feedback" (
    "id" TEXT NOT NULL,
    "email_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL DEFAULT 'personal',
    "feedback_type" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_security_feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_security_feedback_email_org_user_unique" ON "email_security_feedback"("email_id", "organization_id", "user_id");
CREATE INDEX "email_security_feedback_org_type_idx" ON "email_security_feedback"("organization_id", "feedback_type", "created_at");
CREATE INDEX "email_security_feedback_user_type_idx" ON "email_security_feedback"("user_id", "feedback_type", "created_at");

ALTER TABLE "email_security_feedback" ADD CONSTRAINT "email_security_feedback_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_security_feedback" ADD CONSTRAINT "email_security_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
