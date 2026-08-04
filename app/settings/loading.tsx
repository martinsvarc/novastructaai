export default function SettingsLoading() {
  return (
    <div>
      <div className="page-header">
        <div className="page-tag">Configuration</div>
        <h2>Settings</h2>
        <p>Loading...</p>
      </div>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="card"
          style={{ height: "120px", opacity: 0.4 }}
        >
          <div
            style={{
              height: "14px",
              width: "30%",
              background: "var(--border)",
              borderRadius: "4px",
              marginBottom: "16px",
            }}
          />
          <div
            style={{
              height: "10px",
              width: "60%",
              background: "var(--border)",
              borderRadius: "4px",
              opacity: 0.5,
            }}
          />
        </div>
      ))}
    </div>
  );
}
