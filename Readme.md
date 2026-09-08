# 📍 AquiIoT — Sistema IoT para Localização e Monitoramento em Ambientes Fechados

O **AquiIoT** é um projeto de Internet das Coisas (IoT) voltado ao desenvolvimento de um sistema de **localização e monitoramento de pessoas em ambientes fechados**, utilizando dispositivos de baixo custo e comunicação sem fio.

O projeto está sendo desenvolvido no componente curricular **Projeto Integrador V**, do curso de **Engenharia de Computação da Universidade Federal do Pampa (UNIPAMPA) — Campus Bagé**.

A proposta consiste na criação de um **chaveiro inteligente** que pode ser transportado pelo usuário e identificado por dispositivos instalados em diferentes setores de uma edificação.

O sistema foi pensado para ambientes nos quais tecnologias tradicionais de localização por GPS apresentam limitações, como:

- 🏥 Hospitais;
- 🏬 Shopping centers;
- 🏭 Indústrias;
- 🏫 Universidades;
- 🏢 Prédios comerciais;
- 🏗️ Grandes instalações e ambientes internos.

Além da localização, o chaveiro possuirá sensores para obtenção de informações do ambiente e mecanismos de alerta.

---

# 🎯 Objetivo

O objetivo do projeto é desenvolver o **AquiIoT**, um sistema IoT de baixo custo capaz de identificar a localização aproximada de um chaveiro inteligente em diferentes setores de um ambiente fechado.

O chaveiro será equipado com um microcontrolador com comunicação sem fio, sensor de temperatura, sensor de luminosidade e buzzer.

Pontos fixos instalados nos diferentes setores da edificação serão responsáveis por identificar os chaveiros próximos e encaminhar as informações para uma **Raspberry Pi**, utilizada como unidade central do sistema.

A Raspberry Pi será responsável pelo processamento e armazenamento das informações, execução da aplicação de monitoramento e controle de um alto-falante para emissão de alertas sonoros.

Por meio de uma interface gráfica, será possível acompanhar informações como:

- localização atual do chaveiro;
- identificação do dispositivo;
- temperatura;
- luminosidade;
- estado da conexão;
- horário da última atualização;
- histórico de movimentação;
- alertas do sistema.

---

# 💡 Motivação

Sistemas baseados em GPS apresentam limitações em ambientes internos devido à dificuldade de recepção dos sinais provenientes dos satélites.

Além disso, algumas soluções comerciais de localização indoor podem exigir infraestrutura específica e apresentar custos elevados de implantação.

O **AquiIoT** busca explorar uma alternativa baseada em dispositivos IoT e comunicação sem fio, utilizando componentes de baixo custo para identificar a presença e a movimentação de dispositivos entre diferentes setores de uma edificação.

O sistema não tem como objetivo inicialmente determinar coordenadas exatas dentro de uma sala. A proposta é identificar **em qual setor ou ambiente o chaveiro se encontra**.

Por exemplo:

```text
Chaveiro 01 → Recepção
Chaveiro 02 → Corredor A
Chaveiro 03 → Sala 02
```

---

# 🔑 Chaveiro AquiIoT

O elemento móvel do sistema será um **chaveiro inteligente**, transportado pelo usuário.

O chaveiro deverá possuir:

- microcontrolador com comunicação Wi-Fi;
- identificador único;
- sensor de temperatura;
- sensor de luminosidade;
- buzzer;
- sistema de alimentação;
- encapsulamento compacto.

Cada chaveiro será identificado individualmente pelo sistema.

Exemplo:

```text
ID: CHAVEIRO_01
Setor: SALA_02
Temperatura: 24.3 °C
Luminosidade: 315
Status: Online
```

---

# 🌡️ Sensor de temperatura

O chaveiro possuirá um sensor responsável pela medição da **temperatura do ambiente ao redor do dispositivo**.

As medições poderão ser transmitidas juntamente com as informações de localização e disponibilizadas na interface do AquiIoT.

Exemplo:

```text
Chaveiro: CH01
Temperatura: 24.3 °C
```

> O sensor será utilizado para monitoramento ambiental e não para medição da temperatura corporal do usuário.

---

# 💡 Sensor de luminosidade

O chaveiro também possuirá um **sensor de luminosidade**, permitindo obter informações relacionadas à quantidade de luz presente no ambiente.

Essas informações serão enviadas para o sistema central juntamente com os demais dados do dispositivo.

Exemplo:

```text
Chaveiro: CH01
Luminosidade: 315
```

---

# 🔈 Alto-falante da Raspberry Pi

Além dos alertas individuais dos chaveiros, a **Raspberry Pi será conectada a um alto-falante**.

Esse componente permitirá que a unidade central do AquiIoT reproduza alertas ou avisos sonoros.

Dessa maneira, o sistema possuirá dois mecanismos diferentes de atuação sonora:

### Alerta individual

```text
Chaveiro
   │
   ▼
 Buzzer
```

Utilizado para alertar ou localizar um dispositivo específico.

### Alerta central

```text
Raspberry Pi
     │
     ▼
Alto-falante
```

Utilizado para reproduzir avisos a partir da unidade central.

---

# 📡 Localização indoor

A localização será baseada na divisão da edificação em **setores**.

Cada setor possuirá um dispositivo fixo responsável por auxiliar na identificação dos chaveiros presentes naquela região.

Uma representação simplificada seria:

```text
┌──────────────────┐       ┌──────────────────┐
│     SETOR A      │       │     SETOR B      │
│                  │       │                  │
│      ESP32       │       │      ESP32       │
│        ↑         │       │        ↑         │
│        │         │       │        │         │
│    Chaveiro      │ ────► │    Chaveiro      │
│                  │       │                  │
└──────────────────┘       └──────────────────┘

             movimentação
             SETOR A → B
```

Quando o usuário se deslocar entre os ambientes, o sistema deverá reconhecer a mudança de setor.

---

# 🧠 Arquitetura do sistema

A arquitetura inicial do AquiIoT pode ser representada da seguinte maneira:

```text
┌──────────────────────────┐
│    CHAVEIRO AQUIIoT      │
│                          │
│  Microcontrolador        │
│       │                  │
│       ├── Temperatura    │
│       ├── Luminosidade   │
│       └── Buzzer         │
└────────────┬─────────────┘
             │
             │ Comunicação sem fio
             ▼
┌──────────────────────────┐
│      PONTO FIXO          │
│          ESP32           │
│                          │
│ Identificação do setor   │
└────────────┬─────────────┘
             │
             │ Rede
             ▼
┌──────────────────────────┐
│       RASPBERRY PI       │
│                          │
│  Servidor                │
│  Processamento           │
│  Banco de dados          │
│  Aplicação               │
└───────┬──────────┬───────┘
        │          │
        ▼          ▼
   Dashboard   Alto-falante
```

---

# 🔄 Fluxo de informações

O fluxo principal de informações será:

```text
Sensores
   ↓
Chaveiro
   ↓
Comunicação sem fio
   ↓
ESP32 do setor
   ↓
Rede local
   ↓
Raspberry Pi
   ↓
Processamento
   ↓
Banco de dados
   ↓
Interface gráfica
```

No sentido contrário, o sistema poderá enviar comandos:

```text
Interface
   ↓
Raspberry Pi
   ↓
Rede
   ↓
Dispositivo
   ↓
Buzzer / atuação
```

---

# 🖥️ Raspberry Pi

A Raspberry Pi será utilizada como **unidade central do AquiIoT**.

Entre suas responsabilidades previstas estão:

- receber dados dos dispositivos;
- processar informações de localização;
- armazenar dados;
- manter o histórico dos dispositivos;
- executar o backend;
- disponibilizar dados para a interface gráfica;
- gerenciar eventos;
- emitir alertas;
- controlar o alto-falante.

---

# 📊 Interface gráfica

Será desenvolvida uma interface para acompanhamento do sistema.

Uma representação inicial é:

```text
┌─────────────────────────────────────────────────────────┐
│                       AquiIoT                           │
├────────────┬────────────┬──────────┬───────────┬────────┤
│ Chaveiro   │ Localização│ Temp.    │ Luz       │ Status │
├────────────┼────────────┼──────────┼───────────┼────────┤
│ CH01       │ Sala 01    │ 24.3 °C  │ 315       │ Online │
│ CH02       │ Corredor A │ 23.8 °C  │ 180       │ Online │
│ CH03       │ Sala 03    │ --       │ --        │ Offline│
└────────────┴────────────┴──────────┴───────────┴────────┘
```

A interface deverá evoluir durante o desenvolvimento do projeto.

---

# 🧩 Componentes

A lista inicial de componentes previstos para o protótipo inclui:

| Componente | Função |
|---|---|
| Microcontrolador do chaveiro | Controle do dispositivo móvel |
| ESP32 | Identificação/comunicação dos setores |
| Raspberry Pi | Unidade central do sistema |
| Sensor de temperatura | Monitoramento da temperatura ambiente |
| Sensor de luminosidade | Monitoramento da luminosidade |
| Buzzer | Alerta sonoro individual |
| Alto-falante | Alertas sonoros da unidade central |
| Fonte/bateria | Alimentação dos dispositivos |

> Os modelos específicos de alguns componentes poderão ser alterados durante o desenvolvimento após testes de consumo, alcance, compatibilidade e desempenho.

---

# 🛠️ Tecnologias

As tecnologias previstas incluem:

- ESP32;
- microcontroladores com Wi-Fi para os chaveiros;
- Raspberry Pi;
- Wi-Fi;
- sistemas embarcados;
- Internet das Coisas (IoT);
- sensores;
- backend;
- banco de dados;
- interface gráfica;
- Git/GitHub;
- Trello;
- metodologia Scrum.

As tecnologias de software e protocolos específicos serão documentados conforme forem definidos durante o desenvolvimento.

---

# 🏃 Organização do desenvolvimento

O projeto será desenvolvido utilizando princípios da metodologia **Scrum**.

A equipe é composta por **três integrantes** e o desenvolvimento será dividido em **Sprints de aproximadamente 15 dias**.

As atividades serão organizadas utilizando o **Trello**, enquanto códigos e documentação serão versionados neste repositório.

---

## Sprint 1 — Planejamento e arquitetura

Nesta Sprint será realizado o planejamento inicial do AquiIoT, incluindo levantamento de requisitos, definição da arquitetura, seleção inicial dos componentes, organização do repositório e configuração dos ambientes de desenvolvimento. Também serão realizados os primeiros testes de comunicação entre os microcontroladores.

**Resultado esperado:** arquitetura do sistema definida, requisitos documentados e primeira comunicação entre os dispositivos funcionando.

---

## Sprint 2 — Desenvolvimento do chaveiro

Nesta Sprint será desenvolvida a primeira versão funcional do chaveiro AquiIoT. Serão integrados o microcontrolador, sensor de temperatura, sensor de luminosidade e buzzer. Também será implementada a identificação individual do dispositivo e realizados testes iniciais de alimentação e comunicação.

**Resultado esperado:** chaveiro capaz de realizar leituras dos sensores, possuir identificação própria, comunicar-se com o sistema e emitir alertas pelo buzzer.

---

## Sprint 3 — Localização por setores

Nesta Sprint será desenvolvido o mecanismo de localização indoor baseado em setores. Diferentes ESP32 serão instalados como pontos fixos e serão realizados testes de movimentação dos chaveiros entre os ambientes.

**Resultado esperado:** identificar em qual setor determinado chaveiro está localizado e detectar sua movimentação entre diferentes setores.

---

## Sprint 4 — Integração com a Raspberry Pi

Nesta Sprint será realizada a integração dos dispositivos com a Raspberry Pi. Será implementada a comunicação para envio das informações de localização e sensores até a unidade central, além do início do desenvolvimento do servidor e armazenamento dos dados.

**Resultado esperado:** dados dos chaveiros sendo transmitidos pelos pontos fixos e recebidos corretamente pela Raspberry Pi.

---

## Sprint 5 — Interface e sistema de alertas

Nesta Sprint será desenvolvida a interface gráfica do AquiIoT e realizada a integração dos mecanismos de atuação. O sistema deverá apresentar os dispositivos e seus dados em tempo real, permitir o acionamento do buzzer dos chaveiros e utilizar o alto-falante conectado à Raspberry Pi para alertas centralizados.

**Resultado esperado:** sistema integrado capaz de monitorar os chaveiros e realizar ações e alertas por meio da interface.

---

## Sprint 6 — Testes e validação

Nesta Sprint serão realizados testes integrados do sistema, incluindo localização, sensores, comunicação, buzzer, alto-falante, servidor e interface.

Serão avaliados aspectos como:

- estabilidade da comunicação;
- identificação correta dos setores;
- latência;
- perda de conexão;
- reconexão;
- comportamento diante de obstáculos;
- funcionamento simultâneo de diferentes chaveiros.

**Resultado esperado:** versão estável do AquiIoT, acompanhada dos resultados experimentais e das correções identificadas durante os testes.

---

## Sprint 7 — Finalização

Nesta Sprint serão realizadas as correções finais, organização do código, atualização da documentação, consolidação dos resultados e preparação da demonstração final.

**Resultado esperado:** versão final e demonstrável do AquiIoT, acompanhada da documentação técnica e dos resultados obtidos durante seu desenvolvimento.

---

# 📁 Organização do repositório

A estrutura abaixo representa a organização inicialmente planejada:

```text
AquiIoT/
│
├── firmware/
│   ├── chaveiro/
│   └── esp32_setor/
│
├── raspberry/
│   ├── backend/
│   ├── database/
│   └── speaker/
│
├── interface/
│
├── docs/
│   ├── diagramas/
│   ├── testes/
│   └── resultados/
│
├── hardware/
│   ├── esquemas/
│   └── componentes/
│
├── README.md
└── LICENSE
```

A estrutura poderá ser modificada conforme o projeto evoluir.

---

# 🧪 Testes previstos

Durante o desenvolvimento serão realizados experimentos para avaliar o comportamento do sistema.

Entre os testes previstos estão:

- localização em diferentes setores;
- movimentação entre setores;
- alcance da comunicação;
- influência de paredes e obstáculos;
- múltiplos chaveiros simultaneamente;
- leitura dos sensores;
- acionamento do buzzer;
- reprodução pelo alto-falante;
- perda e recuperação da conexão;
- latência da comunicação;
- estabilidade do sistema.

---

# 📈 Resultados esperados

Ao final do projeto, espera-se obter um protótipo capaz de:

1. identificar individualmente diferentes chaveiros;
2. determinar aproximadamente o setor em que cada chaveiro está localizado;
3. detectar mudanças entre setores;
4. coletar temperatura e luminosidade;
5. transmitir as informações pela rede;
6. centralizar os dados em uma Raspberry Pi;
7. armazenar informações e histórico;
8. apresentar os dados por meio de uma interface gráfica;
9. acionar remotamente o buzzer de um chaveiro;
10. reproduzir alertas através do alto-falante da Raspberry Pi.

---

# 🚧 Status do projeto

> 🟡 **Em desenvolvimento**

O projeto encontra-se atualmente na fase de planejamento, definição da arquitetura e desenvolvimento dos primeiros protótipos.

Este README será atualizado conforme novas funcionalidades forem implementadas e validadas.

---

# 👥 Equipe

Projeto desenvolvido por uma equipe de três integrantes do curso de **Engenharia de Computação da Universidade Federal do Pampa (UNIPAMPA) — Campus Bagé**.

**Componente curricular:** Projeto Integrador V  
**Semestre:** 2026/2

---

# 📝 Documentação

Toda a documentação necessária para compreender o projeto será mantida neste repositório.

Conforme o desenvolvimento avançar, serão adicionados:

- diagramas da arquitetura;
- esquemas de hardware;
- documentação dos firmwares;
- protocolos de comunicação;
- instruções de instalação;
- instruções de execução;
- resultados dos testes;
- documentação da API;
- documentação da interface.

---

# 📌 Observação

O AquiIoT é um **protótipo acadêmico experimental**. O projeto busca estudar e demonstrar a integração entre sistemas embarcados, sensores, comunicação sem fio, localização indoor, processamento centralizado e software em uma arquitetura de Internet das Coisas.

As características, componentes e arquitetura descritos neste documento poderão sofrer alterações durante as etapas de desenvolvimento, testes e validação.
