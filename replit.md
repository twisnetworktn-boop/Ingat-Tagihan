# Ingat Tagihan

Aplikasi mobile offline untuk mencatat berbagai tagihan, memantau jatuh tempo, dan menerima pengingat lokal.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the shared API server through its managed workflow
- `pnpm --filter @workspace/pengingat-tagihan run dev` — run the Expo mobile app through its managed workflow
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- No credentials or backend are required for the current offline mobile experience.

## Stack

- Expo Router / React Native / TypeScript
- AsyncStorage for local persistence; expo-notifications for local reminders
- The shared API server is present but not used by the mobile app.

## Where things live

- Mobile screens: `artifacts/pengingat-tagihan/app/`
- Offline bill state and notification scheduling: `artifacts/pengingat-tagihan/contexts/BillsContext.tsx`
- Date and currency formatting: `artifacts/pengingat-tagihan/lib/bill-format.ts`
- Theme tokens: `artifacts/pengingat-tagihan/constants/colors.ts`

## Architecture decisions

- Data stays on the device because the app must work without internet. Do not add a server dependency to the core bill flows.
- Reminder permission is requested only when a user turns on a bill's local reminder.
- Confirming payment keeps the paid bill as history and creates the next monthly bill. The original due-day anchors months shorter than that day; deleting an active bill stops its series without removing older paid history.
- Bills can instead be marked once-only: their reminder fires once and confirming payment preserves the log without creating another bill. Older saved bills remain monthly by default.
- The offline Catatan menu tracks debts in either direction, deposits against debts, and weekly/monthly routine expenses. Routine payments keep history and advance the next due date; optional local reminders are scheduled once per due date.

## Product

- Add, edit, delete, and mark bills paid; categorize bills; view due dates and outstanding total; schedule optional local reminders.
- In Catatan, track money owed in both directions, record partial settlements, and manage weekly or monthly recurring costs.

## User preferences

- Keep the app simple, modern, and fully usable offline. Use a purple palette with translucent surfaces, restrained corner rounding, and sea-blue action buttons.

## Gotchas

- Web preview supports offline bill storage but local reminder scheduling is for the native mobile app.
- On Android, create the notification channel before asking for notification permission.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
