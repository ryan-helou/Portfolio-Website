const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function HoldingsTable({
  holdings,
  prices,
  onRemove,
  onSelect,
  selectedSymbol,
}) {
  if (!holdings.length) {
    return (
      <div className="empty" role="status">
        <p>No holdings yet.</p>
        <p className="helper">Add your first symbol above to start tracking.</p>
      </div>
    );
  }

  function renderRow({ symbol, shares }) {
    const priceNumber = Number(prices[symbol]);
    const sharesNumber = Number(shares);
    const hasPrice = Number.isFinite(priceNumber);
    const hasShares = Number.isFinite(sharesNumber);
    const safeShares = hasShares ? sharesNumber : 0;
    const valueNumber = hasPrice ? priceNumber * safeShares : null;

    const formattedShares = hasShares
      ? sharesNumber.toLocaleString("en-US", {
          minimumFractionDigits: Number.isInteger(sharesNumber) ? 0 : 2,
          maximumFractionDigits: 4,
        })
      : "--";

    const formattedPrice = hasPrice
      ? currencyFormatter.format(priceNumber)
      : "--";

    const formattedValue =
      valueNumber != null ? currencyFormatter.format(valueNumber) : "--";
    const isSelected = selectedSymbol === symbol;

    return (
      <tr
        key={symbol}
        className={isSelected ? "selected-row" : ""}
        onClick={() => onSelect(symbol)}
        aria-selected={isSelected}
      >
        <td>{symbol}</td>
        <td data-align="right">{formattedShares}</td>
        <td data-align="right">{formattedPrice}</td>
        <td data-align="right">{formattedValue}</td>
        <td data-align="right">
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            aria-label={`Remove ${symbol}`}
            onClick={(event) => {
              event.stopPropagation();
              onRemove(symbol);
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
