-- Vários ESP32 por área: áreas grandes podem ter mais de um receptor, cada um
-- com ID PPSSAA02NN. Substitui a coluna setores.esp32 (um ESP32 por área).
CREATE TABLE receptores (
  id TEXT PRIMARY KEY CHECK(length(trim(id)) BETWEEN 1 AND 120),
  setor_id INTEGER NOT NULL REFERENCES setores(id) ON DELETE RESTRICT,
  criado_em INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_receptores_setor ON receptores(setor_id, criado_em, id);

INSERT INTO receptores (id, setor_id, criado_em)
SELECT esp32, id, criado_em FROM setores WHERE esp32 IS NOT NULL;

-- O SQLite não remove coluna com UNIQUE; ela fica vazia e sem uso.
UPDATE setores SET esp32 = NULL;
