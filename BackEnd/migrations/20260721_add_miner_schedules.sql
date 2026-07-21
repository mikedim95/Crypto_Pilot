ALTER TABLE miners
  ADD COLUMN schedule_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN schedule_start_time VARCHAR(5) NULL,
  ADD COLUMN schedule_stop_time VARCHAR(5) NULL,
  ADD COLUMN schedule_timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Athens',
  ADD COLUMN schedule_days_json JSON NULL,
  ADD COLUMN schedule_last_action VARCHAR(10) NULL,
  ADD COLUMN schedule_last_action_at DATETIME NULL;
