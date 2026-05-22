CREATE TABLE `blockedSlots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dateKey` varchar(16) NOT NULL,
	`slotKey` varchar(8),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `blockedSlots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`phone` varchar(64) NOT NULL,
	`email` varchar(320) NOT NULL,
	`bank` varchar(64) NOT NULL,
	`bankName` varchar(128) NOT NULL,
	`loanSize` varchar(128) NOT NULL,
	`interest` varchar(64) NOT NULL,
	`timeline` varchar(128) NOT NULL,
	`bookingDate` varchar(64),
	`bookingTime` varchar(64),
	`bookingTimezone` varchar(128),
	`aiReport` json,
	`reportStatus` enum('pending','generating','ready','failed') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `leads_id` PRIMARY KEY(`id`)
);
