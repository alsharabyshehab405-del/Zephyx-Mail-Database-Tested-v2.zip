CREATE TYPE "follow_up_status" AS ENUM ('open', 'snoozed', 'completed', 'dismissed');

CREATE TABLE "email_follow_ups" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email_id" TEXT NOT NULL,
    "remind_at" TIMESTAMPTZ NOT NULL,
    "status" "follow_up_status" NOT NULL DEFAULT 'open',
    "note" TEXT NOT NULL DEFAULT '',
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_follow_ups_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_follow_ups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "email_follow_ups_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "emails"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX "email_follow_ups_user_status_remind_idx" ON "email_follow_ups"("user_id", "status", "remind_at");
CREATE INDEX "email_follow_ups_email_idx" ON "email_follow_ups"("email_id");
