-- HubSpot GTM Console - Database Schema
-- Run this against your PostgreSQL database

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table (for multi-tenant support)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- HubSpot OAuth tokens (encrypted at rest)
CREATE TABLE IF NOT EXISTS hubspot_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  hub_id VARCHAR(50) NOT NULL,                    -- HubSpot portal ID
  access_token_encrypted TEXT NOT NULL,           -- AES-256-GCM encrypted
  refresh_token_encrypted TEXT NOT NULL,          -- AES-256-GCM encrypted
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,   -- When access token expires
  scopes TEXT[],                                  -- Granted OAuth scopes
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, hub_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_hubspot_tokens_user_id ON hubspot_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_hubspot_tokens_expires_at ON hubspot_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_hubspot_tokens_hub_id ON hubspot_tokens(hub_id);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for auto-updating timestamps
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_hubspot_tokens_updated_at ON hubspot_tokens;
CREATE TRIGGER update_hubspot_tokens_updated_at
  BEFORE UPDATE ON hubspot_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
