const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function normalizeSymbol(symbol) {
  return (symbol || "").toUpperCase().trim();
}

const DASH = "\u2014";

export default function HoldingsTable({
  holdings,
  prices,
  onRemove,
  onSelect,
  selectedSymbol,
  errorActive,
}) {
  if (!holdings.length) {
    return (
      <div className="empty" role="status">
        <p>No holdings yet.</p>
        <p className="helper">Add your first symbol above to start tracking.</p>
      </div>
    );
  }

  function renderRow(holding) {
    const sym = normalizeSymbol(holding.symbol);
    const sharesNumber = Number(holding.shares);
    const hasShares = Number.isFinite(sharesNumber);
    const formattedShares = hasShares
      ? sharesNumber.toLocaleString("en-US", {
          minimumFractionDigits: Number.isInteger(sharesNumber) ? 0 : 2,
          maximumFractionDigits: 4,
        })
      : "--";

    const priceNumber = Number(prices[sym] ?? 0);
    const hasPrice = Number.isFinite(priceNumber);
    const showDash = priceNumber === 0 && errorActive;
    const formattedPrice = hasPrice
      ? showDash
        ? DASH
        : currencyFormatter.format(priceNumber)
      : "--";

    const valueNumber =
      hasPrice && hasShares ? priceNumber * sharesNumber : NaN;
    const formattedValue =
      Number.isFinite(valueNumber) && !showDash
        ? currencyFormatter.format(valueNumber)
        : showDash
        ? DASH
        : "--";

    const isSelected =
      normalizeSymbol(selectedSymbol) === sym && sym.length > 0;

    return (
      <tr
        key={sym}
        className={isSelected ? "is-selected" : ""}
        onClick={() => onSelect(sym)}
        aria-selected={isSelected}
      >
        <td>{sym}</td>
        <td data-align="right">{formattedShares}</td>
        <td data-align="right">{formattedPrice}</td>
        <td data-align="right">{formattedValue}</td>
        <td data-align="right">
          <button
            type="button"
            className="btn btn--icon"
            aria-label={`Remove ${sym}`}
            onClick={(event) => {
              event.stopPropagation();
              onRemove(sym);
            }}
          >
            &times;
          </button>
        </td>
      </tr>
    );
  }

  return (
    <div className="table-wrapper fade-in">
      <table className="table" aria-label="Holdings table">
        <thead>
          <tr>
            <th scope="col">Symbol</th>
            <th scope="col">Shares</th>
            <th scope="col">Price</th>
            <th scope="col">Value</th>
            <th scope="col">
              <span className="sr-only">Remove holding</span>
            </th>
          </tr>
        </thead>
        <tbody>{holdings.map(renderRow)}</tbody>
      </table>
    </div>
  );
}
