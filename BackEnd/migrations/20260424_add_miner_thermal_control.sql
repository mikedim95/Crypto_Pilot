SET @db_name = DATABASE();

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'miners'
    AND COLUMN_NAME = 'temp_control_enabled'
);
SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE miners ADD COLUMN temp_control_enabled BOOLEAN NOT NULL DEFAULT FALSE',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'miners'
    AND COLUMN_NAME = 'temp_control_min'
);
SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE miners ADD COLUMN temp_control_min INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'miners'
    AND COLUMN_NAME = 'temp_control_max'
);
SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE miners ADD COLUMN temp_control_max INT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @column_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @db_name
    AND TABLE_NAME = 'miners'
    AND COLUMN_NAME = 'temp_control_last_adjusted_at'
);
SET @sql = IF(
  @column_exists = 0,
  'ALTER TABLE miners ADD COLUMN temp_control_last_adjusted_at DATETIME NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
