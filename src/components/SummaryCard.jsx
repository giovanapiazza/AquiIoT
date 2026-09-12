function SummaryCard(props) {
    return (
        <div>
            <h3>{props.titulo}</h3>
            <p>{props.valor}</p>
        </div>
    )
}

export default SummaryCard