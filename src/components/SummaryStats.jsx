function SummaryStats({
  dispositivos,
  setores,
  online
}) {
  return (
    <div className="summary-stats">
      <div>
        <strong>{dispositivos}</strong>
        <span>dispositivos</span>
      </div>

      <div className="summary-divider"></div>

      <div>
        <strong>{setores}</strong>
        <span>setores</span>
      </div>

      <div className="summary-divider"></div>

      <div>
        <strong>{online}</strong>
        <span>online</span>
      </div>
    </div>
  )
}

export default SummaryStats