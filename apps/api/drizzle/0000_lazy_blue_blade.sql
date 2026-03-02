CREATE TABLE `asset` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`mime` text NOT NULL,
	`path` text,
	`data` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "asset_kind_check" CHECK("asset"."kind" in ('image','icon','svg')),
	CONSTRAINT "asset_mime_check" CHECK(length("asset"."mime") > 0),
	CONSTRAINT "asset_has_path_or_data_check" CHECK("asset"."path" is not null or "asset"."data" is not null)
);
--> statement-breakpoint
CREATE TABLE `bookmark` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`canon_id` text NOT NULL,
	`book_id` text NOT NULL,
	`chapter` integer NOT NULL,
	`verse` integer NOT NULL,
	`label` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "bookmark_chapter_check" CHECK("bookmark"."chapter" > 0),
	CONSTRAINT "bookmark_verse_check" CHECK("bookmark"."verse" > 0)
);
--> statement-breakpoint
CREATE INDEX `bookmark_user_idx` ON `bookmark` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `bookmark_ref_idx` ON `bookmark` (`user_id`,`canon_id`,`book_id`,`chapter`,`verse`);--> statement-breakpoint
CREATE TABLE `canon_book` (
	`canon_id` text NOT NULL,
	`book_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`name` text NOT NULL,
	`name_short` text NOT NULL,
	`testament` text NOT NULL,
	`chapters_count` integer NOT NULL,
	PRIMARY KEY(`canon_id`, `book_id`),
	CONSTRAINT "canon_book_chapters_count_check" CHECK("canon_book"."chapters_count" > 0),
	CONSTRAINT "canon_book_ordinal_check" CHECK("canon_book"."ordinal" > 0),
	CONSTRAINT "canon_book_testament_check" CHECK("canon_book"."testament" in ('OT','NT','DC')),
	CONSTRAINT "canon_book_book_id_check" CHECK(length("canon_book"."book_id") between 2 and 8)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `canon_book_unique_ordinal` ON `canon_book` (`canon_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `canon_book_testament_idx` ON `canon_book` (`canon_id`,`testament`);--> statement-breakpoint
CREATE TABLE `chapter` (
	`canon_id` text NOT NULL,
	`book_id` text NOT NULL,
	`chapter` integer NOT NULL,
	`title` text,
	`summary` text,
	PRIMARY KEY(`canon_id`, `book_id`, `chapter`),
	CONSTRAINT "chapter_chapter_check" CHECK("chapter"."chapter" > 0)
);
--> statement-breakpoint
CREATE TABLE `chrono_relation` (
	`id` text PRIMARY KEY NOT NULL,
	`from_entity_type` text NOT NULL,
	`from_entity_id` text NOT NULL,
	`to_entity_type` text NOT NULL,
	`to_entity_id` text NOT NULL,
	`kind` text NOT NULL,
	`confidence` real,
	`note` text,
	`source_doc_id` text,
	`source_ref` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "chrono_relation_kind_check" CHECK("chrono_relation"."kind" in ('before','after','during','overlaps','same_time','unknown')),
	CONSTRAINT "chrono_relation_conf_check" CHECK("chrono_relation"."confidence" is null or ("chrono_relation"."confidence" >= 0 and "chrono_relation"."confidence" <= 1)),
	CONSTRAINT "chrono_relation_not_self_check" CHECK(not ("chrono_relation"."from_entity_type" = "chrono_relation"."to_entity_type" and "chrono_relation"."from_entity_id" = "chrono_relation"."to_entity_id"))
);
--> statement-breakpoint
CREATE INDEX `chrono_relation_from_idx` ON `chrono_relation` (`from_entity_type`,`from_entity_id`,`kind`);--> statement-breakpoint
CREATE INDEX `chrono_relation_to_idx` ON `chrono_relation` (`to_entity_type`,`to_entity_id`,`kind`);--> statement-breakpoint
CREATE TABLE `chrono_span` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`kind` text NOT NULL,
	`precision` text DEFAULT 'uncertain' NOT NULL,
	`start_year` integer,
	`start_month` integer,
	`start_day` integer,
	`end_year` integer,
	`end_month` integer,
	`end_day` integer,
	`source_doc_id` text,
	`source_ref` text,
	`confidence` real,
	`note` text,
	`ord` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "chrono_span_entity_type_check" CHECK("chrono_span"."entity_type" in ('person','place','event','journey')),
	CONSTRAINT "chrono_span_kind_check" CHECK("chrono_span"."kind" in ('life','reign','ministry','journey','event_window','composition','other')),
	CONSTRAINT "chrono_span_precision_check" CHECK("chrono_span"."precision" in ('exact','approx','uncertain')),
	CONSTRAINT "chrono_span_start_month_check" CHECK("chrono_span"."start_month" is null or ("chrono_span"."start_month" >= 1 and "chrono_span"."start_month" <= 12)),
	CONSTRAINT "chrono_span_end_month_check" CHECK("chrono_span"."end_month" is null or ("chrono_span"."end_month" >= 1 and "chrono_span"."end_month" <= 12)),
	CONSTRAINT "chrono_span_start_day_check" CHECK("chrono_span"."start_day" is null or ("chrono_span"."start_day" >= 1 and "chrono_span"."start_day" <= 31)),
	CONSTRAINT "chrono_span_end_day_check" CHECK("chrono_span"."end_day" is null or ("chrono_span"."end_day" >= 1 and "chrono_span"."end_day" <= 31)),
	CONSTRAINT "chrono_span_conf_check" CHECK("chrono_span"."confidence" is null or ("chrono_span"."confidence" >= 0 and "chrono_span"."confidence" <= 1)),
	CONSTRAINT "chrono_span_ord_check" CHECK("chrono_span"."ord" >= 0)
);
--> statement-breakpoint
CREATE INDEX `chrono_span_entity_idx` ON `chrono_span` (`entity_type`,`entity_id`,`kind`,`ord`);--> statement-breakpoint
CREATE INDEX `chrono_span_kind_idx` ON `chrono_span` (`kind`);--> statement-breakpoint
CREATE INDEX `chrono_span_range_idx` ON `chrono_span` (`start_year`,`end_year`);--> statement-breakpoint
CREATE TABLE `cross_ref` (
	`id` text PRIMARY KEY NOT NULL,
	`canon_id` text NOT NULL,
	`book_id` text NOT NULL,
	`chapter` integer NOT NULL,
	`verse` integer NOT NULL,
	`to_canon_id` text NOT NULL,
	`to_book_id` text NOT NULL,
	`to_chapter` integer NOT NULL,
	`to_verse` integer NOT NULL,
	`kind` text DEFAULT 'see_also' NOT NULL,
	`note` text,
	`ord` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "cross_ref_kind_check" CHECK(length("cross_ref"."kind") > 0),
	CONSTRAINT "cross_ref_span_check" CHECK("cross_ref"."chapter" > 0 and "cross_ref"."verse" > 0 and "cross_ref"."to_chapter" > 0 and "cross_ref"."to_verse" > 0)
);
--> statement-breakpoint
CREATE INDEX `cross_ref_from_idx` ON `cross_ref` (`canon_id`,`book_id`,`chapter`,`verse`,`ord`);--> statement-breakpoint
CREATE INDEX `cross_ref_to_idx` ON `cross_ref` (`to_canon_id`,`to_book_id`,`to_chapter`,`to_verse`);--> statement-breakpoint
CREATE TABLE `drawer_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`canon_id` text,
	`book_id` text,
	`chapter` integer,
	`verse` integer,
	CONSTRAINT "drawer_history_type_check" CHECK("drawer_history"."entity_type" in ('person','place','event')),
	CONSTRAINT "drawer_history_ref_check" CHECK(("drawer_history"."chapter" is null and "drawer_history"."verse" is null) or ("drawer_history"."chapter" > 0 and "drawer_history"."verse" > 0))
);
--> statement-breakpoint
CREATE INDEX `drawer_history_user_idx` ON `drawer_history` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `drawer_history_entity_idx` ON `drawer_history` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `entity_source` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`canon_id` text NOT NULL,
	`book_id` text NOT NULL,
	`start_chapter` integer NOT NULL,
	`start_verse` integer NOT NULL,
	`end_chapter` integer NOT NULL,
	`end_verse` integer NOT NULL,
	`note` text,
	`ord` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "entity_source_type_check" CHECK("entity_source"."entity_type" in ('person','place','event')),
	CONSTRAINT "entity_source_span_check" CHECK("entity_source"."start_chapter" > 0 and "entity_source"."start_verse" > 0 and "entity_source"."end_chapter" > 0 and "entity_source"."end_verse" > 0)
);
--> statement-breakpoint
CREATE INDEX `entity_source_entity_idx` ON `entity_source` (`entity_type`,`entity_id`,`ord`);--> statement-breakpoint
CREATE INDEX `entity_source_range_idx` ON `entity_source` (`canon_id`,`book_id`,`start_chapter`,`start_verse`);--> statement-breakpoint
CREATE TABLE `event` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`place_id` text,
	`era` text,
	`time_hint` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "event_title_check" CHECK(length("event"."title") > 0)
);
--> statement-breakpoint
CREATE INDEX `event_title_idx` ON `event` (`title`);--> statement-breakpoint
CREATE INDEX `event_place_idx` ON `event` (`place_id`);--> statement-breakpoint
CREATE TABLE `event_participant` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`person_id` text NOT NULL,
	`role` text,
	`ord` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `event_participant_event_idx` ON `event_participant` (`event_id`,`ord`);--> statement-breakpoint
CREATE INDEX `event_participant_person_idx` ON `event_participant` (`person_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_participant_unique` ON `event_participant` (`event_id`,`person_id`,`role`);--> statement-breakpoint
CREATE TABLE `event_ref` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`canon_id` text NOT NULL,
	`book_id` text NOT NULL,
	`start_chapter` integer NOT NULL,
	`start_verse` integer NOT NULL,
	`end_chapter` integer NOT NULL,
	`end_verse` integer NOT NULL,
	`ord` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "event_ref_span_check" CHECK("event_ref"."start_chapter" > 0 and "event_ref"."start_verse" > 0 and "event_ref"."end_chapter" > 0 and "event_ref"."end_verse" > 0)
);
--> statement-breakpoint
CREATE INDEX `event_ref_event_idx` ON `event_ref` (`event_id`,`ord`);--> statement-breakpoint
CREATE INDEX `event_ref_range_idx` ON `event_ref` (`canon_id`,`book_id`,`start_chapter`,`start_verse`);--> statement-breakpoint
CREATE TABLE `footnote` (
	`id` text PRIMARY KEY NOT NULL,
	`translation_revision_id` text NOT NULL,
	`canon_id` text NOT NULL,
	`book_id` text NOT NULL,
	`chapter` integer NOT NULL,
	`verse` integer NOT NULL,
	`marker` text,
	`content` text NOT NULL,
	`ord` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "footnote_nonempty_check" CHECK(length("footnote"."content") > 0)
);
--> statement-breakpoint
CREATE INDEX `footnote_verse_idx` ON `footnote` (`translation_revision_id`,`canon_id`,`book_id`,`chapter`,`verse`,`ord`);--> statement-breakpoint
CREATE TABLE `highlight` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`canon_id` text NOT NULL,
	`book_id` text NOT NULL,
	`chapter` integer NOT NULL,
	`verse` integer NOT NULL,
	`start` integer,
	`end` integer,
	`color` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "highlight_color_check" CHECK("highlight"."color" in ('gray','yellow','green','blue','purple','red')),
	CONSTRAINT "highlight_span_check" CHECK(("highlight"."start" is null and "highlight"."end" is null) or ("highlight"."start" >= 0 and "highlight"."end" > "highlight"."start"))
);
--> statement-breakpoint
CREATE INDEX `highlight_user_idx` ON `highlight` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `highlight_ref_idx` ON `highlight` (`user_id`,`canon_id`,`book_id`,`chapter`,`verse`);--> statement-breakpoint
CREATE TABLE `journey` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text,
	`label` text NOT NULL,
	`summary` text,
	`era` text,
	`ord` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "journey_label_check" CHECK(length("journey"."label") > 0)
);
--> statement-breakpoint
CREATE INDEX `journey_person_idx` ON `journey` (`person_id`,`ord`);--> statement-breakpoint
CREATE INDEX `journey_label_idx` ON `journey` (`label`);--> statement-breakpoint
CREATE TABLE `journey_path` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`seq` integer DEFAULT 0 NOT NULL,
	`geojson` text NOT NULL,
	`source_doc_id` text,
	`source_ref` text,
	`confidence` real,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "journey_path_geojson_check" CHECK(length("journey_path"."geojson") > 0),
	CONSTRAINT "journey_path_conf_check" CHECK("journey_path"."confidence" is null or ("journey_path"."confidence" >= 0 and "journey_path"."confidence" <= 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `journey_path_unique_seq` ON `journey_path` (`journey_id`,`seq`);--> statement-breakpoint
CREATE INDEX `journey_path_journey_idx` ON `journey_path` (`journey_id`,`seq`);--> statement-breakpoint
CREATE TABLE `journey_stop` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`seq` integer NOT NULL,
	`place_id` text NOT NULL,
	`note` text,
	`canon_id` text,
	`book_id` text,
	`chapter` integer,
	`verse` integer,
	CONSTRAINT "journey_stop_seq_check" CHECK("journey_stop"."seq" >= 0),
	CONSTRAINT "journey_stop_ref_check" CHECK(("journey_stop"."chapter" is null and "journey_stop"."verse" is null) or ("journey_stop"."chapter" > 0 and "journey_stop"."verse" > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `journey_stop_unique_seq` ON `journey_stop` (`journey_id`,`seq`);--> statement-breakpoint
CREATE INDEX `journey_stop_journey_idx` ON `journey_stop` (`journey_id`,`seq`);--> statement-breakpoint
CREATE INDEX `journey_stop_place_idx` ON `journey_stop` (`place_id`);--> statement-breakpoint
CREATE TABLE `note` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`canon_id` text,
	`book_id` text,
	`chapter` integer,
	`verse` integer,
	`entity_type` text,
	`entity_id` text,
	`title` text,
	`body` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "note_entity_type_check" CHECK("note"."entity_type" is null or "note"."entity_type" in ('person','place','event')),
	CONSTRAINT "note_body_nonempty_check" CHECK(length("note"."body") > 0)
);
--> statement-breakpoint
CREATE INDEX `note_user_idx` ON `note` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `note_verse_idx` ON `note` (`user_id`,`canon_id`,`book_id`,`chapter`,`verse`);--> statement-breakpoint
CREATE INDEX `note_entity_idx` ON `note` (`user_id`,`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `person` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`sort_name` text,
	`sex` text,
	`title` text,
	`summary` text,
	`bio` text,
	`era` text,
	`image_asset_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "person_sex_check" CHECK("person"."sex" is null or "person"."sex" in ('male','female'))
);
--> statement-breakpoint
CREATE INDEX `person_display_name_idx` ON `person` (`display_name`);--> statement-breakpoint
CREATE INDEX `person_sort_name_idx` ON `person` (`sort_name`);--> statement-breakpoint
CREATE TABLE `person_alias` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`alias` text NOT NULL,
	`lang` text,
	`ord` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "person_alias_nonempty_check" CHECK(length("person_alias"."alias") > 0)
);
--> statement-breakpoint
CREATE INDEX `person_alias_alias_idx` ON `person_alias` (`alias`);--> statement-breakpoint
CREATE INDEX `person_alias_person_idx` ON `person_alias` (`person_id`,`ord`);--> statement-breakpoint
CREATE UNIQUE INDEX `person_alias_unique` ON `person_alias` (`person_id`,`alias`);--> statement-breakpoint
CREATE TABLE `person_place` (
	`id` text PRIMARY KEY NOT NULL,
	`person_id` text NOT NULL,
	`place_id` text NOT NULL,
	`kind` text NOT NULL,
	`time_hint` text,
	`source_ref` text,
	`note` text,
	`ord` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "person_place_kind_check" CHECK("person_place"."kind" in ('born_in','died_in','lived_in','traveled_to','ministered_in','exiled_to','battle_at','imprisoned_in'))
);
--> statement-breakpoint
CREATE INDEX `person_place_person_idx` ON `person_place` (`person_id`,`kind`,`ord`);--> statement-breakpoint
CREATE INDEX `person_place_place_idx` ON `person_place` (`place_id`,`kind`);--> statement-breakpoint
CREATE TABLE `person_relationship` (
	`id` text PRIMARY KEY NOT NULL,
	`from_person_id` text NOT NULL,
	`to_person_id` text NOT NULL,
	`kind` text NOT NULL,
	`confidence` real,
	`note` text,
	CONSTRAINT "person_relationship_kind_check" CHECK("person_relationship"."kind" in ('parent','child','spouse','sibling','teacher_of','disciple_of','king_of','prophet_to','enemy_of','covenant_with')),
	CONSTRAINT "person_relationship_conf_check" CHECK("person_relationship"."confidence" is null or ("person_relationship"."confidence" >= 0 and "person_relationship"."confidence" <= 1)),
	CONSTRAINT "person_relationship_not_self_check" CHECK("person_relationship"."from_person_id" != "person_relationship"."to_person_id")
);
--> statement-breakpoint
CREATE INDEX `person_relationship_from_idx` ON `person_relationship` (`from_person_id`,`kind`);--> statement-breakpoint
CREATE INDEX `person_relationship_to_idx` ON `person_relationship` (`to_person_id`,`kind`);--> statement-breakpoint
CREATE TABLE `person_tag` (
	`person_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`ord` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`person_id`, `tag_id`)
);
--> statement-breakpoint
CREATE INDEX `person_tag_person_idx` ON `person_tag` (`person_id`,`ord`);--> statement-breakpoint
CREATE TABLE `place` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`lat` real,
	`lon` real,
	`geojson` text,
	`summary` text,
	`description` text,
	`era` text,
	`image_asset_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "place_kind_check" CHECK("place"."kind" in ('city','region','river','mountain','sea','desert','route','other')),
	CONSTRAINT "place_lat_check" CHECK("place"."lat" is null or ("place"."lat" >= -90 and "place"."lat" <= 90)),
	CONSTRAINT "place_lon_check" CHECK("place"."lon" is null or ("place"."lon" >= -180 and "place"."lon" <= 180))
);
--> statement-breakpoint
CREATE INDEX `place_name_idx` ON `place` (`name`);--> statement-breakpoint
CREATE INDEX `place_coord_idx` ON `place` (`lat`,`lon`);--> statement-breakpoint
CREATE TABLE `place_alias` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`alias` text NOT NULL,
	`lang` text,
	`ord` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "place_alias_nonempty_check" CHECK(length("place_alias"."alias") > 0)
);
--> statement-breakpoint
CREATE INDEX `place_alias_alias_idx` ON `place_alias` (`alias`);--> statement-breakpoint
CREATE INDEX `place_alias_place_idx` ON `place_alias` (`place_id`,`ord`);--> statement-breakpoint
CREATE UNIQUE INDEX `place_alias_unique` ON `place_alias` (`place_id`,`alias`);--> statement-breakpoint
CREATE TABLE `place_geo` (
	`id` text PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`kind` text NOT NULL,
	`lat` real,
	`lon` real,
	`min_lat` real,
	`min_lon` real,
	`max_lat` real,
	`max_lon` real,
	`geojson` text,
	`source_doc_id` text,
	`source_ref` text,
	`confidence` real,
	`note` text,
	`ord` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "place_geo_kind_check" CHECK("place_geo"."kind" in ('point','bbox','polygon','polyline')),
	CONSTRAINT "place_geo_lat_check" CHECK("place_geo"."lat" is null or ("place_geo"."lat" >= -90 and "place_geo"."lat" <= 90)),
	CONSTRAINT "place_geo_lon_check" CHECK("place_geo"."lon" is null or ("place_geo"."lon" >= -180 and "place_geo"."lon" <= 180)),
	CONSTRAINT "place_geo_bbox_check" CHECK(("place_geo"."min_lat" is null and "place_geo"."min_lon" is null and "place_geo"."max_lat" is null and "place_geo"."max_lon" is null)
          or ("place_geo"."min_lat" <= "place_geo"."max_lat" and "place_geo"."min_lon" <= "place_geo"."max_lon")),
	CONSTRAINT "place_geo_conf_check" CHECK("place_geo"."confidence" is null or ("place_geo"."confidence" >= 0 and "place_geo"."confidence" <= 1)),
	CONSTRAINT "place_geo_ord_check" CHECK("place_geo"."ord" >= 0)
);
--> statement-breakpoint
CREATE INDEX `place_geo_place_idx` ON `place_geo` (`place_id`,`ord`);--> statement-breakpoint
CREATE INDEX `place_geo_kind_idx` ON `place_geo` (`place_id`,`kind`);--> statement-breakpoint
CREATE INDEX `place_geo_bbox_idx` ON `place_geo` (`min_lat`,`min_lon`,`max_lat`,`max_lon`);--> statement-breakpoint
CREATE TABLE `place_tag` (
	`place_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`ord` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`place_id`, `tag_id`)
);
--> statement-breakpoint
CREATE INDEX `place_tag_place_idx` ON `place_tag` (`place_id`,`ord`);--> statement-breakpoint
CREATE TABLE `reading_progress` (
	`user_id` text NOT NULL,
	`canon_id` text NOT NULL,
	`book_id` text NOT NULL,
	`chapter` integer NOT NULL,
	`verse` integer NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`user_id`, `canon_id`, `book_id`),
	CONSTRAINT "reading_progress_chapter_check" CHECK("reading_progress"."chapter" > 0),
	CONSTRAINT "reading_progress_verse_check" CHECK("reading_progress"."verse" > 0)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`user_id`, `key`),
	CONSTRAINT "settings_key_check" CHECK(length("settings"."key") > 0),
	CONSTRAINT "settings_value_check" CHECK(length("settings"."value") > 0)
);
--> statement-breakpoint
CREATE TABLE `source_doc` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`author` text,
	`year` integer,
	`url` text,
	`license` text,
	`citation` text,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "source_doc_kind_check" CHECK("source_doc"."kind" in ('scripture','gazetteer','atlas','academic','tradition','other')),
	CONSTRAINT "source_doc_title_check" CHECK(length("source_doc"."title") > 0),
	CONSTRAINT "source_doc_year_check" CHECK("source_doc"."year" is null or ("source_doc"."year" >= 0 and "source_doc"."year" <= 3000))
);
--> statement-breakpoint
CREATE INDEX `source_doc_kind_idx` ON `source_doc` (`kind`);--> statement-breakpoint
CREATE INDEX `source_doc_title_idx` ON `source_doc` (`title`);--> statement-breakpoint
CREATE TABLE `tag` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`label` text NOT NULL,
	`kind` text DEFAULT 'general' NOT NULL,
	`ord` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tag_kind_check" CHECK("tag"."kind" in ('general','role','era','topic')),
	CONSTRAINT "tag_slug_check" CHECK(length("tag"."slug") > 0),
	CONSTRAINT "tag_label_check" CHECK(length("tag"."label") > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_unique_slug` ON `tag` (`slug`);--> statement-breakpoint
CREATE TABLE `translation` (
	`translation_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`language` text NOT NULL,
	`description` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "translation_id_check" CHECK(length("translation"."translation_id") > 0)
);
--> statement-breakpoint
CREATE INDEX `translation_language_idx` ON `translation` (`language`);--> statement-breakpoint
CREATE TABLE `translation_default_revision` (
	`translation_id` text NOT NULL,
	`canon_id` text NOT NULL,
	`purpose` text NOT NULL,
	`translation_revision_id` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`translation_id`, `canon_id`, `purpose`),
	CONSTRAINT "translation_default_revision_purpose_check" CHECK("translation_default_revision"."purpose" in ('reading','editing'))
);
--> statement-breakpoint
CREATE TABLE `translation_revision` (
	`translation_revision_id` text PRIMARY KEY NOT NULL,
	`translation_id` text NOT NULL,
	`label` text NOT NULL,
	`status` text NOT NULL,
	`based_on_revision_id` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`published_at` text,
	CONSTRAINT "translation_revision_status_check" CHECK("translation_revision"."status" in ('draft','published','archived')),
	CONSTRAINT "translation_revision_label_check" CHECK(length("translation_revision"."label") > 0)
);
--> statement-breakpoint
CREATE INDEX `translation_revision_translation_idx` ON `translation_revision` (`translation_id`,`status`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verse` (
	`canon_id` text NOT NULL,
	`book_id` text NOT NULL,
	`chapter` integer NOT NULL,
	`verse` integer NOT NULL,
	`verse_ordinal` integer NOT NULL,
	PRIMARY KEY(`canon_id`, `book_id`, `chapter`, `verse`),
	CONSTRAINT "verse_chapter_check" CHECK("verse"."chapter" > 0),
	CONSTRAINT "verse_verse_check" CHECK("verse"."verse" > 0),
	CONSTRAINT "verse_ordinal_check" CHECK("verse"."verse_ordinal" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verse_unique_ordinal` ON `verse` (`canon_id`,`verse_ordinal`);--> statement-breakpoint
CREATE INDEX `verse_book_idx` ON `verse` (`canon_id`,`book_id`,`chapter`,`verse`);--> statement-breakpoint
CREATE TABLE `verse_mark` (
	`id` text PRIMARY KEY NOT NULL,
	`translation_revision_id` text NOT NULL,
	`canon_id` text NOT NULL,
	`book_id` text NOT NULL,
	`chapter` integer NOT NULL,
	`verse` integer NOT NULL,
	`kind` text NOT NULL,
	`ord` integer NOT NULL,
	`payload` text,
	CONSTRAINT "verse_mark_kind_check" CHECK("verse_mark"."kind" in ('heading','subheading','paragraph_break','poetry_line','speaker','red_letter','selah')),
	CONSTRAINT "verse_mark_ord_check" CHECK("verse_mark"."ord" >= 0)
);
--> statement-breakpoint
CREATE INDEX `verse_mark_verse_idx` ON `verse_mark` (`translation_revision_id`,`canon_id`,`book_id`,`chapter`,`verse`,`ord`);--> statement-breakpoint
CREATE TABLE `verse_mention` (
	`id` text PRIMARY KEY NOT NULL,
	`translation_revision_id` text NOT NULL,
	`canon_id` text NOT NULL,
	`book_id` text NOT NULL,
	`chapter` integer NOT NULL,
	`verse` integer NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`surface` text NOT NULL,
	`ord` integer DEFAULT 0 NOT NULL,
	`note` text,
	CONSTRAINT "verse_mention_type_check" CHECK("verse_mention"."entity_type" in ('person','place','event')),
	CONSTRAINT "verse_mention_span_check" CHECK("verse_mention"."start" >= 0 and "verse_mention"."end" > "verse_mention"."start"),
	CONSTRAINT "verse_mention_surface_check" CHECK(length("verse_mention"."surface") > 0)
);
--> statement-breakpoint
CREATE INDEX `verse_mention_verse_idx` ON `verse_mention` (`translation_revision_id`,`canon_id`,`book_id`,`chapter`,`verse`,`start`,`end`);--> statement-breakpoint
CREATE INDEX `verse_mention_entity_idx` ON `verse_mention` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `verse_text` (
	`translation_revision_id` text NOT NULL,
	`canon_id` text NOT NULL,
	`book_id` text NOT NULL,
	`chapter` integer NOT NULL,
	`verse` integer NOT NULL,
	`text` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	PRIMARY KEY(`translation_revision_id`, `canon_id`, `book_id`, `chapter`, `verse`),
	CONSTRAINT "verse_text_nonempty_check" CHECK(length("verse_text"."text") > 0),
	CONSTRAINT "verse_text_chapter_check" CHECK("verse_text"."chapter" > 0),
	CONSTRAINT "verse_text_verse_check" CHECK("verse_text"."verse" > 0)
);
--> statement-breakpoint
CREATE INDEX `verse_text_book_read_idx` ON `verse_text` (`translation_revision_id`,`canon_id`,`book_id`,`chapter`,`verse`);--> statement-breakpoint
CREATE INDEX `verse_text_revision_idx` ON `verse_text` (`translation_revision_id`);