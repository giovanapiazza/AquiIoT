function SummaryCard(props) {
  return (
    <div className="summary-card">
      <p>{props.titulo}</p>
      <strong>{props.valor}</strong>
    </div>
  )
}

export default SummaryCard