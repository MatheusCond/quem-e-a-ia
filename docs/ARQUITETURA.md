# Arquitetura

## Visão geral

```mermaid
flowchart TB
  subgraph Navegador
    web["React + Vite<br/>(apps/web)"]
  end

  subgraph "docker compose"
    nginx["nginx<br/>serve o front e encaminha /api e /socket.io"]
    api["API · NestJS<br/>(apps/api)"]
    worker["Worker · NestJS<br/>(apps/worker)"]
    pg[("PostgreSQL<br/>public: salas, partidas, mensagens<br/>worker: uso de IA e estatísticas")]
    subgraph LocalStack
      sns{{SNS}}
      sqs[/SQS + DLQs/]
      s3[(S3)]
      sm[Secrets Manager]
    end
    ollama["Ollama (perfil opcional)"]
  end

  gemini(("Gemini API"))

  web --> nginx --> api
  api --> pg
  api --> sns --> sqs
  sqs --> api
  sqs --> worker
  worker --> sns
  worker --> pg
  api --> s3
  api --> sm
  worker --> sm
  worker --> gemini
  worker --> ollama
```

Três processos: **web** (nginx com o build do React), **api** e **worker**. A api e o
worker são aplicações NestJS separadas, cada uma com seu Dockerfile, sua
configuração e suas migrações. Elas não chamam uma à outra: conversam só por
eventos no SNS/SQS.

## Módulos

### packages/shared

Contratos usados pelos três lados, sem dependências de runtime:

- `socket-events.ts`: eventos do WebSocket (cliente → servidor e servidor →
  cliente), tipados. Se a API e o front divergirem, o TypeScript avisa.
- `views.ts`: o que o servidor manda para cada jogador (`RoomStateView`,
  `MatchView`, `RevealView`...).
- `bus-events.ts`: eventos do SNS/SQS e o mapa tópico → filas.
- `room-settings.ts`: configurações da sala, valores padrão e saneamento.
- `moderation.ts`: lista de bloqueio com normalização (acentos, leetspeak, letras
  repetidas).

### packages/cloud

Infraestrutura AWS compartilhada pela api e pelo worker:

- `MessageBus` (interface) com `AwsMessageBus` (SNS para publicar, SQS com long
  polling para consumir) e `InMemoryMessageBus` (testes e modo processo único).
  `createMessageBus` escolhe pelo `MESSAGE_BUS`; no driver `memory`, a API e o
  worker do mesmo processo recebem a mesma instância
  ([HOSPEDAGEM.md](HOSPEDAGEM.md)).
- `loadSecrets`: Secrets Manager com fallback para variáveis de ambiente.
- `ApiKeyCipher`: AES-256-GCM para a chave própria do Mestre.

### apps/api

| Módulo | domain | application | infrastructure |
| --- | --- | --- | --- |
| rooms | `Room`, `Player`, código da sala, apelido | `RoomsService` (criar, entrar, avatar) | schemas, `RoomsController`, DTOs |
| game | `GameMatch` (agregado), máquina de estados, sorteio, regras do chat, pontuação | `MatchService`, `ChatService`, `RankingService`, `RoomPresenter`, `MessageDelivery`, `AiTurnPublisher` | `GameGateway`, `SocketRealtime`, consumidores de fila, schemas |
| moderation | `Report` | (usado pelo `ChatService`) | schema |
| auth | | `PlayerTokenService` (JWT) | `PlayerAuthGuard` |

Infraestrutura comum: `RoomTransaction` (lock por sala + unidade de trabalho),
`Scheduler` (timers), `ObjectStorage` (S3), filtro de erros e healthcheck.

### apps/worker

| Módulo | domain | application | infrastructure |
| --- | --- | --- | --- |
| ai-turn | decisão de responder, prompt, detecção de "saiu do personagem" | `AiTurnHandler` | provedores de LLM (Gemini, Ollama, Fake) |
| usage | disjuntor de orçamento, registros | `BudgetService`, `MatchStatsHandler`, `UsageRepository` (porta) | `PostgresUsageRepository`, schemas, `/health` e `/stats` |

### apps/web

- `lib/useGame.ts`: conexão Socket.IO, estado recebido, chat, "digitando..." e
  reconexão.
- `screens/`: uma tela por fase (`Lobby`, `CreationPhase`, `ChatPhase`,
  `RevealScreen`), escolhida em `RoomScreen` pela fase que o servidor manda.

## Dados

```mermaid
erDiagram
  rooms ||--o{ players : "room_id"
  rooms ||--o{ matches : "room_id"
  matches ||--o{ messages : "match_id"
  matches ||--o{ reports : "match_id"

  rooms { uuid id varchar code uuid host_player_id jsonb settings }
  players { uuid id uuid room_id varchar nickname varchar avatar_key int total_score }
  matches { uuid id uuid room_id int number varchar phase timestamptz phase_ends_at jsonb settings jsonb seats jsonb scores bool ranking_applied }
  messages { uuid id uuid match_id uuid seat_id varchar kind text text bool is_ai timestamptz visible_at }
  reports { uuid id uuid match_id uuid message_id varchar reason }
```

- Agregados se referenciam só por id (sem relações do ORM), e por isso não há
  chaves estrangeiras declaradas.
- Os lugares (`seats`) ficam em JSON dentro da partida: são lidos e gravados sempre
  junto com ela. Cada lugar guarda pseudônimo, avatar, papel (jogador ou Mestre),
  persona, voto e contadores.
- `messages.visible_at` é o momento em que a mensagem aparece para os outros (pode
  ser no futuro, por causa do atraso realista).
- O worker tem o schema `worker`: `daily_usage` (disjuntor), `match_usage` e
  `match_stats`.

## Eventos

| Tópico SNS | Evento | Fila SQS | Quem consome |
| --- | --- | --- | --- |
| `chat-events` | `ai.turn.requested` | `ai-turns` | worker |
| `ai-replies` | `ai.reply`, `ai.unavailable` | `ai-replies-api` | api |
| `match-events` | `match.finished` | `match-ranking` | api (ranking) |
| | | `match-stats` | worker (estatísticas) |

Todas as filas têm DLQ (`<fila>-dlq`) com `maxReceiveCount` 3. As assinaturas usam
"raw message delivery", então o corpo da mensagem SQS é o próprio evento JSON.

## Caminho de uma mensagem

```mermaid
sequenceDiagram
  participant B as Navegador (Beto)
  participant G as GameGateway
  participant C as ChatService
  participant DB as Postgres
  participant SNS as SNS chat-events
  participant W as Worker
  participant L as LLM
  participant SNS2 as SNS ai-replies
  participant All as Navegadores da sala

  B->>G: chat:send { text }
  G->>C: sendMessage(auth, text)
  C->>DB: grava mensagem (visible_at = agora + atraso)
  G-->>B: ack { ok: true }
  Note over C: Scheduler espera o atraso
  C->>All: chat:message
  C->>SNS: ai.turn.requested
  SNS->>W: (fila ai-turns)
  W->>W: decide se responde · checa disjuntor
  W->>L: prompt
  L-->>W: resposta
  W->>SNS2: ai.reply
  SNS2->>C: (fila ai-replies-api)
  C->>All: chat:typing (duração proporcional ao texto)
  C->>DB: grava mensagem da IA
  C->>All: chat:message (depois do "digitando...")
```

## Fases da partida

```mermaid
stateDiagram-v2
  [*] --> lobby
  lobby --> creation: anfitrião começa
  creation --> conversation: prazo ou todos os Mestres prontos
  conversation --> voting: prazo ou IA indisponível
  voting --> reveal: prazo ou todos votaram*
  reveal --> [*]
```

\* Com o número de IAs secreto, a votação não encerra antes do prazo (contar quem
falta votar entregaria quantos Mestres existem).

As transições estão em `apps/api/src/modules/game/domain/match-state-machine.ts`; o
que acontece em cada uma, em `GameMatch.transitionTo`.
