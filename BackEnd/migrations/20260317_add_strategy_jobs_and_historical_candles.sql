CREATE TABLE IF NOT EXISTS historical_candles (
  symbol VARCHAR(32) NOT NULL,
  interval_value VARCHAR(8) NOT NULL,
  open_time BIGINT UNSIGNED NOT NULL,
  open DECIMAL(24, 10) NOT NULL,
  high DECIMAL(24, 10) NOT NULL,
  low DECIMAL(24, 10) NOT NULL,
  close DECIMAL(24, 10) NOT NULL,
  volume DECIMAL(28, 12) NOT NULL,
  close_time BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (symbol, interval_value, open_time),
  KEY idx_historical_candles_symbol_interval_time (symbol, interval_value, open_time),
  KEY idx_historical_candles_symbol_interval_close (symbol, interval_value, close_time)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS strategy_jobs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  type VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  payload JSON NOT NULL,
  result JSON NULL,
  error TEXT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  next_run_at DATETIME NOT NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_strategy_jobs_status_next_run (status, next_run_at),
  KEY idx_strategy_jobs_created_at (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS strategy_alerts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  type VARCHAR(64) NOT NULL,
  severity VARCHAR(16) NOT NULL,
  message TEXT NOT NULL,
  payload JSON NULL,
  created_at DATETIME NOT NULL,
  KEY idx_strategy_alerts_created_at (created_at),
  KEY idx_strategy_alerts_type_created_at (type, created_at)
) ENGINE=InnoDB;
