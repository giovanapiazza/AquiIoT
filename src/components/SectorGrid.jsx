import SectorBlock from "./SectorBlock.jsx"

function SectorGrid({
  setores,
  dispositivos
}) {
  return (
    <section
      className="sector-section"
      id="setores"
    >
      <div className="section-title">
        <div>
          <h2>Dispositivos por setor</h2>
          <p>Distribuição atual em tempo real</p>
        </div>
      </div>

      <div className="sector-grid">
        {setores.map(setor => (
          <SectorBlock
            key={setor.id}
            setor={setor}
            dispositivos={dispositivos}
          />
        ))}
      </div>
    </section>
  )
}

export default SectorGrid