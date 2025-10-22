import { useId, useState } from "react";

export default function HoldingsForm({ onAdd }) {
  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");
  const symbolId = useId();
  const sharesId = useId();
  const normalizedSymbol = symbol.trim().toUpperCase();
  const shareCount = parseFloat(shares);
  const canSubmit =
    Boolean(normalizedSymbol) && Number.isFinite(shareCount) && shareCount > 0;

  function handleSubmit(event) {
    event.preventDefault();

    if (!normalizedSymbol || Number.isNaN(shareCount) || shareCount <= 0) {
      return;
    }

    onAdd({ symbol: normalizedSymbol, shares: shareCount });
    setSymbol("");
    setShares("");
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor={symbolId}>Symbol</label>
        <input
          id={symbolId}
          className="input"
          placeholder="e.g. AAPL"
          value={symbol}
          onChange={(event) => setSymbol(event.target.value)}
          autoComplete="off"
          required
        />
        <p className="helper">Example: AAPL</p>
      </div>

      <div>
        <label htmlFor={sharesId}>Shares</label>
        <input
          id={sharesId}
          className="input"
          placeholder="e.g. 1.5"
          type="number"
          step="any"
          min="0"
          value={shares}
          onChange={(event) => setShares(event.target.value)}
          required
        />
        <p className="helper">Example: 1.5</p>
      </div>

      <div>
        <button
          type="submit"
          className="btn btn--primary"
          disabled={!canSubmit}
        >
          Add Holding
        </button>
      </div>
    </form>
  );
}
