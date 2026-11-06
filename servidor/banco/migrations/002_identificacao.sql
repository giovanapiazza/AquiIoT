-- Padrão de identificação PPSSAATTNN (backend/identificacao.js).
-- setores.codigo: PPSSAA da área; localizacoes.codigo: código completo recebido.
ALTER TABLE setores ADD COLUMN codigo TEXT CHECK(codigo IS NULL OR (length(codigo) = 6 AND codigo NOT GLOB '*[^0-9]*'));
CREATE UNIQUE INDEX idx_setores_codigo ON setores(codigo);
ALTER TABLE localizacoes ADD COLUMN codigo TEXT CHECK(codigo IS NULL OR (length(codigo) = 10 AND codigo NOT GLOB '*[^0-9]*'));
