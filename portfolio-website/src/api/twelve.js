const KEY = import.meta.env.VITE_TWELVEDATA_KEY || "";
const BASE_URL = "https://api.twelvedata.com";
const QUOTE_TTL = 60 * 1000;
const SERIES_TTL = 5 * 60 * 1000;
const STORAGE_PREFIX = "td-cache:";

const memoryCache = new Map();
let mockModulePromise;

export function useMock() {
  return !KEY;
}

function buildCacheKey(type, identifier) {
  return `${STORAGE_PREFIX}${type}:${identifier}`;
}

function deepClone(value) {
  if (value == null) {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    console.warn("deepClone failed; returning original reference", error);
    return value;
  }
}

function readCache(cacheKey, { allowExpired = false } = {}) {
  const now = Date.now();
  const memoryEntry = memoryCache.get(cacheKey);
  if (memoryEntry) {
    if (memoryEntry.expiry > now || allowExpired) {
      if (memoryEntry.expiry <= now && !allowExpired) {
        memoryCache.delete(cacheKey);
        return null;
      }
      return deepClone(memoryEntry.value);
    }
    memoryCache.delete(cacheKey);
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (parsed.expiry > now) {
      const cloned = deepClone(parsed.value);
      memoryCache.set(cacheKey, {
        expiry: parsed.expiry,
        value: cloned,
      });
      return cloned;
    }
    if (allowExpired) {
      return deepClone(parsed.value);
    }
    window.localStorage.removeItem(cacheKey);
  } catch (error) {
    console.warn("Failed to read cached value", error);
  }

  return null;
}

function storeCache(cacheKey, value, ttl) {
  const expiry = Date.now() + ttl;
  const cloned = deepClone(value);
  memoryCache.set(cacheKey, { value: cloned, expiry });

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        cacheKey,
        JSON.stringify({ value: cloned, expiry })
      );
    } catch (error) {
      console.warn("Failed to persist cache to localStorage", error);
    }
  }
}

async function loadMocks() {
  if (!mockModulePromise) {
    mockModulePromise = import("../mock.js");
  }
  return mockModulePromise;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

async function fetchMockQuote(symbol) {
  const { mockQuote = {} } = await loadMocks();
  const entry = mockQuote[symbol];
  if (!entry) {
    return { price: 0, previous_close: 0 };
  }
  return {
    price: toNumber(entry.price),
    previous_close: toNumber(entry.prevClose ?? entry.previous_close),
  };
}

async function fetchMockSeries(symbol, interval, output) {
  const { mockSeries = {} } = await loadMocks();
  const rawSeries = mockSeries[symbol] || [];
  const limit = Number.isInteger(output) && output > 0 ? output : 30;
  const values = [];

  for (const point of rawSeries) {
    if (values.length >= limit) {
      break;
    }
    const closeNumber = Number(point.close);
    if (!Number.isFinite(closeNumber)) {
      continue;
    }
    const datetime = point.datetime ?? "";
    if (!datetime) {
      continue;
    }
    values.push({
      datetime,
      close: closeNumber.toString(),
    });
  }

  return { values };
}

async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  const data = await response.json();
  if (data?.status === "error") {
    throw new Error(data?.message || "Twelve Data API error");
  }
  return data;
}

export async function fetchQuote(symbol) {
  const normalized = String(symbol || "").toUpperCase().trim();
  if (!normalized) {
    return { price: 0, previous_close: 0 };
  }

  const cacheKey = buildCacheKey("quote", normalized);
  const cached = readCache(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    let payload;
    if (useMock()) {
      payload = await fetchMockQuote(normalized);
    } else {
      const url = new URL(`${BASE_URL}/quote`);
      url.searchParams.set("symbol", normalized);
      url.searchParams.set("apikey", KEY);

      const data = await getJSON(url.toString());
      payload = {
        price: toNumber(data.price),
        previous_close: toNumber(data.previous_close ?? data.prev_close),
      };
    }

    storeCache(cacheKey, payload, QUOTE_TTL);
    return payload;
  } catch (error) {
    console.warn(`fetchQuote fallback for ${normalized}`, error);
    const cachedFallback = readCache(cacheKey, { allowExpired: true });
    if (cachedFallback) {
      return cachedFallback;
    }

    if (!useMock()) {
      try {
        const mockFallback = await fetchMockQuote(normalized);
        storeCache(cacheKey, mockFallback, QUOTE_TTL);
        return mockFallback;
      } catch (mockError) {
        console.warn("fetchQuote mock fallback failed", mockError);
      }
    }

    return { price: 0, previous_close: 0 };
  }
}

export async function fetchSeries(symbol, interval = "1day", output = 30) {
  const normalizedSymbol = String(symbol || "").toUpperCase().trim();
  if (!normalizedSymbol) {
    return { values: [] };
  }

  const safeInterval = String(interval || "1day");
  const requestedOutput = Number(output);
  const safeOutput =
    Number.isInteger(requestedOutput) && requestedOutput > 0
      ? requestedOutput
      : 30;

  const cacheId = `${normalizedSymbol}|${safeInterval}|${safeOutput}`;
  const cacheKey = buildCacheKey("series", cacheId);
  const cached = readCache(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    let payload;
    if (useMock()) {
      payload = await fetchMockSeries(
        normalizedSymbol,
        safeInterval,
        safeOutput
      );
    } else {
      const url = new URL(`${BASE_URL}/time_series`);
      url.searchParams.set("symbol", normalizedSymbol);
      url.searchParams.set("interval", safeInterval);
      url.searchParams.set("output", String(safeOutput));
      url.searchParams.set("apikey", KEY);

      const data = await getJSON(url.toString());
      const rawValues = Array.isArray(data.values) ? data.values : [];
      const values = [];

      for (const point of rawValues) {
        if (values.length >= safeOutput) {
          break;
        }
        const closeNumber = Number(point.close);
        if (!Number.isFinite(closeNumber)) {
          continue;
        }
        const datetime = point.datetime ?? "";
        if (!datetime) {
          continue;
        }
        values.push({
          datetime,
          close: closeNumber.toString(),
        });
      }

      payload = { values };
    }

    storeCache(cacheKey, payload, SERIES_TTL);
    return payload;
  } catch (error) {
    console.warn(`fetchSeries fallback for ${normalizedSymbol}`, error);
    const cachedFallback = readCache(cacheKey, { allowExpired: true });
    if (cachedFallback) {
      return cachedFallback;
    }

    if (!useMock()) {
      try {
        const mockFallback = await fetchMockSeries(
          normalizedSymbol,
          safeInterval,
          safeOutput
        );
        storeCache(cacheKey, mockFallback, SERIES_TTL);
        return mockFallback;
      } catch (mockError) {
        console.warn("fetchSeries mock fallback failed", mockError);
      }
    }

    return { values: [] };
  }
}
