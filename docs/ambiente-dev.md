# Ambiente de desenvolvimento local

O arquivo [`compose.yaml`](../compose.yaml) sobe a API com o banco SQLite e a
interface em contêineres Node.js 24, sem instalar Node na máquina. O código é
montado dos diretórios do repositório, então as edições têm efeito na hora:

| Serviço | Endereço | Recarregamento |
|---|---|---|
| `web` (Vite) | <http://localhost:5173> | HMR: a página atualiza ao salvar arquivos de `servidor/front/src/`. |
| `api` (Express + SQLite) | <http://localhost:3000> | `node --watch` reinicia o servidor ao salvar arquivos `.js` do backend. |

Alterações em `servidor/banco/migrations/*.sql` não reiniciam a API; use
`docker compose restart api` depois de adicionar uma migração.

## Subir e parar

Com Docker:

```bash
docker compose up        # primeiro plano, com logs; Ctrl+C para parar
docker compose up -d     # em segundo plano
docker compose logs -f api
docker compose down      # para e remove os contêineres, preservando o banco
```

Com Podman (sem root), o mesmo arquivo funciona com `podman compose`. Se o
`podman compose` usar o `docker-compose` como provedor, ative o socket do Podman
uma vez e aponte o `DOCKER_HOST` para ele:

```bash
systemctl --user enable --now podman.socket
export DOCKER_HOST=unix:///run/user/$(id -u)/podman/podman.sock
podman compose up
```

Na primeira execução, cada serviço roda `npm ci` dentro do contêiner. As
dependências ficam em volumes próprios (`api_node_modules` e `web_node_modules`),
separadas de qualquer `node_modules` da máquina. Depois de mudar um
`package.json`/`package-lock.json`, reinicie o serviço correspondente para
reinstalar.

## Banco de dados

O SQLite fica no volume `aquiiot_data`, em `/data/aquiiot.sqlite` dentro do
contêiner da API. Ele sobrevive a `down`/`up` e não se mistura com
`servidor/banco/data/` da máquina nem com o banco da Raspberry Pi. O banco começa vazio;
para gerar dados de teste, use os exemplos `curl` de [database.md](database.md).

```bash
# Testes do backend dentro do contêiner
docker compose exec api npm test

# Backup do banco de desenvolvimento para a máquina
docker compose exec api npm run db:backup -- /data/backup.sqlite
docker compose cp api:/data/backup.sqlite ./backup-dev.sqlite

# Apagar o banco de desenvolvimento e começar do zero
docker compose down
docker volume rm aquiiot-dev_aquiiot_data   # ou: podman volume rm ...
```

As variáveis do backend (`OFFLINE_AFTER_MS` etc.) estão no serviço `api` do
`compose.yaml`. A interface aponta para a API em `http://localhost:3000` pela
variável `VITE_API_URL` do serviço `web`.

## ESP32 e o banco de desenvolvimento

Os firmwares dos ESP32 enviam por padrão ao **backend do servidor** (Raspberry
Pi), configurado em `URL_BACKEND` no `segredos.h` de cada firmware. Este banco
de desenvolvimento não recebe nada dos dispositivos.

Só para depurar a API, dá para apontar temporariamente um ESP32 para
`http://<IP-da-sua-máquina>:3000` (a porta 3000 é publicada em todas as
interfaces; o firewall precisa permitir). Volte para o endereço do servidor
antes de instalar o ESP32: o que ele enviar nesse meio-tempo fica só neste
banco.
