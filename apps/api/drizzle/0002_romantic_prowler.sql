CREATE TABLE `bp_auth_account` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`access_token_expires_at` integer,
	`scope` text,
	CONSTRAINT "bp_auth_account_provider_check" CHECK(length("bp_auth_account"."provider") > 0),
	CONSTRAINT "bp_auth_account_provider_user_id_check" CHECK(length("bp_auth_account"."provider_user_id") > 0),
	CONSTRAINT "bp_auth_account_user_id_check" CHECK(length("bp_auth_account"."user_id") > 0)
);
--> statement-breakpoint
CREATE INDEX `bp_auth_account_user_idx` ON `bp_auth_account` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bp_auth_account_provider_uq` ON `bp_auth_account` (`provider`,`provider_user_id`);--> statement-breakpoint
CREATE TABLE `bp_session` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`user_id` text NOT NULL,
	`ip` text,
	`ua` text,
	CONSTRAINT "bp_session_id_check" CHECK(length("bp_session"."id") > 0),
	CONSTRAINT "bp_session_user_id_check" CHECK(length("bp_session"."user_id") > 0),
	CONSTRAINT "bp_session_expires_check" CHECK("bp_session"."expires_at" > "bp_session"."created_at")
);
--> statement-breakpoint
CREATE INDEX `bp_session_user_idx` ON `bp_session` (`user_id`);--> statement-breakpoint
CREATE INDEX `bp_session_exp_idx` ON `bp_session` (`expires_at`);--> statement-breakpoint
CREATE TABLE `bp_user` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`display_name` text,
	`email` text,
	`email_verified_at` integer,
	`password_hash` text,
	`disabled_at` integer,
	CONSTRAINT "bp_user_id_check" CHECK(length("bp_user"."id") > 0),
	CONSTRAINT "bp_user_email_check" CHECK("bp_user"."email" is null or length("bp_user"."email") > 3)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bp_user_email_uq` ON `bp_user` (`email`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_bp_event` (
	`event_id` text PRIMARY KEY NOT NULL,
	`canonical_title` text NOT NULL,
	`kind` text NOT NULL,
	`primary_range_id` text NOT NULL,
	`time_span_id` text,
	`primary_place_id` text,
	`source` text NOT NULL,
	`confidence` real,
	CONSTRAINT "bp_event_kind_check" CHECK("__new_bp_event"."kind" in (
    'BIRTH','DEATH','BATTLE','COVENANT','EXODUS','MIGRATION','SPEECH','MIRACLE','PROPHECY',
    'CAPTIVITY','RETURN','CRUCIFIXION','RESURRECTION','MISSION_JOURNEY','COUNCIL','LETTER_WRITTEN','OTHER'
)),
	CONSTRAINT "bp_event_conf_check" CHECK("__new_bp_event"."confidence" is null or ("__new_bp_event"."confidence" >= 0 and "__new_bp_event"."confidence" <= 1))
);
--> statement-breakpoint
INSERT INTO `__new_bp_event`("event_id", "canonical_title", "kind", "primary_range_id", "time_span_id", "primary_place_id", "source", "confidence") SELECT "event_id", "canonical_title", "kind", "primary_range_id", "time_span_id", "primary_place_id", "source", "confidence" FROM `bp_event`;--> statement-breakpoint
DROP TABLE `bp_event`;--> statement-breakpoint
ALTER TABLE `__new_bp_event` RENAME TO `bp_event`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `bp_event_range_idx` ON `bp_event` (`primary_range_id`);--> statement-breakpoint
CREATE TABLE `__new_bp_link` (
	`link_id` text PRIMARY KEY NOT NULL,
	`range_id` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`link_kind` text NOT NULL,
	`weight` integer DEFAULT 1 NOT NULL,
	`source` text NOT NULL,
	`confidence` real,
	CONSTRAINT "bp_link_target_kind_check" CHECK("__new_bp_link"."target_kind" in ('ENTITY','EVENT','ROUTE','PLACE_GEO')),
	CONSTRAINT "bp_link_link_kind_check" CHECK("__new_bp_link"."link_kind" in (
    'MENTIONS','PRIMARY_SUBJECT','LOCATION','SETTING','JOURNEY_STEP',
    'PARALLEL_ACCOUNT','QUOTE_SOURCE','QUOTE_TARGET'
)),
	CONSTRAINT "bp_link_weight_check" CHECK("__new_bp_link"."weight" >= 1),
	CONSTRAINT "bp_link_conf_check" CHECK("__new_bp_link"."confidence" is null or ("__new_bp_link"."confidence" >= 0 and "__new_bp_link"."confidence" <= 1))
);
--> statement-breakpoint
INSERT INTO `__new_bp_link`("link_id", "range_id", "target_kind", "target_id", "link_kind", "weight", "source", "confidence") SELECT "link_id", "range_id", "target_kind", "target_id", "link_kind", "weight", "source", "confidence" FROM `bp_link`;--> statement-breakpoint
DROP TABLE `bp_link`;--> statement-breakpoint
ALTER TABLE `__new_bp_link` RENAME TO `bp_link`;--> statement-breakpoint
CREATE INDEX `bp_link_range_idx` ON `bp_link` (`range_id`);--> statement-breakpoint
CREATE INDEX `bp_link_target_idx` ON `bp_link` (`target_kind`,`target_id`);--> statement-breakpoint
CREATE INDEX `bp_link_kind_idx` ON `bp_link` (`link_kind`);