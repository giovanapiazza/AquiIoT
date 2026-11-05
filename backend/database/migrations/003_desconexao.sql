-- Momento em que o ESP32 avisou que o chaveiro saiu da rede do setor.
-- O dispositivo fica offline até a próxima localização.
ALTER TABLE dispositivos ADD COLUMN desconectado_em INTEGER;
