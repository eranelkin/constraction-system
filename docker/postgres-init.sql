-- Runs once on first container initialization (empty volume).
-- Creates the test database alongside the default constractor_dev.
CREATE DATABASE constractor_test;
GRANT ALL PRIVILEGES ON DATABASE constractor_test TO constractor;
