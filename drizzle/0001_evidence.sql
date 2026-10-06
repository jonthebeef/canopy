CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`node_id` text NOT NULL,
	`kind` text NOT NULL,
	`summary` text NOT NULL,
	`value` text DEFAULT '' NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`archived_at` integer,
	`archived_by` text,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `evidence_workspace_idx` ON `evidence` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `evidence_node_idx` ON `evidence` (`node_id`);