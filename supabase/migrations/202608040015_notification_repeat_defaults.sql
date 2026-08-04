alter table if exists public.ledger_notification_preferences
  alter column delivery_mode set default 'repeat',
  alter column repeat_hours set default 12;

alter table if exists public.web_push_deliveries
  alter column delivery_mode set default 'repeat',
  alter column repeat_hours set default 12;
