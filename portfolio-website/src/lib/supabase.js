// src/lib/supabase.js
// Supabase client for portfolio database operations

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;

/**
 * Initialize Supabase client
 * @returns {Object|null} Supabase client instance or null if credentials missing
 */
export function initSupabase() {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase credentials not found. Portfolio save/load features will be disabled.');
    return null;
  }

  if (!supabase) {
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  }

  return supabase;
}

/**
 * Check if a portfolio key already exists in the database
 * @param {string} key - Portfolio key to check
 * @returns {Promise<boolean>} True if key exists, false otherwise
 */
export async function checkKeyExists(key) {
  const client = initSupabase();
  if (!client) {
    throw new Error('Supabase not configured');
  }

  const normalizedKey = (key || '').trim();
  if (!normalizedKey) {
    throw new Error('Key cannot be empty');
  }

  const { data, error } = await client
    .from('portfolios')
    .select('key')
    .eq('key', normalizedKey)
    .maybeSingle();

  if (error) {
    console.error('Error checking key existence:', error);
    throw new Error(`Failed to check key: ${error.message}`);
  }

  return !!data;
}

/**
 * Save or update a portfolio in the database
 * @param {string} key - Portfolio key (3-20 alphanumeric characters)
 * @param {Array} holdings - Array of {symbol, shares} objects
 * @returns {Promise<Object>} Result object with success status and message
 */
export async function savePortfolio(key, holdings) {
  const client = initSupabase();
  if (!client) {
    throw new Error('Supabase not configured');
  }

  // Validate key format
  const normalizedKey = (key || '').trim();
  if (!normalizedKey) {
    throw new Error('Key cannot be empty');
  }
  if (normalizedKey.length < 3 || normalizedKey.length > 20) {
    throw new Error('Key must be between 3 and 20 characters');
  }
  if (!/^[a-zA-Z0-9]+$/.test(normalizedKey)) {
    throw new Error('Key can only contain letters and numbers');
  }

  // Validate holdings
  if (!Array.isArray(holdings)) {
    throw new Error('Holdings must be an array');
  }

  // Check if key already exists
  const exists = await checkKeyExists(normalizedKey);

  if (exists) {
    // Update existing portfolio
    const { data, error } = await client
      .from('portfolios')
      .update({ holdings })
      .eq('key', normalizedKey)
      .select()
      .single();

    if (error) {
      console.error('Error updating portfolio:', error);
      throw new Error(`Failed to update portfolio: ${error.message}`);
    }

    return {
      success: true,
      message: `Portfolio '${normalizedKey}' updated successfully`,
      data,
      isNew: false,
    };
  } else {
    // Insert new portfolio
    const { data, error } = await client
      .from('portfolios')
      .insert([{ key: normalizedKey, holdings }])
      .select()
      .single();

    if (error) {
      console.error('Error creating portfolio:', error);
      throw new Error(`Failed to create portfolio: ${error.message}`);
    }

    return {
      success: true,
      message: `Portfolio '${normalizedKey}' created successfully`,
      data,
      isNew: true,
    };
  }
}

/**
 * Load a portfolio from the database by key
 * @param {string} key - Portfolio key to load
 * @returns {Promise<Object>} Result object with holdings and metadata
 */
export async function loadPortfolio(key) {
  const client = initSupabase();
  if (!client) {
    throw new Error('Supabase not configured');
  }

  const normalizedKey = (key || '').trim();
  if (!normalizedKey) {
    throw new Error('Key cannot be empty');
  }

  const { data, error } = await client
    .from('portfolios')
    .select('*')
    .eq('key', normalizedKey)
    .maybeSingle();

  if (error) {
    console.error('Error loading portfolio:', error);
    throw new Error(`Failed to load portfolio: ${error.message}`);
  }

  if (!data) {
    return {
      success: false,
      message: `Portfolio '${normalizedKey}' not found`,
      data: null,
    };
  }

  return {
    success: true,
    message: `Portfolio '${normalizedKey}' loaded successfully`,
    data: {
      key: data.key,
      holdings: Array.isArray(data.holdings) ? data.holdings : [],
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  };
}

/**
 * Check if Supabase is configured (credentials present)
 * @returns {boolean} True if configured, false otherwise
 */
export function isSupabaseConfigured() {
  return !!(supabaseUrl && supabaseAnonKey);
}
