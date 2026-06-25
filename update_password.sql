USE provider_db;

UPDATE providers 
SET password_hash = '$2a$12$tbnqTdTk8QbIyrIMSD9bYO/poXzqYj//BLCg/LrYeyevYEfx/wVQK' 
WHERE provider_name = 'redPlug';
