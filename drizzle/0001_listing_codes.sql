CREATE TABLE `listing_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`listing_id` integer NOT NULL,
	`merchant_id` text NOT NULL,
	`gift_card_code` text NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `listing_codes_merchant_code_unique` ON `listing_codes` (`merchant_id`,`gift_card_code`);