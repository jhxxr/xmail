-- Idempotent indexes for the application's high-frequency D1 queries.
CREATE INDEX IF NOT EXISTS idx_mailboxes_owner
  ON mailboxes (user_id, is_shared, deleted_at);
CREATE INDEX IF NOT EXISTS idx_mailboxes_deleted_created
  ON mailboxes (deleted_at, created_at);
CREATE INDEX IF NOT EXISTS idx_user_mailboxes_mailbox
  ON user_mailboxes (mailbox_address, user_id);

CREATE INDEX IF NOT EXISTS idx_emails_mailbox_created
  ON emails (mailbox_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_starred_created
  ON emails (is_starred, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_created
  ON emails (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_logs_created
  ON logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mailbox_services_mailbox
  ON mailbox_services (mailbox_address);
CREATE INDEX IF NOT EXISTS idx_external_accounts_provider
  ON external_accounts (provider_id);
CREATE INDEX IF NOT EXISTS idx_user_external_accounts_account
  ON user_external_accounts (account_id, user_id);
CREATE INDEX IF NOT EXISTS idx_external_account_services_account
  ON external_account_services (account_id);
