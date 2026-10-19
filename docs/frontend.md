# Interface AquiIoT

Execute `node backend/server.js` e, em outro terminal, `npm run dev` na raiz.
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

## Limitações da API atual

- Não existe endpoint dedicado a cadastro manual de dispositivos. O formulário
  permanece desabilitado com explicação. `POST /api/localizacao` registra uma
  detecção e pode incluir um dispositivo automaticamente; a interface não usa
  essa rota para simular cadastro.
- Eventos fornecem apenas `id`, `dispositivo`, `setor` e `horario`. Origem e RSSI
  ausentes aparecem como `—`. Sem data completa, o filtro de data fica desabilitado.
- Sem datas, o histórico preserva a ordem retornada pelo servidor (novos registros
  são inseridos no início pelo backend). Não infere datas nem ordena horários
  isolados, o que poderia inverter registros de dias diferentes. Se todos os
  eventos contiverem `data`, `timestamp` ou `dataHora` em formato ISO, o histórico
  habilita o filtro de data e ordena pela data completa.
- O backend mantém os dados em memória e contém registros iniciais próprios.
  O frontend exibe exclusivamente as respostas reais da API.
