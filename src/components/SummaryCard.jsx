function SummaryCard(props) {
  return (
    <div className="summary-card">
      <h3>{props.titulo}</h3>
      <p>{props.valor}</p>
    </div>
  )
}

export default SummaryCard