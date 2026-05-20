ALTER TABLE miners
  ADD COLUMN mac_address VARCHAR(32) NULL,
  ADD INDEX idx_miners_mac_address (mac_address);
