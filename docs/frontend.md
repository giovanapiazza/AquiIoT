# Interface AquiIoT

Com Node.js 24 ou superior, execute `npm --prefix backend ci` e
`npm --prefix backend start`. Em outro terminal, execute `npm run dev` na raiz.
Use `npm run build` para compilar e `npm run lint` para verificar o código.

A API padrão é `http://localhost:3000`. Para outro endereço, configure
`VITE_API_URL` em um arquivo `.env.local` e reinicie o Vite. Não inclua `/api`
no endereço. As consultas GET são centralizadas em `src/services/api.js`.

As cinco páginas usam URLs com hash (`#dispositivos`, `#setores`, `#historico`,
`#configuracoes` e `#visao-geral`). A navegação não recarrega a aplicação e
suporta voltar/avançar do navegador. O layout mantém o menu e o cabeçalho comuns.

A preferência de atualização (2, 5 ou 10 segundos) é aplicada imediatamente,
com armazenamento local quando disponível. O intervalo é contado após concluir
cada consulta para evitar requisições sobrepostas. Falhas preservam os últimos
dados com aviso explícito e permitem tentar novamente.

## Integração com o banco e limitações

O backend utiliza SQLite persistente e inicia sem dados de demonstração. O
esquema, a execução na Raspberry Pi e os endpoints estão documentados em
[database.md](database.md). A interface exibe exclusivamente as respostas reais
da API.

- Não existe endpoint dedicado a cadastro manual de dispositivos. O formulário
  permanece desabilitado com explicação. `POST /api/localizacao` registra uma
  detecção e pode incluir um dispositivo automaticamente; a interface não usa
  essa rota para simular cadastro.
- Eventos de localização agora incluem `origem`, `destino`, `rssi` e `data`
  completa em ISO. O histórico ordena pela data e habilita o filtro por dia quando
  há registros com datas completas. Origem da primeira detecção e RSSI não
  informado continuam ausentes e aparecem como `—`.
- A interface permanece compatível com respostas antigas sem data completa:
  nesse caso, preserva a ordem retornada pela API e desabilita o filtro por dia,
  sem inferir datas a partir de horários isolados.
- `/api/eventos` apresenta detecções e movimentações. Os eventos gerais e de
  leitura ambiental estão disponíveis na API em `/api/eventos/sistema`; a página
  Histórico atual consulta os eventos de localização.
- As listagens históricas da API retornam até 1000 registros por padrão. O filtro
  da página Histórico atua nos registros carregados; consultas maiores ou
  paginação por intervalo estão disponíveis nos endpoints descritos em
  [database.md](database.md).

Datas completas do histórico são exibidas e filtradas no fuso `America/Sao_Paulo`, inclusive perto da meia-noite; o armazenamento permanece em UTC.
