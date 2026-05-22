# Finchecker TODO

- [x] Migrate drizzle/schema.ts with leads table and blocked_slots table
- [x] Migrate server/db.ts with lead and blocked slot helpers
- [x] Migrate server/routers.ts with survey, broker admin, and AI report procedures
- [x] Migrate client/src/pages/Home.tsx (full survey landing page)
- [x] Migrate client/src/pages/BrokerAdmin.tsx (broker admin panel)
- [x] Migrate client/src/lib/pixel.ts (Meta Pixel tracking)
- [x] Update client/src/App.tsx with BrokerAdmin route
- [x] Update client/src/index.css with custom theme and fonts
- [x] Update client/index.html with Meta Pixel, fonts, and correct title
- [x] Run DB migration (leads + blocked_slots tables)
- [x] Write vitest tests for survey submit and broker admin procedures
- [x] Save checkpoint and publish
- [x] Change broker admin route from /harborviewreports to /reports
- [x] Replace "Harbourview Reports" / "HarborView" branding with "Finance Report" on the reports page
- [x] Change 1: Timezone selector with auto-detection on booking step (Home.tsx)
- [x] Change 2: Add timezone column to DB, migration, router update, admin display
- [x] Change 3: Booking date picker shows next 2 unblocked days only
- [x] Change 4: Collapsible blocked slots section on admin/reports page
