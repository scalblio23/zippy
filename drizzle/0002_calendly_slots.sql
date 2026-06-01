CREATE TABLE IF NOT EXISTS `calendlySlots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dateKey` varchar(16) NOT NULL,
	`slotKey` varchar(8) NOT NULL,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `calendlySlots_id` PRIMARY KEY(`id`)
);
