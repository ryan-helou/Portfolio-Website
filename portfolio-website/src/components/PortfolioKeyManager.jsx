import { useState, useEffect, useId } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';

export default function PortfolioKeyManager({
  currentKey,
  onSave,
  onLoad,
  disabled = false,
}) {
  const [keyInput, setKeyInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const inputId = useId();

  const isConfigured = isSupabaseConfigured();

  // Sync input with current key
  useEffect(() => {
    if (currentKey && currentKey !== keyInput) {
      setKeyInput(currentKey);
    }
  }, [currentKey]);

  // Clear success message after 3 seconds
  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => setShowSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showSuccess]);

  const validateKey = (key) => {
    const trimmed = key.trim();
    if (!trimmed) {
      return 'Key cannot be empty';
    }
    if (trimmed.length < 3) {
      return 'Key must be at least 3 characters';
    }
    if (trimmed.length > 20) {
      return 'Key must be 20 characters or less';
    }
    if (!/^[a-zA-Z0-9]+$/.test(trimmed)) {
      return 'Key can only contain letters and numbers';
    }
    return '';
  };

  const handleKeyChange = (event) => {
    const value = event.target.value;
    setKeyInput(value);
    setValidationError('');
    setShowSuccess(false);
  };

  const handleSave = async () => {
    const trimmedKey = keyInput.trim();
    const error = validateKey(trimmedKey);

    if (error) {
      setValidationError(error);
      return;
    }

    setIsLoading(true);
    setValidationError('');

    try {
      await onSave(trimmedKey);
      setShowSuccess(true);
    } catch (err) {
      setValidationError(err.message || 'Failed to save portfolio');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoad = async () => {
    const trimmedKey = keyInput.trim();
    const error = validateKey(trimmedKey);

    if (error) {
      setValidationError(error);
      return;
    }

    setIsLoading(true);
    setValidationError('');

    try {
      await onLoad(trimmedKey);
      setShowSuccess(true);
    } catch (err) {
      setValidationError(err.message || 'Failed to load portfolio');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !disabled && !isLoading) {
      event.preventDefault();
      handleLoad();
    }
  };

  if (!isConfigured) {
    return (
      <div className="portfolio-key-manager" role="status">
        <span className="portfolio-key-disabled">
          Portfolio sync disabled
        </span>
      </div>
    );
  }

  return (
    <div className="portfolio-key-manager">
      <div className="portfolio-key-input-group">
        <label htmlFor={inputId} className="sr-only">
          Portfolio Key
        </label>
        <input
          id={inputId}
          type="text"
          className={`portfolio-key-input ${validationError ? 'error' : ''} ${showSuccess ? 'success' : ''}`}
          placeholder="Enter portfolio key..."
          value={keyInput}
          onChange={handleKeyChange}
          onKeyDown={handleKeyDown}
          disabled={disabled || isLoading}
          maxLength={20}
          autoComplete="off"
          spellCheck="false"
          aria-invalid={!!validationError}
          aria-describedby={validationError ? `${inputId}-error` : undefined}
        />
        {showSuccess && (
          <span className="portfolio-key-check" aria-hidden="true">
            ✓
          </span>
        )}
      </div>

      <div className="portfolio-key-actions">
        <button
          type="button"
          className="btn btn--ghost portfolio-key-btn"
          onClick={handleSave}
          disabled={disabled || isLoading || !keyInput.trim()}
          aria-label="Save portfolio with current key"
        >
          {isLoading ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          className="btn btn--ghost portfolio-key-btn"
          onClick={handleLoad}
          disabled={disabled || isLoading || !keyInput.trim()}
          aria-label="Load portfolio from key"
        >
          {isLoading ? 'Loading...' : 'Load'}
        </button>
      </div>

      {validationError && (
        <div
          id={`${inputId}-error`}
          className="portfolio-key-error"
          role="alert"
        >
          {validationError}
        </div>
      )}
    </div>
  );
}
