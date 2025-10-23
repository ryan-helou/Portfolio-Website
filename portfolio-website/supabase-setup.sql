-- Portfolio Tracker Database Schema
-- Run this SQL script in your Supabase SQL Editor (Dashboard → SQL Editor)

-- Create portfolios table
CREATE TABLE IF NOT EXISTS portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  holdings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for fast key lookups
CREATE INDEX IF NOT EXISTS idx_portfolios_key ON portfolios(key);

-- Enable Row Level Security
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-running script)
DROP POLICY IF EXISTS "Allow public read access" ON portfolios;
DROP POLICY IF EXISTS "Allow public insert access" ON portfolios;
DROP POLICY IF EXISTS "Allow public update access" ON portfolios;

-- Create policies for public access (no authentication required)
CREATE POLICY "Allow public read access"
  ON portfolios FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert access"
  ON portfolios FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update access"
  ON portfolios FOR UPDATE
  USING (true);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to call the function before updates
DROP TRIGGER IF EXISTS update_portfolios_updated_at ON portfolios;
CREATE TRIGGER update_portfolios_updated_at
  BEFORE UPDATE ON portfolios
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Done! Your database is ready.
-- Note: You can verify the table was created by going to Table Editor in Supabase
