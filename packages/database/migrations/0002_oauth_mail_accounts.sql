-- OAuth mail accounts (Microsoft Graph live fetch, no email cache)
CREATE TABLE IF NOT EXISTS `oauth_mail_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`provider` text DEFAULT 'outlook' NOT NULL,
	`client_id` text NOT NULL,
	`encrypted_refresh_token` text NOT NULL,
	`encrypted_password` text,
	`share_token` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'active' NOT NULL,
	`last_error` text,
	`last_sync_at` integer,
	`refresh_token_updated_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `admins`(`id`) ON UPDATE no action ON DELETE no action
);
CREATE UNIQUE INDEX IF NOT EXISTS `oauth_mail_accounts_email_unique` ON `oauth_mail_accounts` (`email`);
CREATE UNIQUE INDEX IF NOT EXISTS `oauth_mail_accounts_share_token_unique` ON `oauth_mail_accounts` (`share_token`);
CREATE INDEX IF NOT EXISTS `idx_oauth_mail_accounts_status` ON `oauth_mail_accounts` (`status`);
