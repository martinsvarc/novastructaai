export default function CallLogLoading() {
  return (
    <div className="skeleton-fade-in">
      <div className="page-header">
        <div className="page-tag">Inbound Voice</div>
        <h2>Call Log</h2>
      </div>
      <div className="skeleton-stats">
        {[80, 40, 40, 40, 50, 50, 40].map((w, i) => (
          <div key={i} className="skeleton-stat">
            <div className="skeleton" style={{ width: 32, height: 28 }} />
            <div className="skeleton" style={{ width: w, height: 10 }} />
          </div>
        ))}
      </div>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton-row" style={{ opacity: 1 - i * 0.15 }}>
          <div className="skeleton" style={{ width: 8, height: 8, borderRadius: "50%" }} />
          <div className="skeleton" style={{ width: 80, height: 18 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="skeleton" style={{ width: "40%", height: 14 }} />
            <div className="skeleton" style={{ width: "65%", height: 10 }} />
          </div>
          <div className="skeleton" style={{ width: 90, height: 12 }} />
        </div>
      ))}
    </div>
  );
}
