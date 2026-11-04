-- Separate database used by the Playwright suite so tests never touch dev data.
CREATE DATABASE marketplace_test OWNER marketplace;
