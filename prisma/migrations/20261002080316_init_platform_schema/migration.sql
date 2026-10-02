-- CreateTable
CREATE TABLE "integration_connections" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "config" JSONB NOT NULL DEFAULT '{}',
    "last_tested_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_users" (
    "id" UUID NOT NULL,
    "provider_id" TEXT NOT NULL,
    "primary_email" TEXT NOT NULL,
    "name" TEXT,
    "given_name" TEXT,
    "family_name" TEXT,
    "full_name" TEXT,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "org_unit_path" TEXT,
    "creation_time" TIMESTAMP(3),
    "last_login_time" TIMESTAMP(3),
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "is_delegated_admin" BOOLEAN NOT NULL DEFAULT false,
    "raw_metadata" JSONB NOT NULL DEFAULT '{}',
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_user_aliases" (
    "id" UUID NOT NULL,
    "google_user_id" UUID NOT NULL,
    "alias_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_user_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_groups" (
    "id" UUID NOT NULL,
    "provider_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "direct_members_count" INTEGER NOT NULL DEFAULT 0,
    "raw_metadata" JSONB NOT NULL DEFAULT '{}',
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_group_aliases" (
    "id" UUID NOT NULL,
    "google_group_id" UUID NOT NULL,
    "alias_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_group_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_group_members" (
    "id" UUID NOT NULL,
    "google_group_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "member_id" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "type" TEXT NOT NULL DEFAULT 'USER',
    "raw_metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "microsoft_users" (
    "id" UUID NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_principal_name" TEXT NOT NULL,
    "mail" TEXT,
    "display_name" TEXT,
    "account_enabled" BOOLEAN NOT NULL DEFAULT true,
    "user_type" TEXT,
    "raw_metadata" JSONB NOT NULL DEFAULT '{}',
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "microsoft_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "microsoft_mailboxes" (
    "id" UUID NOT NULL,
    "provider_mailbox_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "primary_smtp_address" TEXT NOT NULL,
    "recipient_type" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "archive_enabled" BOOLEAN NOT NULL DEFAULT false,
    "external_directory_object_id" TEXT,
    "raw_metadata" JSONB NOT NULL DEFAULT '{}',
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "microsoft_mailboxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_identities" (
    "id" UUID NOT NULL,
    "app_user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "raw_profile" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_links" (
    "id" UUID NOT NULL,
    "google_user_id" UUID NOT NULL,
    "app_user_id" UUID NOT NULL,
    "link_type" TEXT NOT NULL DEFAULT 'AUTO_EMAIL',
    "confidence" TEXT NOT NULL DEFAULT 'EXACT',
    "verified_by" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_requests" (
    "id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "entity_email" TEXT NOT NULL,
    "service_type" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'MBOX',
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "requested_by" TEXT,
    "criteria" JSONB NOT NULL DEFAULT '{}',
    "date_range_start" TIMESTAMP(3),
    "date_range_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backup_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_exports" (
    "id" UUID NOT NULL,
    "backup_request_id" UUID NOT NULL,
    "matter_id" TEXT NOT NULL,
    "export_id" TEXT NOT NULL,
    "provider_status" TEXT NOT NULL,
    "provider_stats" JSONB NOT NULL DEFAULT '{}',
    "remote_ready_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backup_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_artifacts" (
    "id" UUID NOT NULL,
    "backup_request_id" UUID NOT NULL,
    "relative_path" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "stored_filename" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL DEFAULT 0,
    "sha256" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "origin" TEXT NOT NULL DEFAULT 'VAULT_EXPORT',
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backup_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_files" (
    "id" UUID NOT NULL,
    "backup_artifact_id" UUID NOT NULL,
    "relative_path" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL DEFAULT 0,
    "sha256" TEXT,
    "mime_type" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_events" (
    "id" UUID NOT NULL,
    "backup_request_id" UUID NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "error_details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_archives" (
    "id" UUID NOT NULL,
    "backup_request_id" UUID NOT NULL,
    "total_spaces" INTEGER NOT NULL DEFAULT 0,
    "total_messages" INTEGER NOT NULL DEFAULT 0,
    "total_attachments" INTEGER NOT NULL DEFAULT 0,
    "processed_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_archives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_spaces" (
    "id" UUID NOT NULL,
    "chat_archive_id" UUID,
    "provider_space_id" TEXT,
    "display_name" TEXT NOT NULL,
    "space_type" TEXT NOT NULL DEFAULT 'SPACE',
    "raw_metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_threads" (
    "id" UUID NOT NULL,
    "chat_space_id" UUID NOT NULL,
    "provider_thread_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "chat_space_id" UUID NOT NULL,
    "chat_thread_id" UUID,
    "provider_message_id" TEXT,
    "source_hash" TEXT NOT NULL,
    "sender_id" TEXT,
    "sender_name" TEXT,
    "sender_email" TEXT,
    "text" TEXT,
    "formatted_text" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL,
    "edited_at" TIMESTAMP(3),
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "reply_to_id" TEXT,
    "raw_metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_message_participants" (
    "id" UUID NOT NULL,
    "chat_message_id" UUID NOT NULL,
    "user_email" TEXT NOT NULL,
    "display_name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'PARTICIPANT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_attachments" (
    "id" UUID NOT NULL,
    "chat_message_id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "relative_path" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL DEFAULT 0,
    "sha256" TEXT,
    "mime_type" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "scan_status" TEXT NOT NULL DEFAULT 'CLEAN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_user_access" (
    "id" UUID NOT NULL,
    "chat_message_id" UUID NOT NULL,
    "app_user_id" UUID NOT NULL,
    "granted_via" TEXT NOT NULL DEFAULT 'PARTICIPANT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_user_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_mappings" (
    "id" UUID NOT NULL,
    "source_group_id" UUID NOT NULL,
    "source_group_email" TEXT NOT NULL,
    "target_mailbox_id" UUID NOT NULL,
    "target_email" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'MANUAL',
    "is_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmed_by" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "migration_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_jobs" (
    "id" UUID NOT NULL,
    "source_group_id" UUID,
    "source_group_email" TEXT NOT NULL,
    "target_mailbox_id" UUID,
    "target_mailbox_email" TEXT NOT NULL,
    "backup_request_id" UUID,
    "backup_artifact_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'PREPARING',
    "total_items" INTEGER NOT NULL DEFAULT 0,
    "valid_items" INTEGER NOT NULL DEFAULT 0,
    "duplicate_items" INTEGER NOT NULL DEFAULT 0,
    "imported_items" INTEGER NOT NULL DEFAULT 0,
    "skipped_items" INTEGER NOT NULL DEFAULT 0,
    "failed_items" INTEGER NOT NULL DEFAULT 0,
    "purview_job_id" TEXT,
    "purview_mapping_csv_path" TEXT,
    "azcopy_status" TEXT,
    "report_path" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "migration_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_items" (
    "id" UUID NOT NULL,
    "migration_job_id" UUID NOT NULL,
    "source_message_id" TEXT,
    "source_hash" TEXT NOT NULL,
    "dedup_key" TEXT NOT NULL,
    "date_utc" TIMESTAMP(3),
    "subject" TEXT,
    "from_addr" TEXT,
    "to_addrs" TEXT,
    "size_bytes" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "target_message_id" TEXT,
    "error_message" TEXT,
    "imported_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_events" (
    "id" UUID NOT NULL,
    "migration_job_id" UUID NOT NULL,
    "step" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "background_jobs" (
    "id" UUID NOT NULL,
    "queue_name" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "provider" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_connections_provider_key" ON "integration_connections"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "google_users_provider_id_key" ON "google_users"("provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "google_users_primary_email_key" ON "google_users"("primary_email");

-- CreateIndex
CREATE INDEX "google_users_primary_email_idx" ON "google_users"("primary_email");

-- CreateIndex
CREATE INDEX "google_users_suspended_idx" ON "google_users"("suspended");

-- CreateIndex
CREATE UNIQUE INDEX "google_user_aliases_alias_email_key" ON "google_user_aliases"("alias_email");

-- CreateIndex
CREATE INDEX "google_user_aliases_alias_email_idx" ON "google_user_aliases"("alias_email");

-- CreateIndex
CREATE UNIQUE INDEX "google_groups_provider_id_key" ON "google_groups"("provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "google_groups_email_key" ON "google_groups"("email");

-- CreateIndex
CREATE INDEX "google_groups_email_idx" ON "google_groups"("email");

-- CreateIndex
CREATE UNIQUE INDEX "google_group_aliases_alias_email_key" ON "google_group_aliases"("alias_email");

-- CreateIndex
CREATE INDEX "google_group_aliases_alias_email_idx" ON "google_group_aliases"("alias_email");

-- CreateIndex
CREATE INDEX "google_group_members_google_group_id_email_idx" ON "google_group_members"("google_group_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "microsoft_users_provider_id_key" ON "microsoft_users"("provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "microsoft_users_user_principal_name_key" ON "microsoft_users"("user_principal_name");

-- CreateIndex
CREATE INDEX "microsoft_users_user_principal_name_idx" ON "microsoft_users"("user_principal_name");

-- CreateIndex
CREATE INDEX "microsoft_users_mail_idx" ON "microsoft_users"("mail");

-- CreateIndex
CREATE UNIQUE INDEX "microsoft_mailboxes_provider_mailbox_id_key" ON "microsoft_mailboxes"("provider_mailbox_id");

-- CreateIndex
CREATE UNIQUE INDEX "microsoft_mailboxes_primary_smtp_address_key" ON "microsoft_mailboxes"("primary_smtp_address");

-- CreateIndex
CREATE INDEX "microsoft_mailboxes_primary_smtp_address_idx" ON "microsoft_mailboxes"("primary_smtp_address");

-- CreateIndex
CREATE INDEX "microsoft_mailboxes_recipient_type_idx" ON "microsoft_mailboxes"("recipient_type");

-- CreateIndex
CREATE UNIQUE INDEX "app_users_email_key" ON "app_users"("email");

-- CreateIndex
CREATE INDEX "app_users_email_idx" ON "app_users"("email");

-- CreateIndex
CREATE INDEX "app_users_role_idx" ON "app_users"("role");

-- CreateIndex
CREATE INDEX "external_identities_email_idx" ON "external_identities"("email");

-- CreateIndex
CREATE UNIQUE INDEX "external_identities_provider_subject_id_key" ON "external_identities"("provider", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "identity_links_google_user_id_app_user_id_key" ON "identity_links"("google_user_id", "app_user_id");

-- CreateIndex
CREATE INDEX "backup_requests_entity_email_idx" ON "backup_requests"("entity_email");

-- CreateIndex
CREATE INDEX "backup_requests_service_type_idx" ON "backup_requests"("service_type");

-- CreateIndex
CREATE INDEX "backup_requests_status_idx" ON "backup_requests"("status");

-- CreateIndex
CREATE INDEX "backup_exports_backup_request_id_idx" ON "backup_exports"("backup_request_id");

-- CreateIndex
CREATE INDEX "backup_exports_export_id_idx" ON "backup_exports"("export_id");

-- CreateIndex
CREATE INDEX "backup_artifacts_backup_request_id_idx" ON "backup_artifacts"("backup_request_id");

-- CreateIndex
CREATE INDEX "backup_artifacts_sha256_idx" ON "backup_artifacts"("sha256");

-- CreateIndex
CREATE INDEX "backup_files_backup_artifact_id_idx" ON "backup_files"("backup_artifact_id");

-- CreateIndex
CREATE INDEX "backup_events_backup_request_id_idx" ON "backup_events"("backup_request_id");

-- CreateIndex
CREATE INDEX "chat_archives_backup_request_id_idx" ON "chat_archives"("backup_request_id");

-- CreateIndex
CREATE INDEX "chat_spaces_provider_space_id_idx" ON "chat_spaces"("provider_space_id");

-- CreateIndex
CREATE INDEX "chat_spaces_space_type_idx" ON "chat_spaces"("space_type");

-- CreateIndex
CREATE INDEX "chat_threads_chat_space_id_idx" ON "chat_threads"("chat_space_id");

-- CreateIndex
CREATE INDEX "chat_threads_provider_thread_id_idx" ON "chat_threads"("provider_thread_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_source_hash_key" ON "chat_messages"("source_hash");

-- CreateIndex
CREATE INDEX "chat_messages_chat_space_id_idx" ON "chat_messages"("chat_space_id");

-- CreateIndex
CREATE INDEX "chat_messages_sent_at_idx" ON "chat_messages"("sent_at");

-- CreateIndex
CREATE INDEX "chat_messages_sender_email_idx" ON "chat_messages"("sender_email");

-- CreateIndex
CREATE INDEX "chat_messages_source_hash_idx" ON "chat_messages"("source_hash");

-- CreateIndex
CREATE INDEX "chat_message_participants_chat_message_id_idx" ON "chat_message_participants"("chat_message_id");

-- CreateIndex
CREATE INDEX "chat_message_participants_user_email_idx" ON "chat_message_participants"("user_email");

-- CreateIndex
CREATE INDEX "chat_attachments_chat_message_id_idx" ON "chat_attachments"("chat_message_id");

-- CreateIndex
CREATE INDEX "chat_user_access_app_user_id_idx" ON "chat_user_access"("app_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_user_access_chat_message_id_app_user_id_key" ON "chat_user_access"("chat_message_id", "app_user_id");

-- CreateIndex
CREATE INDEX "migration_mappings_source_group_email_idx" ON "migration_mappings"("source_group_email");

-- CreateIndex
CREATE INDEX "migration_mappings_target_email_idx" ON "migration_mappings"("target_email");

-- CreateIndex
CREATE UNIQUE INDEX "migration_mappings_source_group_id_target_mailbox_id_key" ON "migration_mappings"("source_group_id", "target_mailbox_id");

-- CreateIndex
CREATE INDEX "migration_jobs_source_group_email_idx" ON "migration_jobs"("source_group_email");

-- CreateIndex
CREATE INDEX "migration_jobs_target_mailbox_email_idx" ON "migration_jobs"("target_mailbox_email");

-- CreateIndex
CREATE INDEX "migration_jobs_status_idx" ON "migration_jobs"("status");

-- CreateIndex
CREATE INDEX "migration_items_migration_job_id_status_idx" ON "migration_items"("migration_job_id", "status");

-- CreateIndex
CREATE INDEX "migration_items_dedup_key_idx" ON "migration_items"("dedup_key");

-- CreateIndex
CREATE UNIQUE INDEX "migration_items_migration_job_id_source_hash_key" ON "migration_items"("migration_job_id", "source_hash");

-- CreateIndex
CREATE INDEX "migration_events_migration_job_id_idx" ON "migration_events"("migration_job_id");

-- CreateIndex
CREATE INDEX "background_jobs_queue_name_status_idx" ON "background_jobs"("queue_name", "status");

-- CreateIndex
CREATE INDEX "background_jobs_job_type_idx" ON "background_jobs"("job_type");

-- CreateIndex
CREATE INDEX "audit_events_action_idx" ON "audit_events"("action");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_idx" ON "audit_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "google_user_aliases" ADD CONSTRAINT "google_user_aliases_google_user_id_fkey" FOREIGN KEY ("google_user_id") REFERENCES "google_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_group_aliases" ADD CONSTRAINT "google_group_aliases_google_group_id_fkey" FOREIGN KEY ("google_group_id") REFERENCES "google_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_group_members" ADD CONSTRAINT "google_group_members_google_group_id_fkey" FOREIGN KEY ("google_group_id") REFERENCES "google_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_links" ADD CONSTRAINT "identity_links_google_user_id_fkey" FOREIGN KEY ("google_user_id") REFERENCES "google_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_links" ADD CONSTRAINT "identity_links_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_requests" ADD CONSTRAINT "fk_backup_user" FOREIGN KEY ("entity_id") REFERENCES "google_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_requests" ADD CONSTRAINT "fk_backup_group" FOREIGN KEY ("entity_id") REFERENCES "google_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_exports" ADD CONSTRAINT "backup_exports_backup_request_id_fkey" FOREIGN KEY ("backup_request_id") REFERENCES "backup_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_artifacts" ADD CONSTRAINT "backup_artifacts_backup_request_id_fkey" FOREIGN KEY ("backup_request_id") REFERENCES "backup_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_files" ADD CONSTRAINT "backup_files_backup_artifact_id_fkey" FOREIGN KEY ("backup_artifact_id") REFERENCES "backup_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_events" ADD CONSTRAINT "backup_events_backup_request_id_fkey" FOREIGN KEY ("backup_request_id") REFERENCES "backup_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_archives" ADD CONSTRAINT "chat_archives_backup_request_id_fkey" FOREIGN KEY ("backup_request_id") REFERENCES "backup_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_spaces" ADD CONSTRAINT "chat_spaces_chat_archive_id_fkey" FOREIGN KEY ("chat_archive_id") REFERENCES "chat_archives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_chat_space_id_fkey" FOREIGN KEY ("chat_space_id") REFERENCES "chat_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chat_space_id_fkey" FOREIGN KEY ("chat_space_id") REFERENCES "chat_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chat_thread_id_fkey" FOREIGN KEY ("chat_thread_id") REFERENCES "chat_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message_participants" ADD CONSTRAINT "chat_message_participants_chat_message_id_fkey" FOREIGN KEY ("chat_message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_chat_message_id_fkey" FOREIGN KEY ("chat_message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_user_access" ADD CONSTRAINT "chat_user_access_chat_message_id_fkey" FOREIGN KEY ("chat_message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_user_access" ADD CONSTRAINT "chat_user_access_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_mappings" ADD CONSTRAINT "migration_mappings_source_group_id_fkey" FOREIGN KEY ("source_group_id") REFERENCES "google_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_mappings" ADD CONSTRAINT "migration_mappings_target_mailbox_id_fkey" FOREIGN KEY ("target_mailbox_id") REFERENCES "microsoft_mailboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_jobs" ADD CONSTRAINT "migration_jobs_source_group_id_fkey" FOREIGN KEY ("source_group_id") REFERENCES "google_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_jobs" ADD CONSTRAINT "migration_jobs_target_mailbox_id_fkey" FOREIGN KEY ("target_mailbox_id") REFERENCES "microsoft_mailboxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_jobs" ADD CONSTRAINT "migration_jobs_backup_request_id_fkey" FOREIGN KEY ("backup_request_id") REFERENCES "backup_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_jobs" ADD CONSTRAINT "migration_jobs_backup_artifact_id_fkey" FOREIGN KEY ("backup_artifact_id") REFERENCES "backup_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_items" ADD CONSTRAINT "migration_items_migration_job_id_fkey" FOREIGN KEY ("migration_job_id") REFERENCES "migration_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "migration_events" ADD CONSTRAINT "migration_events_migration_job_id_fkey" FOREIGN KEY ("migration_job_id") REFERENCES "migration_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
