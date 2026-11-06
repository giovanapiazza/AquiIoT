-- Alertas por limite de sensor, definidos pela interface.
-- Uma regra vale para uma área (setor_id) ou para todas (NULL). Cada leitura
-- recebida é comparada com as regras ativas do sensor correspondente.
CREATE TABLE regras_alerta (
  id INTEGER PRIMARY KEY,
  sensor TEXT NOT NULL CHECK(sensor IN ('temperatura', 'umidade', 'luminosidade', 'luminosidade_adc', 'som')),
  operador TEXT NOT NULL CHECK(operador IN ('maior', 'menor')),
  limite REAL NOT NULL,
  setor_id INTEGER REFERENCES setores(id) ON DELETE CASCADE,
  nivel TEXT NOT NULL DEFAULT 'aviso' CHECK(nivel IN ('aviso', 'erro')),
  ativa INTEGER NOT NULL DEFAULT 1 CHECK(ativa IN (0, 1)),
  descricao TEXT CHECK(descricao IS NULL OR length(descricao) <= 200),
  criado_em INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_regras_alerta_sensor ON regras_alerta(sensor, ativa);
CREATE INDEX idx_regras_alerta_setor ON regras_alerta(setor_id);

-- Um alerta fica aberto enquanto a origem (área ou chaveiro) continua fora do
-- limite; a primeira leitura dentro do limite o encerra (resolvido_em).
-- Reconhecer só indica que alguém já viu; não encerra o alerta.
CREATE TABLE alertas (
  id INTEGER PRIMARY KEY,
  regra_id INTEGER NOT NULL REFERENCES regras_alerta(id) ON DELETE CASCADE,
  origem TEXT NOT NULL CHECK(length(origem) BETWEEN 1 AND 130),
  setor_id INTEGER REFERENCES setores(id) ON DELETE CASCADE,
  dispositivo_id TEXT REFERENCES dispositivos(id) ON DELETE CASCADE,
  valor REAL NOT NULL,
  valor_atual REAL NOT NULL,
  iniciado_em INTEGER NOT NULL,
  atualizado_em INTEGER NOT NULL,
  resolvido_em INTEGER,
  reconhecido_em INTEGER
) STRICT;
-- No máximo um alerta aberto por regra e origem
CREATE UNIQUE INDEX idx_alertas_aberto ON alertas(regra_id, origem) WHERE resolvido_em IS NULL;
CREATE INDEX idx_alertas_data ON alertas(iniciado_em DESC, id DESC);
CREATE INDEX idx_alertas_setor ON alertas(setor_id);
CREATE INDEX idx_alertas_dispositivo ON alertas(dispositivo_id);
