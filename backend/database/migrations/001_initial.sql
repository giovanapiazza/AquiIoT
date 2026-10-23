CREATE TABLE setores (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE CHECK(length(trim(nome)) BETWEEN 1 AND 120),
  esp32 TEXT UNIQUE CHECK(esp32 IS NULL OR length(trim(esp32)) BETWEEN 1 AND 120),
  descricao TEXT,
  criado_em INTEGER NOT NULL
) STRICT;

CREATE TABLE dispositivos (
  id TEXT PRIMARY KEY CHECK(length(trim(id)) BETWEEN 1 AND 120),
  nome TEXT,
  criado_em INTEGER NOT NULL
) STRICT;

CREATE TABLE localizacoes (
  id INTEGER PRIMARY KEY,
  dispositivo_id TEXT NOT NULL REFERENCES dispositivos(id) ON DELETE RESTRICT,
  setor_id INTEGER NOT NULL REFERENCES setores(id) ON DELETE RESTRICT,
  rssi INTEGER CHECK(rssi IS NULL OR rssi BETWEEN -127 AND 0),
  registrado_em INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_localizacoes_dispositivo_data ON localizacoes(dispositivo_id, registrado_em DESC, id DESC);
CREATE INDEX idx_localizacoes_setor_data ON localizacoes(setor_id, registrado_em DESC, id DESC);

CREATE TABLE leituras_ambientais (
  id INTEGER PRIMARY KEY,
  dispositivo_id TEXT NOT NULL REFERENCES dispositivos(id) ON DELETE RESTRICT,
  localizacao_id INTEGER REFERENCES localizacoes(id) ON DELETE RESTRICT,
  temperatura REAL,
  luminosidade REAL CHECK(luminosidade IS NULL OR luminosidade >= 0),
  registrado_em INTEGER NOT NULL,
  CHECK(temperatura IS NOT NULL OR luminosidade IS NOT NULL)
) STRICT;
CREATE INDEX idx_leituras_dispositivo_data ON leituras_ambientais(dispositivo_id, registrado_em DESC, id DESC);
CREATE INDEX idx_leituras_localizacao ON leituras_ambientais(localizacao_id);

CREATE TABLE eventos (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL CHECK(length(trim(tipo)) BETWEEN 1 AND 80),
  nivel TEXT NOT NULL CHECK(nivel IN ('info', 'aviso', 'erro')),
  mensagem TEXT NOT NULL,
  dispositivo_id TEXT REFERENCES dispositivos(id) ON DELETE RESTRICT,
  setor_id INTEGER REFERENCES setores(id) ON DELETE RESTRICT,
  origem_setor_id INTEGER REFERENCES setores(id) ON DELETE RESTRICT,
  localizacao_id INTEGER REFERENCES localizacoes(id) ON DELETE RESTRICT,
  detalhes TEXT CHECK(detalhes IS NULL OR json_valid(detalhes)),
  registrado_em INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_eventos_data ON eventos(registrado_em DESC, id DESC);
CREATE INDEX idx_eventos_dispositivo_data ON eventos(dispositivo_id, registrado_em DESC, id DESC);
CREATE INDEX idx_eventos_setor_data ON eventos(setor_id, registrado_em DESC, id DESC);
CREATE INDEX idx_eventos_localizacao ON eventos(localizacao_id);
CREATE INDEX idx_eventos_origem ON eventos(origem_setor_id);
