CREATE TABLE `bp_audit` (
	`audit_id` text PRIMARY KEY NOT NULL,
	`entity_kind` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`before` text,
	`after` text,
	`source_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "bp_audit_action_check" CHECK("bp_audit"."action" in ('INSERT', 'UPDATE', 'DELETE'))
);
--> statement-breakpoint
CREATE INDEX `bp_audit_entity_idx` ON `bp_audit` (`entity_kind`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `bp_audit_action_idx` ON `bp_audit` (`action`,`created_at`);--> statement-breakpoint
CREATE INDEX `bp_audit_source_idx` ON `bp_audit` (`source_id`,`created_at`);--> statement-breakpoint
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
	CONSTRAINT "bp_book_testament_check" CHECK("bp_book"."testament" in ('OT', 'NT')),
	CONSTRAINT "bp_book_book_id_check" CHECK(length("bp_book"."book_id") between 2 and 8),
	CONSTRAINT "bp_book_name_check" CHECK(length("bp_book"."name") > 0),
	CONSTRAINT "bp_book_name_short_check" CHECK(length("bp_book"."name_short") > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bp_book_ordinal_uniq` ON `bp_book` (`ordinal`);--> statement-breakpoint
CREATE TABLE `bp_chapter` (
	`book_id` text NOT NULL,
	`chapter` integer NOT NULL,
	`chapter_ord` integer,
	`start_verse_ord` integer NOT NULL,
	`end_verse_ord` integer NOT NULL,
	`verse_count` integer NOT NULL,
	PRIMARY KEY(`book_id`, `chapter`),
	CONSTRAINT "bp_chapter_chapter_check" CHECK("bp_chapter"."chapter" >= 1),
	CONSTRAINT "bp_chapter_chapter_ord_check" CHECK("bp_chapter"."chapter_ord" is null or "bp_chapter"."chapter_ord" >= 1),
	CONSTRAINT "bp_chapter_verse_count_check" CHECK("bp_chapter"."verse_count" >= 1),
	CONSTRAINT "bp_chapter_span_check" CHECK("bp_chapter"."start_verse_ord" <= "bp_chapter"."end_verse_ord")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bp_chapter_chapter_ord_uniq` ON `bp_chapter` (`chapter_ord`);--> statement-breakpoint
CREATE INDEX `bp_chapter_range_idx` ON `bp_chapter` (`book_id`,`start_verse_ord`,`end_verse_ord`);--> statement-breakpoint
CREATE TABLE `bp_crossref` (
	`crossref_id` text PRIMARY KEY NOT NULL,
	`from_range_id` text NOT NULL,
	`to_range_id` text NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`confidence` real,
	`note_neutral` text,
	CONSTRAINT "bp_crossref_kind_check" CHECK("bp_crossref"."kind" in ('PARALLEL', 'QUOTE', 'ALLUSION', 'TOPICAL')),
	CONSTRAINT "bp_crossref_conf_check" CHECK("bp_crossref"."confidence" is null or ("bp_crossref"."confidence" >= 0 and "bp_crossref"."confidence" <= 1)),
	CONSTRAINT "bp_crossref_not_self_check" CHECK(not ("bp_crossref"."from_range_id" = "bp_crossref"."to_range_id" and "bp_crossref"."kind" = 'PARALLEL'))
);
--> statement-breakpoint
CREATE INDEX `bp_crossref_from_idx` ON `bp_crossref` (`from_range_id`,`kind`);--> statement-breakpoint
CREATE INDEX `bp_crossref_to_idx` ON `bp_crossref` (`to_range_id`,`kind`);--> statement-breakpoint
CREATE INDEX `bp_crossref_kind_idx` ON `bp_crossref` (`kind`);--> statement-breakpoint
CREATE TABLE `bp_doc_unit` (
	`unit_id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`range_id` text NOT NULL,
	`source` text NOT NULL,
	`confidence` real,
	`ordinal` integer,
	`parent_unit_id` text,
	CONSTRAINT "bp_doc_unit_kind_check" CHECK("bp_doc_unit"."kind" in ('SECTION', 'SPEECH', 'SONG', 'LETTER_PART', 'NARRATIVE_BLOCK')),
	CONSTRAINT "bp_doc_unit_conf_check" CHECK("bp_doc_unit"."confidence" is null or ("bp_doc_unit"."confidence" >= 0 and "bp_doc_unit"."confidence" <= 1)),
	CONSTRAINT "bp_doc_unit_ordinal_check" CHECK("bp_doc_unit"."ordinal" is null or "bp_doc_unit"."ordinal" >= 0),
	CONSTRAINT "bp_doc_unit_not_self_check" CHECK("bp_doc_unit"."parent_unit_id" is null or "bp_doc_unit"."parent_unit_id" <> "bp_doc_unit"."unit_id")
);
--> statement-breakpoint
CREATE INDEX `bp_doc_unit_range_idx` ON `bp_doc_unit` (`range_id`);--> statement-breakpoint
CREATE INDEX `bp_doc_unit_ord_idx` ON `bp_doc_unit` (`ordinal`);--> statement-breakpoint
CREATE INDEX `bp_doc_unit_parent_idx` ON `bp_doc_unit` (`parent_unit_id`);--> statement-breakpoint
CREATE TABLE `bp_entity` (
	`entity_id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`canonical_name` text NOT NULL,
	`slug` text NOT NULL,
	`summary_neutral` text,
	`confidence` real,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "bp_entity_kind_check" CHECK("bp_entity"."kind" in ('PERSON', 'PLACE', 'GROUP', 'DYNASTY', 'EMPIRE', 'REGION', 'ARTIFACT', 'OFFICE')),
	CONSTRAINT "bp_entity_conf_check" CHECK("bp_entity"."confidence" is null or ("bp_entity"."confidence" >= 0 and "bp_entity"."confidence" <= 1)),
	CONSTRAINT "bp_entity_name_check" CHECK(length("bp_entity"."canonical_name") > 0),
	CONSTRAINT "bp_entity_slug_check" CHECK(length("bp_entity"."slug") > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bp_entity_slug_uniq` ON `bp_entity` (`slug`);--> statement-breakpoint
CREATE INDEX `bp_entity_name_idx` ON `bp_entity` (`canonical_name`);--> statement-breakpoint
CREATE INDEX `bp_entity_kind_idx` ON `bp_entity` (`kind`);--> statement-breakpoint
CREATE TABLE `bp_entity_name` (
	`entity_name_id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`name` text NOT NULL,
	`name_norm` text NOT NULL,
	`language` text,
	`is_primary` integer DEFAULT false NOT NULL,
	`source` text,
	`confidence` real,
	CONSTRAINT "bp_entity_name_conf_check" CHECK("bp_entity_name"."confidence" is null or ("bp_entity_name"."confidence" >= 0 and "bp_entity_name"."confidence" <= 1)),
	CONSTRAINT "bp_entity_name_name_check" CHECK(length("bp_entity_name"."name") > 0),
	CONSTRAINT "bp_entity_name_name_norm_check" CHECK(length("bp_entity_name"."name_norm") >= 0)
);
--> statement-breakpoint
CREATE INDEX `bp_entity_name_norm_idx` ON `bp_entity_name` (`name_norm`);--> statement-breakpoint
CREATE INDEX `bp_entity_name_entity_idx` ON `bp_entity_name` (`entity_id`,`is_primary`);--> statement-breakpoint
CREATE TABLE `bp_entity_relation` (
	`relation_id` text PRIMARY KEY NOT NULL,
	`from_entity_id` text NOT NULL,
	`to_entity_id` text NOT NULL,
	`kind` text NOT NULL,
	`time_span_id` text,
	`source` text NOT NULL,
	`confidence` real,
	`note_neutral` text,
	CONSTRAINT "bp_entity_relation_kind_check" CHECK("bp_entity_relation"."kind" in ('PARENT_OF', 'CHILD_OF', 'SPOUSE_OF', 'SIBLING_OF', 'RULES_OVER', 'MEMBER_OF', 'ALLY_OF', 'ENEMY_OF', 'SUCCEEDS')),
	CONSTRAINT "bp_entity_relation_not_self" CHECK(not ("bp_entity_relation"."from_entity_id" = "bp_entity_relation"."to_entity_id")),
	CONSTRAINT "bp_entity_relation_conf_check" CHECK("bp_entity_relation"."confidence" is null or ("bp_entity_relation"."confidence" >= 0 and "bp_entity_relation"."confidence" <= 1))
);
--> statement-breakpoint
CREATE INDEX `bp_entity_relation_from_idx` ON `bp_entity_relation` (`from_entity_id`,`kind`);--> statement-breakpoint
CREATE INDEX `bp_entity_relation_to_idx` ON `bp_entity_relation` (`to_entity_id`,`kind`);--> statement-breakpoint
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
	`summary_neutral` text,
	CONSTRAINT "bp_event_kind_check" CHECK("bp_event"."kind" in ('BIRTH', 'DEATH', 'BATTLE', 'COVENANT', 'EXODUS', 'MIGRATION', 'SPEECH', 'MIRACLE', 'PROPHECY', 'CAPTIVITY', 'RETURN', 'CRUCIFIXION', 'RESURRECTION', 'MISSION_JOURNEY', 'COUNCIL', 'LETTER_WRITTEN', 'OTHER')),
	CONSTRAINT "bp_event_conf_check" CHECK("bp_event"."confidence" is null or ("bp_event"."confidence" >= 0 and "bp_event"."confidence" <= 1)),
	CONSTRAINT "bp_event_title_check" CHECK(length("bp_event"."canonical_title") > 0)
);
--> statement-breakpoint
CREATE INDEX `bp_event_kind_idx` ON `bp_event` (`kind`);--> statement-breakpoint
CREATE INDEX `bp_event_range_idx` ON `bp_event` (`primary_range_id`);--> statement-breakpoint
CREATE INDEX `bp_event_place_idx` ON `bp_event` (`primary_place_id`);--> statement-breakpoint
CREATE INDEX `bp_event_time_idx` ON `bp_event` (`time_span_id`);--> statement-breakpoint
CREATE TABLE `bp_event_participant` (
	`event_participant_id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`role` text NOT NULL,
	`confidence` real,
	CONSTRAINT "bp_event_participant_role_check" CHECK("bp_event_participant"."role" in ('SUBJECT', 'AGENT', 'WITNESS', 'OPPONENT', 'RULER', 'PEOPLE', 'OTHER')),
	CONSTRAINT "bp_event_participant_conf_check" CHECK("bp_event_participant"."confidence" is null or ("bp_event_participant"."confidence" >= 0 and "bp_event_participant"."confidence" <= 1))
);
--> statement-breakpoint
CREATE INDEX `bp_event_participant_event_idx` ON `bp_event_participant` (`event_id`);--> statement-breakpoint
CREATE INDEX `bp_event_participant_entity_idx` ON `bp_event_participant` (`entity_id`);--> statement-breakpoint
CREATE INDEX `bp_event_participant_role_idx` ON `bp_event_participant` (`role`);--> statement-breakpoint
CREATE TABLE `bp_link` (
	`link_id` text PRIMARY KEY NOT NULL,
	`range_id` text NOT NULL,
	`target_kind` text NOT NULL,
	`target_id` text NOT NULL,
	`link_kind` text NOT NULL,
	`weight` integer DEFAULT 1 NOT NULL,
	`source` text NOT NULL,
	`confidence` real,
	CONSTRAINT "bp_link_target_kind_check" CHECK("bp_link"."target_kind" in ('ENTITY', 'EVENT', 'ROUTE', 'PLACE_GEO')),
	CONSTRAINT "bp_link_link_kind_check" CHECK("bp_link"."link_kind" in ('MENTIONS', 'PRIMARY_SUBJECT', 'LOCATION', 'SETTING', 'JOURNEY_STEP', 'PARALLEL_ACCOUNT', 'QUOTE_SOURCE', 'QUOTE_TARGET')),
	CONSTRAINT "bp_link_weight_check" CHECK("bp_link"."weight" >= 1),
	CONSTRAINT "bp_link_conf_check" CHECK("bp_link"."confidence" is null or ("bp_link"."confidence" >= 0 and "bp_link"."confidence" <= 1))
);
--> statement-breakpoint
CREATE INDEX `bp_link_range_idx` ON `bp_link` (`range_id`,`link_kind`);--> statement-breakpoint
CREATE INDEX `bp_link_target_idx` ON `bp_link` (`target_kind`,`target_id`);--> statement-breakpoint
CREATE INDEX `bp_link_kind_idx` ON `bp_link` (`link_kind`);--> statement-breakpoint
CREATE TABLE `bp_paragraph` (
	`paragraph_id` text PRIMARY KEY NOT NULL,
	`translation_id` text NOT NULL,
	`range_id` text NOT NULL,
	`style` text NOT NULL,
	`indent` integer DEFAULT 0 NOT NULL,
	`source` text NOT NULL,
	`source_revision` text,
	`ordinal` integer,
	CONSTRAINT "bp_paragraph_style_check" CHECK("bp_paragraph"."style" in ('PROSE', 'POETRY', 'LIST', 'QUOTE', 'LETTER')),
	CONSTRAINT "bp_paragraph_indent_check" CHECK("bp_paragraph"."indent" >= 0),
	CONSTRAINT "bp_paragraph_ordinal_check" CHECK("bp_paragraph"."ordinal" is null or "bp_paragraph"."ordinal" >= 0)
);
--> statement-breakpoint
CREATE INDEX `bp_paragraph_range_idx` ON `bp_paragraph` (`translation_id`,`range_id`);--> statement-breakpoint
CREATE INDEX `bp_paragraph_ord_idx` ON `bp_paragraph` (`translation_id`,`ordinal`);--> statement-breakpoint
CREATE TABLE `bp_pericope` (
	`pericope_id` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`range_id` text NOT NULL,
	`title` text NOT NULL,
	`source` text NOT NULL,
	`confidence` real,
	`rank` integer,
	`source_revision` text,
	CONSTRAINT "bp_pericope_rank_check" CHECK("bp_pericope"."rank" is null or "bp_pericope"."rank" >= 0),
	CONSTRAINT "bp_pericope_conf_check" CHECK("bp_pericope"."confidence" is null or ("bp_pericope"."confidence" >= 0 and "bp_pericope"."confidence" <= 1)),
	CONSTRAINT "bp_pericope_title_check" CHECK(length("bp_pericope"."title") > 0)
);
--> statement-breakpoint
CREATE INDEX `bp_pericope_book_idx` ON `bp_pericope` (`book_id`,`rank`);--> statement-breakpoint
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
	CONSTRAINT "bp_place_geo_type_check" CHECK("bp_place_geo"."geo_type" in ('POINT', 'BBOX', 'REGION_POLYGON')),
	CONSTRAINT "bp_place_geo_lat_check" CHECK("bp_place_geo"."lat" is null or ("bp_place_geo"."lat" >= -90 and "bp_place_geo"."lat" <= 90)),
	CONSTRAINT "bp_place_geo_lng_check" CHECK("bp_place_geo"."lng" is null or ("bp_place_geo"."lng" >= -180 and "bp_place_geo"."lng" <= 180)),
	CONSTRAINT "bp_place_geo_precision_check" CHECK("bp_place_geo"."precision_m" is null or "bp_place_geo"."precision_m" >= 0),
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
	`verse_count` integer,
	`chapter_count` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "bp_range_span_check" CHECK("bp_range"."start_verse_ord" <= "bp_range"."end_verse_ord"),
	CONSTRAINT "bp_range_verse_count_check" CHECK("bp_range"."verse_count" is null or "bp_range"."verse_count" >= 1),
	CONSTRAINT "bp_range_chapter_count_check" CHECK("bp_range"."chapter_count" is null or "bp_range"."chapter_count" >= 1)
);
--> statement-breakpoint
CREATE INDEX `bp_range_ord_idx` ON `bp_range` (`start_verse_ord`,`end_verse_ord`);--> statement-breakpoint
CREATE INDEX `bp_range_start_key_idx` ON `bp_range` (`start_verse_key`,`end_verse_key`);--> statement-breakpoint
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
	CONSTRAINT "bp_reader_event_type_check" CHECK("bp_reader_event"."event_type" in ('VIEW_VERSE', 'VIEW_CHAPTER', 'SCROLL_BACK', 'COPY_TEXT', 'OPEN_ENTITY', 'OPEN_MAP', 'OPEN_TIMELINE', 'SEARCH')),
	CONSTRAINT "bp_reader_event_duration_check" CHECK("bp_reader_event"."duration_ms" is null or "bp_reader_event"."duration_ms" >= 0)
);
--> statement-breakpoint
CREATE INDEX `bp_reader_event_anon_idx` ON `bp_reader_event` (`anon_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `bp_reader_event_type_idx` ON `bp_reader_event` (`event_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `bp_reader_event_verse_idx` ON `bp_reader_event` (`translation_id`,`verse_key`,`created_at`);--> statement-breakpoint
CREATE TABLE `bp_route` (
	`route_id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`source` text NOT NULL,
	`confidence` real,
	`summary_neutral` text,
	CONSTRAINT "bp_route_conf_check" CHECK("bp_route"."confidence" is null or ("bp_route"."confidence" >= 0 and "bp_route"."confidence" <= 1)),
	CONSTRAINT "bp_route_title_check" CHECK(length("bp_route"."title") > 0)
);
--> statement-breakpoint
CREATE INDEX `bp_route_title_idx` ON `bp_route` (`title`);--> statement-breakpoint
CREATE TABLE `bp_route_step` (
	`route_step_id` text PRIMARY KEY NOT NULL,
	`route_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`place_entity_id` text NOT NULL,
	`range_id` text,
	`note_neutral` text,
	`distance_km` real,
	CONSTRAINT "bp_route_step_ord_check" CHECK("bp_route_step"."ordinal" >= 1),
	CONSTRAINT "bp_route_step_distance_check" CHECK("bp_route_step"."distance_km" is null or "bp_route_step"."distance_km" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bp_route_step_ord_uniq` ON `bp_route_step` (`route_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `bp_route_step_route_idx` ON `bp_route_step` (`route_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `bp_route_step_place_idx` ON `bp_route_step` (`place_entity_id`);--> statement-breakpoint
CREATE TABLE `bp_search_query_log` (
	`query_id` text PRIMARY KEY NOT NULL,
	`anon_id` text,
	`query` text NOT NULL,
	`query_norm` text NOT NULL,
	`translation_id` text,
	`hits` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "bp_search_query_log_hits_check" CHECK("bp_search_query_log"."hits" >= 0),
	CONSTRAINT "bp_search_query_log_query_check" CHECK(length("bp_search_query_log"."query") > 0)
);
--> statement-breakpoint
CREATE INDEX `bp_search_query_log_norm_idx` ON `bp_search_query_log` (`query_norm`);--> statement-breakpoint
CREATE INDEX `bp_search_query_log_created_idx` ON `bp_search_query_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `bp_search_query_log_translation_idx` ON `bp_search_query_log` (`translation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `bp_source` (
	`source_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`version` text,
	`url` text,
	`license` text,
	`notes` text,
	CONSTRAINT "bp_source_kind_check" CHECK("bp_source"."kind" in ('IMPORT', 'MANUAL', 'DATASET')),
	CONSTRAINT "bp_source_name_check" CHECK(length("bp_source"."name") > 0)
);
--> statement-breakpoint
CREATE INDEX `bp_source_name_idx` ON `bp_source` (`name`);--> statement-breakpoint
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
	CONSTRAINT "bp_time_span_calendar_check" CHECK("bp_time_span"."calendar" in ('BCE_CE', 'ANNO_MUNDI')),
	CONSTRAINT "bp_time_span_era_check" CHECK("bp_time_span"."era_tag" is null or "bp_time_span"."era_tag" in ('PRIMEVAL', 'PATRIARCHS', 'EXODUS_WILDERNESS', 'CONQUEST_JUDGES', 'UNITED_MONARCHY', 'DIVIDED_KINGDOM', 'EXILE', 'SECOND_TEMPLE', 'GOSPELS', 'APOSTOLIC')),
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
	CONSTRAINT "bp_timeline_anchor_kind_check" CHECK("bp_timeline_anchor"."kind" in ('SETTING', 'EVENT_WINDOW', 'REIGN', 'JOURNEY_WINDOW')),
	CONSTRAINT "bp_timeline_anchor_conf_check" CHECK("bp_timeline_anchor"."confidence" is null or ("bp_timeline_anchor"."confidence" >= 0 and "bp_timeline_anchor"."confidence" <= 1))
);
--> statement-breakpoint
CREATE INDEX `bp_timeline_anchor_range_idx` ON `bp_timeline_anchor` (`range_id`);--> statement-breakpoint
CREATE INDEX `bp_timeline_anchor_time_idx` ON `bp_timeline_anchor` (`time_span_id`);--> statement-breakpoint
CREATE INDEX `bp_timeline_anchor_kind_idx` ON `bp_timeline_anchor` (`kind`);--> statement-breakpoint
CREATE TABLE `bp_token` (
	`translation_id` text NOT NULL,
	`verse_key` text NOT NULL,
	`token_index` integer NOT NULL,
	`token` text NOT NULL,
	`token_norm` text NOT NULL,
	`token_kind` text DEFAULT 'WORD' NOT NULL,
	`char_start` integer NOT NULL,
	`char_end` integer NOT NULL,
	`is_word_like` integer DEFAULT true NOT NULL,
	`break_after` integer DEFAULT false NOT NULL,
	`surface_group` integer,
	`line_ordinal` integer,
	`hash` text,
	PRIMARY KEY(`translation_id`, `verse_key`, `token_index`),
	CONSTRAINT "bp_token_token_check" CHECK(length("bp_token"."token") > 0),
	CONSTRAINT "bp_token_norm_check" CHECK(length("bp_token"."token_norm") >= 0),
	CONSTRAINT "bp_token_token_index_check" CHECK("bp_token"."token_index" >= 0),
	CONSTRAINT "bp_token_kind_check" CHECK("bp_token"."token_kind" in ('WORD', 'PUNCT', 'SPACE', 'LINEBREAK', 'MARKER', 'NUMBER', 'SYMBOL')),
	CONSTRAINT "bp_token_char_start_check" CHECK("bp_token"."char_start" >= 0),
	CONSTRAINT "bp_token_char_end_check" CHECK("bp_token"."char_end" > "bp_token"."char_start"),
	CONSTRAINT "bp_token_surface_group_check" CHECK("bp_token"."surface_group" is null or "bp_token"."surface_group" >= 0),
	CONSTRAINT "bp_token_line_ordinal_check" CHECK("bp_token"."line_ordinal" is null or "bp_token"."line_ordinal" >= 0)
);
--> statement-breakpoint
CREATE INDEX `bp_token_idx` ON `bp_token` (`translation_id`,`verse_key`,`token_index`);--> statement-breakpoint
CREATE INDEX `bp_token_norm_idx` ON `bp_token` (`token_norm`);--> statement-breakpoint
CREATE INDEX `bp_token_char_idx` ON `bp_token` (`translation_id`,`verse_key`,`char_start`,`char_end`);--> statement-breakpoint
CREATE INDEX `bp_token_kind_idx` ON `bp_token` (`translation_id`,`token_kind`);--> statement-breakpoint
CREATE TABLE `bp_token_span` (
	`translation_id` text NOT NULL,
	`verse_key` text NOT NULL,
	`span_id` text NOT NULL,
	`start_token_index` integer NOT NULL,
	`end_token_index` integer NOT NULL,
	`char_start` integer NOT NULL,
	`char_end` integer NOT NULL,
	`text` text,
	`hash` text,
	PRIMARY KEY(`translation_id`, `verse_key`, `span_id`),
	CONSTRAINT "bp_token_span_start_check" CHECK("bp_token_span"."start_token_index" >= 0),
	CONSTRAINT "bp_token_span_end_check" CHECK("bp_token_span"."end_token_index" >= "bp_token_span"."start_token_index"),
	CONSTRAINT "bp_token_span_char_start_check" CHECK("bp_token_span"."char_start" >= 0),
	CONSTRAINT "bp_token_span_char_end_check" CHECK("bp_token_span"."char_end" > "bp_token_span"."char_start")
);
--> statement-breakpoint
CREATE INDEX `bp_token_span_idx` ON `bp_token_span` (`translation_id`,`verse_key`,`start_token_index`,`end_token_index`);--> statement-breakpoint
CREATE INDEX `bp_token_span_char_idx` ON `bp_token_span` (`translation_id`,`verse_key`,`char_start`,`char_end`);--> statement-breakpoint
CREATE TABLE `bp_translation` (
	`translation_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`language` text NOT NULL,
	`derived_from` text,
	`license_kind` text NOT NULL,
	`license_text` text,
	`source_url` text,
	`publisher` text,
	`edition_label` text,
	`abbreviation` text,
	`normalization_form` text DEFAULT 'SIMPLE' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`is_public` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "bp_translation_license_kind_check" CHECK("bp_translation"."license_kind" in ('PUBLIC_DOMAIN', 'LICENSED', 'CUSTOM')),
	CONSTRAINT "bp_translation_normalization_form_check" CHECK("bp_translation"."normalization_form" in ('NONE', 'SIMPLE', 'SEARCH_V1')),
	CONSTRAINT "bp_translation_id_check" CHECK(length("bp_translation"."translation_id") > 0),
	CONSTRAINT "bp_translation_name_check" CHECK(length("bp_translation"."name") > 0),
	CONSTRAINT "bp_translation_language_check" CHECK(length("bp_translation"."language") >= 2)
);
--> statement-breakpoint
CREATE INDEX `bp_translation_name_idx` ON `bp_translation` (`name`);--> statement-breakpoint
CREATE INDEX `bp_translation_public_idx` ON `bp_translation` (`is_public`,`is_default`);--> statement-breakpoint
CREATE TABLE `bp_verse` (
	`verse_key` text PRIMARY KEY NOT NULL,
	`book_id` text NOT NULL,
	`chapter` integer NOT NULL,
	`verse` integer NOT NULL,
	`verse_ord` integer NOT NULL,
	`chapter_ord` integer,
	`is_superscription` integer DEFAULT false NOT NULL,
	`is_deuterocanon` integer DEFAULT false NOT NULL,
	`source_book_ordinal` integer,
	`source_chapter_ordinal` integer,
	`source_verse_ordinal` integer,
	CONSTRAINT "bp_verse_chapter_check" CHECK("bp_verse"."chapter" >= 1),
	CONSTRAINT "bp_verse_verse_check" CHECK("bp_verse"."verse" >= 1),
	CONSTRAINT "bp_verse_ord_check" CHECK("bp_verse"."verse_ord" >= 1),
	CONSTRAINT "bp_verse_source_book_ordinal_check" CHECK("bp_verse"."source_book_ordinal" is null or "bp_verse"."source_book_ordinal" >= 1),
	CONSTRAINT "bp_verse_source_chapter_ordinal_check" CHECK("bp_verse"."source_chapter_ordinal" is null or "bp_verse"."source_chapter_ordinal" >= 1),
	CONSTRAINT "bp_verse_source_verse_ordinal_check" CHECK("bp_verse"."source_verse_ordinal" is null or "bp_verse"."source_verse_ordinal" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bp_verse_ord_uniq` ON `bp_verse` (`verse_ord`);--> statement-breakpoint
CREATE UNIQUE INDEX `bp_verse_bcv_uniq` ON `bp_verse` (`book_id`,`chapter`,`verse`);--> statement-breakpoint
CREATE INDEX `bp_verse_book_idx` ON `bp_verse` (`book_id`,`chapter`,`verse`);--> statement-breakpoint
CREATE INDEX `bp_verse_chapter_ord_idx` ON `bp_verse` (`chapter_ord`,`verse_ord`);--> statement-breakpoint
CREATE TABLE `bp_verse_text` (
	`translation_id` text NOT NULL,
	`verse_key` text NOT NULL,
	`text` text NOT NULL,
	`text_norm` text,
	`hash` text,
	`text_length` integer,
	`token_count` integer,
	`word_count` integer,
	`source` text,
	`source_revision` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`translation_id`, `verse_key`),
	CONSTRAINT "bp_verse_text_text_check" CHECK(length("bp_verse_text"."text") > 0),
	CONSTRAINT "bp_verse_text_length_check" CHECK("bp_verse_text"."text_length" is null or "bp_verse_text"."text_length" >= 0),
	CONSTRAINT "bp_verse_text_token_count_check" CHECK("bp_verse_text"."token_count" is null or "bp_verse_text"."token_count" >= 0),
	CONSTRAINT "bp_verse_text_word_count_check" CHECK("bp_verse_text"."word_count" is null or "bp_verse_text"."word_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `bp_verse_text_idx` ON `bp_verse_text` (`translation_id`,`verse_key`);--> statement-breakpoint
CREATE INDEX `bp_verse_text_updated_idx` ON `bp_verse_text` (`updated_at`);--> statement-breakpoint
CREATE INDEX `bp_verse_text_hash_idx` ON `bp_verse_text` (`hash`);--> statement-breakpoint
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
	FOREIGN KEY (`user_id`) REFERENCES `bp_user`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "bp_auth_account_id_check" CHECK(length("bp_auth_account"."id") > 0),
	CONSTRAINT "bp_auth_account_user_id_check" CHECK(length("bp_auth_account"."user_id") > 0),
	CONSTRAINT "bp_auth_account_provider_check" CHECK(length("bp_auth_account"."provider") > 0),
	CONSTRAINT "bp_auth_account_provider_user_id_check" CHECK(length("bp_auth_account"."provider_user_id") > 0),
	CONSTRAINT "bp_auth_account_chronology_check" CHECK("bp_auth_account"."updated_at" >= "bp_auth_account"."created_at"),
	CONSTRAINT "bp_auth_account_access_token_expires_check" CHECK("bp_auth_account"."access_token_expires_at" is null or "bp_auth_account"."access_token_expires_at" >= "bp_auth_account"."created_at"),
	CONSTRAINT "bp_auth_account_scope_check" CHECK("bp_auth_account"."scope" is null or length(trim("bp_auth_account"."scope")) > 0)
);
--> statement-breakpoint
CREATE INDEX `bp_auth_account_user_idx` ON `bp_auth_account` (`user_id`);--> statement-breakpoint
CREATE INDEX `bp_auth_account_provider_lookup_idx` ON `bp_auth_account` (`provider`,`provider_user_id`);--> statement-breakpoint
CREATE INDEX `bp_auth_account_access_exp_idx` ON `bp_auth_account` (`access_token_expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `bp_auth_account_provider_uq` ON `bp_auth_account` (`provider`,`provider_user_id`);--> statement-breakpoint
CREATE TABLE `bp_session` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`user_id` text NOT NULL,
	`ip` text,
	`ua` text,
	FOREIGN KEY (`user_id`) REFERENCES `bp_user`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "bp_session_id_check" CHECK(length("bp_session"."id") > 0),
	CONSTRAINT "bp_session_user_id_check" CHECK(length("bp_session"."user_id") > 0),
	CONSTRAINT "bp_session_expires_check" CHECK("bp_session"."expires_at" > "bp_session"."created_at"),
	CONSTRAINT "bp_session_ip_check" CHECK("bp_session"."ip" is null or length(trim("bp_session"."ip")) > 0),
	CONSTRAINT "bp_session_ua_check" CHECK("bp_session"."ua" is null or length(trim("bp_session"."ua")) > 0)
);
--> statement-breakpoint
CREATE INDEX `bp_session_user_idx` ON `bp_session` (`user_id`);--> statement-breakpoint
CREATE INDEX `bp_session_user_exp_idx` ON `bp_session` (`user_id`,`expires_at`);--> statement-breakpoint
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
	CONSTRAINT "bp_user_email_check" CHECK("bp_user"."email" is null or length(trim("bp_user"."email")) >= 3),
	CONSTRAINT "bp_user_display_name_check" CHECK("bp_user"."display_name" is null or length(trim("bp_user"."display_name")) > 0),
	CONSTRAINT "bp_user_chronology_check" CHECK("bp_user"."updated_at" >= "bp_user"."created_at"),
	CONSTRAINT "bp_user_email_verified_check" CHECK("bp_user"."email_verified_at" is null or "bp_user"."email_verified_at" >= "bp_user"."created_at"),
	CONSTRAINT "bp_user_disabled_check" CHECK("bp_user"."disabled_at" is null or "bp_user"."disabled_at" >= "bp_user"."created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bp_user_email_uq` ON `bp_user` (`email`);--> statement-breakpoint
CREATE INDEX `bp_user_updated_idx` ON `bp_user` (`updated_at`);--> statement-breakpoint
CREATE INDEX `bp_user_email_idx` ON `bp_user` (`email`);--> statement-breakpoint
CREATE INDEX `bp_user_disabled_idx` ON `bp_user` (`disabled_at`);--> statement-breakpoint
CREATE TABLE `bp_annotation` (
	`annotation_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`rev` integer DEFAULT 1 NOT NULL,
	`idempotency_key` text,
	`created_device_id` text,
	`updated_device_id` text,
	`client_created_at` integer,
	`client_updated_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`collection_id` text,
	`title` text,
	`color` text,
	`opacity` real,
	`palette_id` text,
	`style_json` text,
	`note_text` text,
	`note_format` text,
	`note_html` text,
	`text_search` text,
	`sort_ordinal` integer,
	FOREIGN KEY (`user_id`) REFERENCES `bp_user`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`collection_id`) REFERENCES `bp_annotation_collection`(`collection_id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "bp_annotation_kind_check" CHECK("bp_annotation"."kind" in ('HIGHLIGHT','NOTE','INK','BOOKMARK')),
	CONSTRAINT "bp_annotation_rev_check" CHECK("bp_annotation"."rev" >= 1),
	CONSTRAINT "bp_annotation_opacity_check" CHECK("bp_annotation"."opacity" is null or ("bp_annotation"."opacity" >= 0 and "bp_annotation"."opacity" <= 1)),
	CONSTRAINT "bp_annotation_id_check" CHECK(length("bp_annotation"."annotation_id") > 0),
	CONSTRAINT "bp_annotation_user_id_check" CHECK(length("bp_annotation"."user_id") > 0),
	CONSTRAINT "bp_annotation_note_format_check" CHECK("bp_annotation"."note_format" is null or "bp_annotation"."note_format" in ('plain','md')),
	CONSTRAINT "bp_annotation_sort_check" CHECK("bp_annotation"."sort_ordinal" is null or "bp_annotation"."sort_ordinal" >= 0),
	CONSTRAINT "bp_annotation_chronology_check" CHECK("bp_annotation"."updated_at" >= "bp_annotation"."created_at"),
	CONSTRAINT "bp_annotation_client_chronology_check" CHECK("bp_annotation"."client_created_at" is null or "bp_annotation"."client_updated_at" is null or "bp_annotation"."client_updated_at" >= "bp_annotation"."client_created_at"),
	CONSTRAINT "bp_annotation_deleted_chronology_check" CHECK("bp_annotation"."deleted_at" is null or "bp_annotation"."deleted_at" >= "bp_annotation"."created_at"),
	CONSTRAINT "bp_annotation_note_payload_check" CHECK(
                "bp_annotation"."kind" != 'NOTE'
                or "bp_annotation"."note_text" is not null
                or "bp_annotation"."note_html" is not null
                or "bp_annotation"."title" is not null
            )
);
--> statement-breakpoint
CREATE INDEX `bp_annotation_user_idx` ON `bp_annotation` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `bp_annotation_user_kind_idx` ON `bp_annotation` (`user_id`,`kind`,`updated_at`);--> statement-breakpoint
CREATE INDEX `bp_annotation_user_collection_idx` ON `bp_annotation` (`user_id`,`collection_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `bp_annotation_updated_idx` ON `bp_annotation` (`updated_at`);--> statement-breakpoint
CREATE INDEX `bp_annotation_deleted_idx` ON `bp_annotation` (`deleted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `bp_annotation_idem_uq` ON `bp_annotation` (`user_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `bp_annotation_attachment` (
	`attachment_id` text PRIMARY KEY NOT NULL,
	`annotation_id` text NOT NULL,
	`kind` text NOT NULL,
	`mime` text,
	`byte_size` integer,
	`storage_key` text NOT NULL,
	`original_name` text,
	`sha256` text,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`annotation_id`) REFERENCES `bp_annotation`(`annotation_id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "bp_annotation_attachment_id_check" CHECK(length("bp_annotation_attachment"."attachment_id") > 0),
	CONSTRAINT "bp_annotation_attachment_kind_check" CHECK(length("bp_annotation_attachment"."kind") > 0),
	CONSTRAINT "bp_annotation_attachment_storage_check" CHECK(length("bp_annotation_attachment"."storage_key") > 0),
	CONSTRAINT "bp_annotation_attachment_size_check" CHECK("bp_annotation_attachment"."byte_size" is null or "bp_annotation_attachment"."byte_size" >= 0),
	CONSTRAINT "bp_annotation_attachment_deleted_chronology_check" CHECK("bp_annotation_attachment"."deleted_at" is null or "bp_annotation_attachment"."deleted_at" >= "bp_annotation_attachment"."created_at")
);
--> statement-breakpoint
CREATE INDEX `bp_annotation_attachment_ann_idx` ON `bp_annotation_attachment` (`annotation_id`);--> statement-breakpoint
CREATE INDEX `bp_annotation_attachment_kind_idx` ON `bp_annotation_attachment` (`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `bp_annotation_attachment_storage_uq` ON `bp_annotation_attachment` (`storage_key`);--> statement-breakpoint
CREATE TABLE `bp_annotation_collection` (
	`collection_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`name_norm` text NOT NULL,
	`description` text,
	`color` text,
	`icon` text,
	`sort_ordinal` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `bp_user`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "bp_annotation_collection_id_check" CHECK(length("bp_annotation_collection"."collection_id") > 0),
	CONSTRAINT "bp_annotation_collection_name_check" CHECK(length("bp_annotation_collection"."name") > 0),
	CONSTRAINT "bp_annotation_collection_name_norm_check" CHECK(length("bp_annotation_collection"."name_norm") > 0),
	CONSTRAINT "bp_annotation_collection_sort_check" CHECK("bp_annotation_collection"."sort_ordinal" is null or "bp_annotation_collection"."sort_ordinal" >= 0),
	CONSTRAINT "bp_annotation_collection_chronology_check" CHECK("bp_annotation_collection"."updated_at" >= "bp_annotation_collection"."created_at"),
	CONSTRAINT "bp_annotation_collection_deleted_chronology_check" CHECK("bp_annotation_collection"."deleted_at" is null or "bp_annotation_collection"."deleted_at" >= "bp_annotation_collection"."created_at")
);
--> statement-breakpoint
CREATE INDEX `bp_annotation_collection_user_idx` ON `bp_annotation_collection` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `bp_annotation_collection_user_sort_idx` ON `bp_annotation_collection` (`user_id`,`sort_ordinal`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `bp_annotation_collection_name_uq` ON `bp_annotation_collection` (`user_id`,`name_norm`);--> statement-breakpoint
CREATE TABLE `bp_annotation_event` (
	`event_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`annotation_id` text,
	`annotation_rev` integer,
	`kind` text NOT NULL,
	`at` integer NOT NULL,
	`client_at` integer,
	`device_id` text,
	`idempotency_key` text,
	`stroke_id` text,
	`label_id` text,
	`collection_id` text,
	`payload_json` text,
	FOREIGN KEY (`user_id`) REFERENCES `bp_user`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "bp_annotation_event_kind_check" CHECK("bp_annotation_event"."kind" in (
                'CREATE','UPDATE','DELETE','RESTORE',
                'ADD_STROKE','DEL_STROKE',
                'ADD_LABEL','DEL_LABEL',
                'MOVE_COLLECTION'
            )),
	CONSTRAINT "bp_annotation_event_rev_check" CHECK("bp_annotation_event"."annotation_rev" is null or "bp_annotation_event"."annotation_rev" >= 1)
);
--> statement-breakpoint
CREATE INDEX `bp_annotation_event_user_idx` ON `bp_annotation_event` (`user_id`,`at`);--> statement-breakpoint
CREATE INDEX `bp_annotation_event_ann_idx` ON `bp_annotation_event` (`annotation_id`,`at`);--> statement-breakpoint
CREATE INDEX `bp_annotation_event_kind_idx` ON `bp_annotation_event` (`kind`,`at`);--> statement-breakpoint
CREATE INDEX `bp_annotation_event_ann_rev_idx` ON `bp_annotation_event` (`annotation_id`,`annotation_rev`);--> statement-breakpoint
CREATE TABLE `bp_annotation_ink_stroke` (
	`stroke_id` text PRIMARY KEY NOT NULL,
	`annotation_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`tool` text DEFAULT 'PEN' NOT NULL,
	`storage_mode` text DEFAULT 'INLINE' NOT NULL,
	`palette_id` text,
	`color` text,
	`opacity` real,
	`width` real,
	`brush_json` text,
	`min_x` real,
	`min_y` real,
	`max_x` real,
	`max_y` real,
	`point_count` integer,
	`points_json` text,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`annotation_id`) REFERENCES `bp_annotation`(`annotation_id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "bp_annotation_ink_storage_mode_check" CHECK("bp_annotation_ink_stroke"."storage_mode" in ('INLINE','CHUNKED')),
	CONSTRAINT "bp_annotation_ink_tool_check" CHECK("bp_annotation_ink_stroke"."tool" in ('PEN','HIGHLIGHTER','ERASER')),
	CONSTRAINT "bp_annotation_ink_ord_check" CHECK("bp_annotation_ink_stroke"."ordinal" >= 1),
	CONSTRAINT "bp_annotation_ink_opacity_check" CHECK("bp_annotation_ink_stroke"."opacity" is null or ("bp_annotation_ink_stroke"."opacity" >= 0 and "bp_annotation_ink_stroke"."opacity" <= 1)),
	CONSTRAINT "bp_annotation_ink_width_check" CHECK("bp_annotation_ink_stroke"."width" is null or "bp_annotation_ink_stroke"."width" >= 0),
	CONSTRAINT "bp_annotation_ink_point_count_check" CHECK("bp_annotation_ink_stroke"."point_count" is null or "bp_annotation_ink_stroke"."point_count" >= 0),
	CONSTRAINT "bp_annotation_ink_min_x_check" CHECK("bp_annotation_ink_stroke"."min_x" is null or ("bp_annotation_ink_stroke"."min_x" >= 0 and "bp_annotation_ink_stroke"."min_x" <= 1)),
	CONSTRAINT "bp_annotation_ink_min_y_check" CHECK("bp_annotation_ink_stroke"."min_y" is null or ("bp_annotation_ink_stroke"."min_y" >= 0 and "bp_annotation_ink_stroke"."min_y" <= 1)),
	CONSTRAINT "bp_annotation_ink_max_x_check" CHECK("bp_annotation_ink_stroke"."max_x" is null or ("bp_annotation_ink_stroke"."max_x" >= 0 and "bp_annotation_ink_stroke"."max_x" <= 1)),
	CONSTRAINT "bp_annotation_ink_max_y_check" CHECK("bp_annotation_ink_stroke"."max_y" is null or ("bp_annotation_ink_stroke"."max_y" >= 0 and "bp_annotation_ink_stroke"."max_y" <= 1)),
	CONSTRAINT "bp_annotation_ink_bbox_order_check" CHECK(
                (
                    "bp_annotation_ink_stroke"."min_x" is null and "bp_annotation_ink_stroke"."min_y" is null and "bp_annotation_ink_stroke"."max_x" is null and "bp_annotation_ink_stroke"."max_y" is null
                ) or (
                "bp_annotation_ink_stroke"."min_x" is not null and "bp_annotation_ink_stroke"."min_y" is not null and "bp_annotation_ink_stroke"."max_x" is not null and "bp_annotation_ink_stroke"."max_y" is not null
                and "bp_annotation_ink_stroke"."min_x" <= "bp_annotation_ink_stroke"."max_x"
                and "bp_annotation_ink_stroke"."min_y" <= "bp_annotation_ink_stroke"."max_y"
                )
            ),
	CONSTRAINT "bp_annotation_ink_storage_payload_check" CHECK(
                    ("bp_annotation_ink_stroke"."storage_mode" = 'INLINE' and "bp_annotation_ink_stroke"."points_json" is not null)
                    or ("bp_annotation_ink_stroke"."storage_mode" = 'CHUNKED' and "bp_annotation_ink_stroke"."points_json" is null)
            ),
	CONSTRAINT "bp_annotation_ink_deleted_chronology_check" CHECK("bp_annotation_ink_stroke"."deleted_at" is null or "bp_annotation_ink_stroke"."deleted_at" >= "bp_annotation_ink_stroke"."created_at")
);
--> statement-breakpoint
CREATE INDEX `bp_annotation_ink_ann_idx` ON `bp_annotation_ink_stroke` (`annotation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bp_annotation_ink_ord_uq` ON `bp_annotation_ink_stroke` (`annotation_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `bp_annotation_ink_deleted_idx` ON `bp_annotation_ink_stroke` (`annotation_id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `bp_annotation_ink_stroke_chunk` (
	`stroke_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`points_json` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`stroke_id`, `chunk_index`),
	FOREIGN KEY (`stroke_id`) REFERENCES `bp_annotation_ink_stroke`(`stroke_id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "bp_annotation_ink_stroke_chunk_check" CHECK("bp_annotation_ink_stroke_chunk"."chunk_index" >= 0),
	CONSTRAINT "bp_annotation_ink_stroke_chunk_points_check" CHECK(length("bp_annotation_ink_stroke_chunk"."points_json") > 0)
);
--> statement-breakpoint
CREATE INDEX `bp_annotation_ink_stroke_chunk_idx` ON `bp_annotation_ink_stroke_chunk` (`stroke_id`);--> statement-breakpoint
CREATE TABLE `bp_annotation_label` (
	`label_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`name_norm` text NOT NULL,
	`color` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `bp_user`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "bp_annotation_label_id_check" CHECK(length("bp_annotation_label"."label_id") > 0),
	CONSTRAINT "bp_annotation_label_name_check" CHECK(length("bp_annotation_label"."name") > 0),
	CONSTRAINT "bp_annotation_label_name_norm_check" CHECK(length("bp_annotation_label"."name_norm") > 0),
	CONSTRAINT "bp_annotation_label_chronology_check" CHECK("bp_annotation_label"."updated_at" >= "bp_annotation_label"."created_at"),
	CONSTRAINT "bp_annotation_label_deleted_chronology_check" CHECK("bp_annotation_label"."deleted_at" is null or "bp_annotation_label"."deleted_at" >= "bp_annotation_label"."created_at")
);
--> statement-breakpoint
CREATE INDEX `bp_annotation_label_user_idx` ON `bp_annotation_label` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `bp_annotation_label_norm_uq` ON `bp_annotation_label` (`user_id`,`name_norm`);--> statement-breakpoint
CREATE TABLE `bp_annotation_label_link` (
	`annotation_id` text NOT NULL,
	`label_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`annotation_id`, `label_id`),
	FOREIGN KEY (`annotation_id`) REFERENCES `bp_annotation`(`annotation_id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `bp_annotation_label`(`label_id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bp_annotation_label_link_ann_idx` ON `bp_annotation_label_link` (`annotation_id`);--> statement-breakpoint
CREATE INDEX `bp_annotation_label_link_label_idx` ON `bp_annotation_label_link` (`label_id`);--> statement-breakpoint
CREATE TABLE `bp_annotation_palette` (
	`palette_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`name_norm` text NOT NULL,
	`color` text NOT NULL,
	`opacity` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `bp_user`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "bp_annotation_palette_kind_check" CHECK("bp_annotation_palette"."kind" in ('HIGHLIGHT','INK','TAG')),
	CONSTRAINT "bp_annotation_palette_id_check" CHECK(length("bp_annotation_palette"."palette_id") > 0),
	CONSTRAINT "bp_annotation_palette_name_check" CHECK(length("bp_annotation_palette"."name") > 0),
	CONSTRAINT "bp_annotation_palette_name_norm_check" CHECK(length("bp_annotation_palette"."name_norm") > 0),
	CONSTRAINT "bp_annotation_palette_color_check" CHECK(length("bp_annotation_palette"."color") >= 4),
	CONSTRAINT "bp_annotation_palette_opacity_check" CHECK("bp_annotation_palette"."opacity" is null or ("bp_annotation_palette"."opacity" >= 0 and "bp_annotation_palette"."opacity" <= 1)),
	CONSTRAINT "bp_annotation_palette_chronology_check" CHECK("bp_annotation_palette"."updated_at" >= "bp_annotation_palette"."created_at"),
	CONSTRAINT "bp_annotation_palette_deleted_chronology_check" CHECK("bp_annotation_palette"."deleted_at" is null or "bp_annotation_palette"."deleted_at" >= "bp_annotation_palette"."created_at")
);
--> statement-breakpoint
CREATE INDEX `bp_annotation_palette_user_idx` ON `bp_annotation_palette` (`user_id`,`kind`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `bp_annotation_palette_name_uq` ON `bp_annotation_palette` (`user_id`,`kind`,`name_norm`);--> statement-breakpoint
CREATE TABLE `bp_annotation_share` (
	`share_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`privacy` text DEFAULT 'PRIVATE' NOT NULL,
	`scope` text DEFAULT 'ANNOTATIONS' NOT NULL,
	`share_slug` text,
	`collection_id` text,
	`title` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `bp_user`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`collection_id`) REFERENCES `bp_annotation_collection`(`collection_id`) ON UPDATE cascade ON DELETE set null,
	CONSTRAINT "bp_annotation_share_privacy_check" CHECK("bp_annotation_share"."privacy" in ('PRIVATE','SHARED_LINK','PUBLIC')),
	CONSTRAINT "bp_annotation_share_scope_check" CHECK("bp_annotation_share"."scope" in ('ANNOTATIONS','COLLECTION')),
	CONSTRAINT "bp_annotation_share_chronology_check" CHECK("bp_annotation_share"."updated_at" >= "bp_annotation_share"."created_at"),
	CONSTRAINT "bp_annotation_share_revoked_chronology_check" CHECK("bp_annotation_share"."revoked_at" is null or "bp_annotation_share"."revoked_at" >= "bp_annotation_share"."created_at"),
	CONSTRAINT "bp_annotation_share_collection_scope_check" CHECK("bp_annotation_share"."scope" != 'COLLECTION' or "bp_annotation_share"."collection_id" is not null)
);
--> statement-breakpoint
CREATE INDEX `bp_annotation_share_user_idx` ON `bp_annotation_share` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `bp_annotation_share_slug_uq` ON `bp_annotation_share` (`share_slug`);--> statement-breakpoint
CREATE TABLE `bp_annotation_share_item` (
	`share_id` text NOT NULL,
	`annotation_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`share_id`, `annotation_id`),
	FOREIGN KEY (`share_id`) REFERENCES `bp_annotation_share`(`share_id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`annotation_id`) REFERENCES `bp_annotation`(`annotation_id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "bp_annotation_share_item_ord_check" CHECK("bp_annotation_share_item"."ordinal" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bp_annotation_share_item_ord_uq` ON `bp_annotation_share_item` (`share_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `bp_annotation_share_item_ann_idx` ON `bp_annotation_share_item` (`annotation_id`);--> statement-breakpoint
CREATE TABLE `bp_annotation_span` (
	`annotation_id` text NOT NULL,
	`span_ordinal` integer NOT NULL,
	`anchor_kind` text DEFAULT 'RANGE' NOT NULL,
	`translation_id` text,
	`start_verse_ord` integer NOT NULL,
	`end_verse_ord` integer NOT NULL,
	`start_verse_key` text,
	`end_verse_key` text,
	`start_token_index` integer,
	`end_token_index` integer,
	`start_char_offset` integer,
	`end_char_offset` integer,
	`selected_text` text,
	`selected_text_hash` text,
	`selection_version` integer,
	`pin_x` real,
	`pin_y` real,
	PRIMARY KEY(`annotation_id`, `span_ordinal`),
	FOREIGN KEY (`annotation_id`) REFERENCES `bp_annotation`(`annotation_id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "bp_annotation_span_anchor_kind_check" CHECK("bp_annotation_span"."anchor_kind" in ('RANGE','TOKEN_SPAN','LOCATION')),
	CONSTRAINT "bp_annotation_span_ordinal_check" CHECK("bp_annotation_span"."span_ordinal" >= 1),
	CONSTRAINT "bp_annotation_span_check" CHECK("bp_annotation_span"."start_verse_ord" <= "bp_annotation_span"."end_verse_ord"),
	CONSTRAINT "bp_annotation_span_tok_start_check" CHECK("bp_annotation_span"."start_token_index" is null or "bp_annotation_span"."start_token_index" >= 0),
	CONSTRAINT "bp_annotation_span_tok_end_check" CHECK("bp_annotation_span"."end_token_index" is null or "bp_annotation_span"."end_token_index" >= 0),
	CONSTRAINT "bp_annotation_span_char_start_check" CHECK("bp_annotation_span"."start_char_offset" is null or "bp_annotation_span"."start_char_offset" >= 0),
	CONSTRAINT "bp_annotation_span_char_end_check" CHECK("bp_annotation_span"."end_char_offset" is null or "bp_annotation_span"."end_char_offset" >= 0),
	CONSTRAINT "bp_annotation_span_token_pair_check" CHECK(("bp_annotation_span"."start_token_index" is null) = ("bp_annotation_span"."end_token_index" is null)),
	CONSTRAINT "bp_annotation_span_char_pair_check" CHECK(("bp_annotation_span"."start_char_offset" is null) = ("bp_annotation_span"."end_char_offset" is null)),
	CONSTRAINT "bp_annotation_span_token_requires_translation_check" CHECK("bp_annotation_span"."anchor_kind" != 'TOKEN_SPAN' or "bp_annotation_span"."translation_id" is not null),
	CONSTRAINT "bp_annotation_span_token_requires_tokens_check" CHECK("bp_annotation_span"."anchor_kind" != 'TOKEN_SPAN' or ("bp_annotation_span"."start_token_index" is not null and "bp_annotation_span"."end_token_index" is not null)),
	CONSTRAINT "bp_annotation_span_location_single_verse_check" CHECK("bp_annotation_span"."anchor_kind" != 'LOCATION' or "bp_annotation_span"."start_verse_ord" = "bp_annotation_span"."end_verse_ord"),
	CONSTRAINT "bp_annotation_span_same_verse_token_order_check" CHECK(
                "bp_annotation_span"."start_token_index" is null
                or "bp_annotation_span"."end_token_index" is null
                or "bp_annotation_span"."start_verse_ord" != "bp_annotation_span"."end_verse_ord"
                or "bp_annotation_span"."start_token_index" <= "bp_annotation_span"."end_token_index"
            ),
	CONSTRAINT "bp_annotation_span_same_verse_char_order_check" CHECK(
                "bp_annotation_span"."start_char_offset" is null
                or "bp_annotation_span"."end_char_offset" is null
                or "bp_annotation_span"."start_verse_ord" != "bp_annotation_span"."end_verse_ord"
                or "bp_annotation_span"."start_char_offset" <= "bp_annotation_span"."end_char_offset"
            ),
	CONSTRAINT "bp_annotation_span_selection_version_check" CHECK("bp_annotation_span"."selection_version" is null or "bp_annotation_span"."selection_version" >= 1),
	CONSTRAINT "bp_annotation_span_pin_x_check" CHECK("bp_annotation_span"."pin_x" is null or ("bp_annotation_span"."pin_x" >= 0 and "bp_annotation_span"."pin_x" <= 1)),
	CONSTRAINT "bp_annotation_span_pin_y_check" CHECK("bp_annotation_span"."pin_y" is null or ("bp_annotation_span"."pin_y" >= 0 and "bp_annotation_span"."pin_y" <= 1))
);
--> statement-breakpoint
CREATE INDEX `bp_annotation_span_ann_idx` ON `bp_annotation_span` (`annotation_id`);--> statement-breakpoint
CREATE INDEX `bp_annotation_span_ord_idx` ON `bp_annotation_span` (`start_verse_ord`,`end_verse_ord`);--> statement-breakpoint
CREATE INDEX `bp_annotation_span_trans_idx` ON `bp_annotation_span` (`translation_id`,`start_verse_ord`,`end_verse_ord`);--> statement-breakpoint
CREATE INDEX `bp_annotation_span_start_key_idx` ON `bp_annotation_span` (`translation_id`,`start_verse_key`);--> statement-breakpoint
CREATE INDEX `bp_annotation_span_end_key_idx` ON `bp_annotation_span` (`translation_id`,`end_verse_key`);--> statement-breakpoint
CREATE TABLE `bp_annotation_span_bbox` (
	`annotation_id` text NOT NULL,
	`span_ordinal` integer NOT NULL,
	`min_x` real NOT NULL,
	`min_y` real NOT NULL,
	`max_x` real NOT NULL,
	`max_y` real NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`annotation_id`, `span_ordinal`),
	FOREIGN KEY (`annotation_id`,`span_ordinal`) REFERENCES `bp_annotation_span`(`annotation_id`,`span_ordinal`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "bp_annotation_span_bbox_min_x_check" CHECK("bp_annotation_span_bbox"."min_x" >= 0 and "bp_annotation_span_bbox"."min_x" <= 1),
	CONSTRAINT "bp_annotation_span_bbox_min_y_check" CHECK("bp_annotation_span_bbox"."min_y" >= 0 and "bp_annotation_span_bbox"."min_y" <= 1),
	CONSTRAINT "bp_annotation_span_bbox_max_x_check" CHECK("bp_annotation_span_bbox"."max_x" >= 0 and "bp_annotation_span_bbox"."max_x" <= 1),
	CONSTRAINT "bp_annotation_span_bbox_max_y_check" CHECK("bp_annotation_span_bbox"."max_y" >= 0 and "bp_annotation_span_bbox"."max_y" <= 1),
	CONSTRAINT "bp_annotation_span_bbox_span_check" CHECK("bp_annotation_span_bbox"."min_x" <= "bp_annotation_span_bbox"."max_x" and "bp_annotation_span_bbox"."min_y" <= "bp_annotation_span_bbox"."max_y")
);
--> statement-breakpoint
CREATE INDEX `bp_annotation_span_bbox_idx` ON `bp_annotation_span_bbox` (`annotation_id`,`span_ordinal`);