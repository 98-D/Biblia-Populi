CREATE TABLE `bp_audit` (
	`audit_id` text PRIMARY KEY NOT NULL,
	`entity_kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`before` text,
	`after` text,
	`source_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "bp_audit_action_check" CHECK("bp_audit"."action" in ('INSERT','UPDATE','DELETE'))
);
--> statement-breakpoint
CREATE INDEX `bp_audit_entity_idx` ON `bp_audit` (`entity_kind`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `bp_book` (
	`book_id` text PRIMARY KEY NOT NULL,
	`ordinal` integer NOT NULL,
	`testament` text NOT NULL,
	`name` text NOT NULL,
	`name_short` text NOT NULL,
	`chapters` integer NOT NULL,
	`osised` text,
	`abbrs` text,
	CONSTRAINT "bp_book_ordinal_check" CHECK("bp_book"."ordinal" >= 1),
	CONSTRAINT "bp_book_chapters_check" CHECK("bp_book"."chapters" >= 1),
	CONSTRAINT "bp_book_testament_check" CHECK("bp_book"."testament" in ('OT','NT')),
	CONSTRAINT "bp_book_book_id_check" CHECK(length("bp_book"."book_id") between 2 and 8)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bp_book_ordinal_uniq` ON `bp_book` (`ordinal`);--> statement-breakpoint
CREATE TABLE `bp_chapter` (
	`book_id` text NOT NULL,
	`chapter` integer NOT NULL,
	`start_verse_ord` integer NOT NULL,
	`end_verse_ord` integer NOT NULL,
	`verse_count` integer NOT NULL,
	PRIMARY KEY(`book_id`, `chapter`),
	CONSTRAINT "bp_chapter_chapter_check" CHECK("bp_chapter"."chapter" >= 1),
	CONSTRAINT "bp_chapter_verse_count_check" CHECK("bp_chapter"."verse_count" >= 1),
	CONSTRAINT "bp_chapter_span_check" CHECK("bp_chapter"."start_verse_ord" <= "bp_chapter"."end_verse_ord")
);
--> statement-breakpoint
CREATE INDEX `bp_chapter_range_idx` ON `bp_chapter` (`book_id`,`start_verse_ord`,`end_verse_ord`);--> statement-breakpoint
CREATE TABLE `bp_crossref` (
	`crossref_id` text PRIMARY KEY NOT NULL,
	`from_range_id` text NOT NULL,
	`to_range_id` text NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`confidence` real,
	CONSTRAINT "bp_crossref_kind_check" CHECK("bp_crossref"."kind" in ('PARALLEL','QUOTE','ALLUSION','TOPICAL')),
	CONSTRAINT "bp_crossref_conf_check" CHECK("bp_crossref"."confidence" is null or ("bp_crossref"."confidence" >= 0 and "bp_crossref"."confidence" <= 1))
);
--> statement-breakpoint
CREATE INDEX `bp_crossref_from_idx` ON `bp_crossref` (`from_range_id`);--> statement-breakpoint
CREATE INDEX `bp_crossref_to_idx` ON `bp_crossref` (`to_range_id`);--> statement-breakpoint
CREATE TABLE `bp_doc_unit` (
	`unit_id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`range_id` text NOT NULL,
	`source` text NOT NULL,
	`confidence` real,
	CONSTRAINT "bp_doc_unit_kind_check" CHECK("bp_doc_unit"."kind" in ('SECTION','SPEECH','SONG','LETTER_PART','NARRATIVE_BLOCK')),
	CONSTRAINT "bp_doc_unit_conf_check" CHECK("bp_doc_unit"."confidence" is null or ("bp_doc_unit"."confidence" >= 0 and "bp_doc_unit"."confidence" <= 1))
);
--> statement-breakpoint
CREATE INDEX `bp_doc_unit_range_idx` ON `bp_doc_unit` (`range_id`);--> statement-breakpoint
CREATE TABLE `bp_entity` (
	`entity_id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`canonical_name` text NOT NULL,
	`slug` text NOT NULL,
	`summary_neutral` text,
	`confidence` real,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "bp_entity_kind_check" CHECK("bp_entity"."kind" in ('PERSON','PLACE','GROUP','DYNASTY','EMPIRE','REGION','ARTIFACT','OFFICE')),
	CONSTRAINT "bp_entity_conf_check" CHECK("bp_entity"."confidence" is null or ("bp_entity"."confidence" >= 0 and "bp_entity"."confidence" <= 1)),
	CONSTRAINT "bp_entity_name_check" CHECK(length("bp_entity"."canonical_name") > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bp_entity_slug_uniq` ON `bp_entity` (`slug`);--> statement-breakpoint
CREATE TABLE `bp_entity_name` (
	`entity_name_id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`name` text NOT NULL,
	`name_norm` text NOT NULL,
	`language` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`source` text,
	`confidence` real,
	CONSTRAINT "bp_entity_name_conf_check" CHECK("bp_entity_name"."confidence" is null or ("bp_entity_name"."confidence" >= 0 and "bp_entity_name"."confidence" <= 1))
);
--> statement-breakpoint
CREATE INDEX `bp_entity_name_norm_idx` ON `bp_entity_name` (`name_norm`);--> statement-breakpoint
CREATE INDEX `bp_entity_name_entity_idx` ON `bp_entity_name` (`entity_id`);--> statement-breakpoint
CREATE TABLE `bp_entity_relation` (
	`relation_id` text PRIMARY KEY NOT NULL,
	`from_entity_id` text NOT NULL,
	`to_entity_id` text NOT NULL,
	`kind` text NOT NULL,
	`time_span_id` text,
	`source` text NOT NULL,
	`confidence` real,
	`note_neutral` text,
	CONSTRAINT "bp_entity_relation_kind_check" CHECK("bp_entity_relation"."kind" in ('PARENT_OF','CHILD_OF','SPOUSE_OF','SIBLING_OF','RULES_OVER','MEMBER_OF','ALLY_OF','ENEMY_OF','SUCCEEDS')),
	CONSTRAINT "bp_entity_relation_not_self" CHECK(not ("bp_entity_relation"."from_entity_id" = "bp_entity_relation"."to_entity_id")),
	CONSTRAINT "bp_entity_relation_conf_check" CHECK("bp_entity_relation"."confidence" is null or ("bp_entity_relation"."confidence" >= 0 and "bp_entity_relation"."confidence" <= 1))
);
--> statement-breakpoint
CREATE INDEX `bp_entity_relation_from_idx` ON `bp_entity_relation` (`from_entity_id`);--> statement-breakpoint
CREATE INDEX `bp_entity_relation_to_idx` ON `bp_entity_relation` (`to_entity_id`);--> statement-breakpoint
CREATE INDEX `bp_entity_relation_kind_idx` ON `bp_entity_relation` (`kind`);--> statement-breakpoint
CREATE TABLE `bp_event` (
	`event_id` text PRIMARY KEY NOT NULL,
	`canonical_title` text NOT NULL,
	`kind` text NOT NULL,
	`primary_range_id` text NOT NULL,
	`time_span_id` text,
	`primary_place_id` text,
	`source` text NOT NULL,
	`confidence` real,
	CONSTRAINT "bp_event_kind_check" CHECK("bp_event"."kind" in (
    'BIRTH','DEATH','BATTLE','COVENANT','EXODUS','MIGRATION','SPEECH','MIRACLE','PROPHECY',
        'CAPTIVITY','RETURN','CRUCIFIXION','RESURRECTION','MISSION_JOURNEY','COUNCIL','LETTER_WRITTEN','OTHER'
)),
	CONSTRAINT "bp_event_conf_check" CHECK("bp_event"."confidence" is null or ("bp_event"."confidence" >= 0 and "bp_event"."confidence" <= 1))
);
--> statement-breakpoint
CREATE INDEX `bp_event_range_idx` ON `bp_event` (`primary_range_id`);--> statement-breakpoint
CREATE TABLE `bp_event_participant` (
	`event_participant_id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`role` text NOT NULL,
	`confidence` real,
	CONSTRAINT "bp_event_participant_role_check" CHECK("bp_event_participant"."role" in ('SUBJECT','AGENT','WITNESS','OPPONENT','RULER','PEOPLE','OTHER')),
	CONSTRAINT "bp_event_participant_conf_check" CHECK("bp_event_participant"."confidence" is null or ("bp_event_participant"."confidence" >= 0 and "bp_event_participant"."confidence" <= 1))
);
--> statement-breakpoint
CREATE INDEX `bp_event_participant_event_idx` ON `bp_event_participant` (`event_id`);--> statement-breakpoint
CREATE INDEX `bp_event_participant_entity_idx` ON `bp_event_participant` (`entity_id`);--> statement-breakpoint
CREATE TABLE `bp_link` (
	`link_id` text PRIMARY KEY NOT NULL,
	`range_id` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`link_kind` text NOT NULL,
	`weight` integer DEFAULT 1 NOT NULL,
	`source` text NOT NULL,
	`confidence` real,
	CONSTRAINT "bp_link_target_kind_check" CHECK("bp_link"."target_kind" in ('ENTITY','EVENT','ROUTE','PLACE_GEO')),
	CONSTRAINT "bp_link_link_kind_check" CHECK("bp_link"."link_kind" in (
    'MENTIONS','PRIMARY_SUBJECT','LOCATION','SETTING','JOURNEY_STEP',
        'PARALLEL_ACCOUNT','QUOTE_SOURCE','QUOTE_TARGET'
)),
	CONSTRAINT "bp_link_weight_check" CHECK("bp_link"."weight" >= 1),
	CONSTRAINT "bp_link_conf_check" CHECK("bp_link"."confidence" is null or ("bp_link"."confidence" >= 0 and "bp_link"."confidence" <= 1))
);
--> statement-breakpoint
CREATE INDEX `bp_link_range_idx` ON `bp_link` (`range_id`);--> statement-breakpoint
CREATE INDEX `bp_link_target_idx` ON `bp_link` (`target_kind`,`target_id`);--> statement-breakpoint
CREATE INDEX `bp_link_kind_idx` ON `bp_link` (`link_kind`);--> statement-breakpoint
CREATE TABLE `bp_paragraph` (
	`paragraph_id` text PRIMARY KEY NOT NULL,
	`translation_id` text NOT NULL,
	`range_id` text NOT NULL,
	`style` text NOT NULL,
	`indent` integer DEFAULT 0 NOT NULL,
	`source` text NOT NULL,
	CONSTRAINT "bp_paragraph_style_check" CHECK("bp_paragraph"."style" in ('PROSE','POETRY','LIST','QUOTE','LETTER')),
	CONSTRAINT "bp_paragraph_indent_check" CHECK("bp_paragraph"."indent" >= 0)
);
--> statement-breakpoint
CREATE INDEX `bp_paragraph_range_idx` ON `bp_paragraph` (`translation_id`,`range_id`);--> statement-breakpoint
CREATE TABLE `bp_pericope` (
	`pericope_id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`range_id` text NOT NULL,
	`title` text NOT NULL,
	`source` text NOT NULL,
	`confidence` real,
	`rank` integer,
	CONSTRAINT "bp_pericope_conf_check" CHECK("bp_pericope"."confidence" is null or ("bp_pericope"."confidence" >= 0 and "bp_pericope"."confidence" <= 1))
);
--> statement-breakpoint
CREATE INDEX `bp_pericope_book_idx` ON `bp_pericope` (`book_id`);--> statement-breakpoint
CREATE INDEX `bp_pericope_range_idx` ON `bp_pericope` (`range_id`);--> statement-breakpoint
CREATE TABLE `bp_place_geo` (
	`place_geo_id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`geo_type` text NOT NULL,
	`lat` real,
	`lng` real,
	`bbox` text,
	`polygon` text,
	`precision_m` real,
	`source` text NOT NULL,
	`confidence` real,
	CONSTRAINT "bp_place_geo_type_check" CHECK("bp_place_geo"."geo_type" in ('POINT','BBOX','REGION_POLYGON')),
	CONSTRAINT "bp_place_geo_conf_check" CHECK("bp_place_geo"."confidence" is null or ("bp_place_geo"."confidence" >= 0 and "bp_place_geo"."confidence" <= 1))
);
--> statement-breakpoint
CREATE INDEX `bp_place_geo_entity_idx` ON `bp_place_geo` (`entity_id`);--> statement-breakpoint
CREATE TABLE `bp_range` (
	`range_id` text PRIMARY KEY NOT NULL,
	`start_verse_ord` integer NOT NULL,
	`end_verse_ord` integer NOT NULL,
	`start_verse_key` text NOT NULL,
	`end_verse_key` text NOT NULL,
	`label` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "bp_range_span_check" CHECK("bp_range"."start_verse_ord" <= "bp_range"."end_verse_ord")
);
--> statement-breakpoint
CREATE INDEX `bp_range_ord_idx` ON `bp_range` (`start_verse_ord`,`end_verse_ord`);--> statement-breakpoint
CREATE TABLE `bp_reader_event` (
	`reader_event_id` text PRIMARY KEY NOT NULL,
	`anon_id` text NOT NULL,
	`event_type` text NOT NULL,
	`translation_id` text,
	`verse_key` text,
	`range_id` text,
	`entity_id` text,
	`duration_ms` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "bp_reader_event_type_check" CHECK("bp_reader_event"."event_type" in (
    'VIEW_VERSE','VIEW_CHAPTER','SCROLL_BACK','COPY_TEXT','OPEN_ENTITY','OPEN_MAP','OPEN_TIMELINE','SEARCH'
)),
	CONSTRAINT "bp_reader_event_duration_check" CHECK("bp_reader_event"."duration_ms" is null or "bp_reader_event"."duration_ms" >= 0)
);
--> statement-breakpoint
CREATE INDEX `bp_reader_event_anon_idx` ON `bp_reader_event` (`anon_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `bp_route` (
	`route_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`source` text NOT NULL,
	`confidence` real,
	CONSTRAINT "bp_route_conf_check" CHECK("bp_route"."confidence" is null or ("bp_route"."confidence" >= 0 and "bp_route"."confidence" <= 1))
);
--> statement-breakpoint
CREATE TABLE `bp_route_step` (
	`route_step_id` text PRIMARY KEY NOT NULL,
	`route_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`place_entity_id` text NOT NULL,
	`range_id` text,
	`note_neutral` text,
	CONSTRAINT "bp_route_step_ord_check" CHECK("bp_route_step"."ordinal" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bp_route_step_ord_uniq` ON `bp_route_step` (`route_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `bp_route_step_route_idx` ON `bp_route_step` (`route_id`);--> statement-breakpoint
CREATE TABLE `bp_search_query_log` (
	`query_id` text PRIMARY KEY NOT NULL,
	`anon_id` text,
	`query` text NOT NULL,
	`query_norm` text NOT NULL,
	`translation_id` text,
	`hits` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "bp_search_query_log_hits_check" CHECK("bp_search_query_log"."hits" >= 0)
);
--> statement-breakpoint
CREATE INDEX `bp_search_query_log_norm_idx` ON `bp_search_query_log` (`query_norm`);--> statement-breakpoint
CREATE INDEX `bp_search_query_log_created_idx` ON `bp_search_query_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `bp_source` (
	`source_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`version` text,
	`url` text,
	`license` text,
	`notes` text,
	CONSTRAINT "bp_source_kind_check" CHECK("bp_source"."kind" in ('IMPORT','MANUAL','DATASET'))
);
--> statement-breakpoint
CREATE TABLE `bp_time_span` (
	`time_span_id` text PRIMARY KEY NOT NULL,
	`start_year` integer,
	`end_year` integer,
	`start_year_min` integer,
	`start_year_max` integer,
	`end_year_min` integer,
	`end_year_max` integer,
	`calendar` text DEFAULT 'BCE_CE' NOT NULL,
	`era_tag` text,
	`source` text NOT NULL,
	`confidence` real,
	CONSTRAINT "bp_time_span_calendar_check" CHECK("bp_time_span"."calendar" in ('BCE_CE','ANNO_MUNDI')),
	CONSTRAINT "bp_time_span_era_check" CHECK("bp_time_span"."era_tag" is null or "bp_time_span"."era_tag" in (
            'PRIMEVAL','PATRIARCHS','EXODUS_WILDERNESS','CONQUEST_JUDGES','UNITED_MONARCHY',
            'DIVIDED_KINGDOM','EXILE','SECOND_TEMPLE','GOSPELS','APOSTOLIC'
            )),
	CONSTRAINT "bp_time_span_conf_check" CHECK("bp_time_span"."confidence" is null or ("bp_time_span"."confidence" >= 0 and "bp_time_span"."confidence" <= 1))
);
--> statement-breakpoint
CREATE TABLE `bp_timeline_anchor` (
	`anchor_id` text PRIMARY KEY NOT NULL,
	`range_id` text NOT NULL,
	`time_span_id` text NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`confidence` real,
	CONSTRAINT "bp_timeline_anchor_kind_check" CHECK("bp_timeline_anchor"."kind" in ('SETTING','EVENT_WINDOW','REIGN','JOURNEY_WINDOW')),
	CONSTRAINT "bp_timeline_anchor_conf_check" CHECK("bp_timeline_anchor"."confidence" is null or ("bp_timeline_anchor"."confidence" >= 0 and "bp_timeline_anchor"."confidence" <= 1))
);
--> statement-breakpoint
CREATE INDEX `bp_timeline_anchor_range_idx` ON `bp_timeline_anchor` (`range_id`);--> statement-breakpoint
CREATE INDEX `bp_timeline_anchor_time_idx` ON `bp_timeline_anchor` (`time_span_id`);--> statement-breakpoint
CREATE TABLE `bp_token` (
	`translation_id` text NOT NULL,
	`verse_key` text NOT NULL,
	`token_index` integer NOT NULL,
	`token` text NOT NULL,
	`token_norm` text NOT NULL,
	PRIMARY KEY(`translation_id`, `verse_key`, `token_index`),
	CONSTRAINT "bp_token_token_check" CHECK(length("bp_token"."token") > 0)
);
--> statement-breakpoint
CREATE INDEX `bp_token_norm_idx` ON `bp_token` (`token_norm`);--> statement-breakpoint
CREATE INDEX `bp_token_idx` ON `bp_token` (`translation_id`,`verse_key`);--> statement-breakpoint
CREATE TABLE `bp_translation` (
	`translation_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`language` text NOT NULL,
	`derived_from` text,
	`license_kind` text NOT NULL,
	`license_text` text,
	`source_url` text,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "bp_translation_license_kind_check" CHECK("bp_translation"."license_kind" in ('PUBLIC_DOMAIN','LICENSED','CUSTOM')),
	CONSTRAINT "bp_translation_id_check" CHECK(length("bp_translation"."translation_id") > 0)
);
--> statement-breakpoint
CREATE TABLE `bp_verse` (
	`verse_key` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`chapter` integer NOT NULL,
	`verse` integer NOT NULL,
	`verse_ord` integer NOT NULL,
	`chapter_ord` integer,
	`is_superscription` integer DEFAULT false NOT NULL,
	`is_deuterocanon` integer DEFAULT false NOT NULL,
	CONSTRAINT "bp_verse_chapter_check" CHECK("bp_verse"."chapter" >= 1),
	CONSTRAINT "bp_verse_verse_check" CHECK("bp_verse"."verse" >= 1),
	CONSTRAINT "bp_verse_ord_check" CHECK("bp_verse"."verse_ord" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bp_verse_ord_uniq` ON `bp_verse` (`verse_ord`);--> statement-breakpoint
CREATE UNIQUE INDEX `bp_verse_bcv_uniq` ON `bp_verse` (`book_id`,`chapter`,`verse`);--> statement-breakpoint
CREATE INDEX `bp_verse_book_idx` ON `bp_verse` (`book_id`,`chapter`,`verse`);--> statement-breakpoint
CREATE TABLE `bp_verse_text` (
	`translation_id` text NOT NULL,
	`verse_key` text NOT NULL,
	`text` text NOT NULL,
	`text_norm` text,
	`hash` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`translation_id`, `verse_key`),
	CONSTRAINT "bp_verse_text_text_check" CHECK(length("bp_verse_text"."text") > 0)
);
--> statement-breakpoint
CREATE INDEX `bp_verse_text_idx` ON `bp_verse_text` (`translation_id`,`verse_key`);