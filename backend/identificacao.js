// Padrão de identificação PPSSAATTNN (10 dígitos):
//   PP planta, SS setor, AA área, TT tipo de hardware, NN número do nó.
// O chaveiro (ESP8266) conhece só o próprio TTNN; o ESP32 do setor acrescenta
// o PPSSAA da área onde o chaveiro foi detectado.
// Cadastro central dos nomes: setor e área dependem da planta.
const plantas = {
  '01': { nome: 'Hospital', setores: {
    '01': { nome: 'Recepção' },
    '02': { nome: 'Corredores' },
    '03': { nome: 'Enfermaria', areas: { '01': 'Ala A', '02': 'Ala B', '03': 'Ala C' } },
    '04': { nome: 'Pronto atendimento' },
  } },
  '02': { nome: 'Shopping', setores: {} },
  '03': { nome: 'Indústria', setores: {} },
}
const tipos = { '01': 'Raspberry Pi', '02': 'ESP32', '03': 'ESP8266' }

const CODIGO = /^\d{10}$/

function decode(codigo) {
  if (typeof codigo !== 'string' || !CODIGO.test(codigo)) return null
  const [pp, ss, aa, tt, nn] = codigo.match(/\d{2}/g)
  const planta = plantas[pp]
  const setor = planta?.setores[ss]
  return {
    codigo,
    local: pp + ss + aa,
    no: tt + nn,
    planta: planta?.nome ?? `Planta ${pp}`,
    setor: setor?.nome ?? `Setor ${ss}`,
    area: setor?.areas?.[aa] ?? `Área ${aa}`,
    tipo: tipos[tt] ?? `Tipo ${tt}`,
    numero: nn,
  }
}

// Nome legível da área, usado como nome do setor no banco
function nomeLocal(info) {
  return `${info.planta} · ${info.setor} · ${info.area}`
}

module.exports = { decode, nomeLocal, tipos, plantas }
