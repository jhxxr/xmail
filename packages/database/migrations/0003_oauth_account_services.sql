-- OAuth mail account <-> service bindings (mirrors mailbox_services, incl. expires_at)
CREATE TABLE IF NOT EXISTS `oauth_account_services` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`template_id` text,
	`custom_name` text,
	`custom_login_url` text,
	`custom_note` text,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `oauth_mail_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `service_templates`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX IF NOT EXISTS `idx_oauth_account_services_account` ON `oauth_account_services` (`account_id`);
