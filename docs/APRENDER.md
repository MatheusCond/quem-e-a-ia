# Aprender o código

Guia para entender, explicar e alterar o projeto. Os caminhos são relativos à raiz
do repositório.

## 1. O caminho de uma mensagem, do início ao fim

Beto digita "quem aqui gosta de capivara?" e toca em enviar.

1. **Cliente.** `apps/web/src/screens/ChatPhase.tsx` (`Composer`) chama
   `game.send('chat:send', { text })`. O hook `apps/web/src/lib/useGame.ts` emite o
   evento no Socket.IO e espera o ack (resposta) por até 8 segundos.
2. **WebSocket.** `apps/api/src/modules/game/infrastructure/game.gateway.ts`
   recebe em `@SubscribeMessage('chat:send')`. O jogador já foi autenticado na
   conexão (middleware em `afterInit`, que valida o JWT). O gateway só chama o caso
   de uso dentro de `respond()`, que transforma sucesso ou `GameError` no ack.
3. **Caso de uso.** `ChatService.sendMessage`
   (`apps/api/src/modules/game/application/chat.service.ts`) abre um
   `RoomTransaction.run(roomId, ...)`: pega o lock da sala e um `EntityManager`
   novo.
4. **Domínio.** `GameMatch.registerHumanMessage`
   (`apps/api/src/modules/game/domain/game-match.ts`) confere a fase, se quem
   escreve não é o Mestre, o tamanho, a moderação e o intervalo mínimo
   (`chat-rules.ts`). Devolve o lugar (seat) e o texto limpo.
5. **Banco.** `ChatMessage.create` monta a mensagem com `visibleAt = agora +
   atraso` (o atraso aleatório que esconde quem responde rápido demais).
   `MessageDelivery.post` faz `em.persist` e agenda a entrega. No fim do
   `RoomTransaction` o MikroORM faz o `flush` (INSERT numa transação).
6. **Ack.** O gateway responde `{ ok: true }` e o campo de texto do Beto limpa.
7. **Entrega.** Quando chega o `visibleAt`, o `Scheduler` chama
   `MessageDelivery.deliver`, que emite `chat:message` para a sala inteira
   (`SocketRealtime.toRoom`).
8. **SNS.** Logo depois, `AiTurnPublisher.publish` monta o evento
   `ai.turn.requested` (persona do Mestre, últimas mensagens com pseudônimos,
   contadores, chave cifrada se houver) e publica no tópico `chat-events`
   (`packages/cloud/src/aws-message-bus.ts`).
9. **SQS.** O SNS entrega na fila `ai-turns`. O `SqsPoller` do worker está em long
   polling e recebe a mensagem.
10. **Worker.** `AiTurnHandler.handle`
    (`apps/worker/src/modules/ai-turn/application/ai-turn.handler.ts`), para cada
    IA da partida: `decideReply` decide se ela responde (citada? pergunta? falou
    agora há pouco?). Se sim, `BudgetService.check` consulta o disjuntor no
    Postgres.
11. **LLM.** `buildPrompt` monta o prompt (regras fixas + persona + conversa) e o
    `LlmProvider` configurado (Gemini, Ollama ou Fake) gera a resposta. O worker
    registra chamadas e tokens e limpa o texto (`cleanReply`).
12. **Fila de volta.** O worker publica `ai.reply` no tópico `ai-replies`, que cai
    na fila `ai-replies-api`.
13. **API de novo.** `QueueConsumers` (api) entrega para
    `ChatService.handleAiReply`: confere a fase, modera o texto, corta no limite e,
    se o Mestre pediu para revisar, manda um rascunho para ele. Se não, emite
    `chat:typing` com a duração proporcional ao texto, grava a mensagem com
    `visibleAt` no fim do "digitando..." e agenda a entrega.
14. **WebSocket.** No `visibleAt`, todos recebem `chat:message` do pseudônimo da IA.
    Essa mensagem também vira um `ai.turn.requested`; o worker ignora a própria
    mensagem, mas outra IA (com 2 IAs) pode responder.

## 2. Cada módulo, comparando com Spring

| Conceito aqui | Arquivo | Em Spring seria |
| --- | --- | --- |
| `@Module` | `apps/api/src/app.module.ts` | uma `@Configuration` que agrupa beans |
| `@Injectable()` + construtor | todos os services | `@Service` com injeção por construtor |
| `@Controller` + `@Post` | `rooms.controller.ts` | `@RestController` + `@PostMapping` |
| DTO + `ValidationPipe` | `rooms.dto.ts`, `configure-app.ts` | `@Valid` + Bean Validation |
| `GameErrorFilter` | `infrastructure/http/game-error.filter.ts` | `@ControllerAdvice` + `@ExceptionHandler` |
| `PlayerAuthGuard` | `modules/auth/player-auth.guard.ts` | um filtro do Spring Security |
| `@WebSocketGateway` | `game.gateway.ts` | `@Controller` com `@MessageMapping` (STOMP) |
| `RoomTransaction.run` | `infrastructure/database/room-transaction.ts` | `@Transactional` (e um lock por chave) |
| `EntityManager` do MikroORM | services | `EntityManager` do JPA (unidade de trabalho) |
| `EntitySchema` | `*.schema.ts` | mapeamento no `orm.xml` em vez de anotações |
| Migrações MikroORM | `src/migrations` | Flyway ou Liquibase |
| `APP_CONFIG` | `config/app-config.ts` | `@ConfigurationProperties` |
| `EventEmitter2` + `@OnEvent` | `rooms.service.ts`, `game.gateway.ts` | `ApplicationEventPublisher` + `@EventListener` |
| `QueueConsumers` | `infrastructure/queue-consumers.ts` | `@SqsListener` (Spring Cloud AWS) |
| `OnApplicationBootstrap` | `match.service.ts` | `ApplicationRunner` / `@EventListener(ApplicationReadyEvent)` |
| Jest + `Test.createTestingModule` | `apps/api/test/test-app.ts` | JUnit + `@SpringBootTest` com `@MockBean` |

### apps/api — módulo `rooms`

- `domain/room.ts`: a sala (código, anfitrião, configurações). `updateSettings`
  só deixa o anfitrião mudar e passa tudo por `sanitizeRoomSettings`.
- `domain/player.ts`: o jogador e a validação do apelido.
- `application/rooms.service.ts`: criar sala (gera código único sem caracteres
  ambíguos), entrar (limite de 10, apelido repetido), avatar no S3.
- `infrastructure/rooms.controller.ts`: REST. O avatar passa pela API
  (`GET /api/avatars/:key`), então o bucket nunca fica exposto.

### apps/api — módulo `game`

- `domain/match-state-machine.ts`: as fases e a única transição permitida de cada
  uma.
- `domain/game-match.ts`: o agregado. Começar, criar a persona, registrar
  mensagens, intervenções, votos, avançar fase. Recebe `now` e `random` por
  parâmetro para ser testável.
- `domain/seat.ts`: o sorteio (quantas IAs, quem é Mestre, pseudônimos e avatares
  sem repetição).
- `domain/scoring.ts`: a pontuação como função pura.
- `domain/chat-rules.ts`: tamanho, moderação, intervalo, atraso e "digitando...".
- `application/match.service.ts`: começar, criar, votar, avançar fase, disjuntor,
  pergunta-relâmpago, revelação (auditoria no S3 e evento `match.finished`) e
  recuperação de timers.
- `application/chat.service.ts`: mensagens humanas, respostas da IA, intervenções
  e rascunhos do Mestre, denúncias.
- `application/room-presenter.ts`: monta a view de cada jogador. É onde o segredo
  é protegido.
- `application/ranking.service.ts`: soma os pontos no ranking, uma vez só.
- `infrastructure/game.gateway.ts`: entrada WebSocket.
- `infrastructure/socket-realtime.ts`: saída WebSocket e presença online.

### apps/worker

- `modules/ai-turn/domain/reply-decision.ts`: responde ou não.
- `modules/ai-turn/domain/prompt-builder.ts`: prompt com defesa contra injection e
  limpeza da resposta.
- `modules/ai-turn/domain/character-check.ts`: detecta "sou uma IA".
- `modules/ai-turn/infrastructure/llm/*`: os três provedores e a fábrica que
  escolhe pelo `LLM_PROVIDER`.
- `modules/usage/domain/budget.ts`: o disjuntor como função pura.
- `modules/usage/infrastructure/postgres-usage.repository.ts`: contadores
  atômicos e médias para o `/stats`.

### packages

- `shared`: contratos (WebSocket, views, eventos, configurações, moderação).
- `cloud`: barramento SNS/SQS e em memória, Secrets Manager, cifra AES-GCM.

## 3. Vinte perguntas de entrevista (com respostas do código)

**1. Por que o servidor é a autoridade e não o cliente?**
Porque o jogo é de dedução: quem tem o estado completo pode trapacear. O sorteio, os
prazos (`phase_ends_at`), os votos e a pontuação são decididos na API. Cada jogador
recebe só a sua view (`RoomPresenter`), sem o mapa pseudônimo → pessoa e sem `isAi`
até a revelação.

**2. Como funcionam os timers das fases? O que acontece se a API reiniciar?**
O `Scheduler` agenda um `setTimeout` por partida com a chave `phase:<id>`. No
disparo, `advanceIfDue` relê a partida e só avança se a fase ainda for a esperada e
o prazo tiver vencido. Na subida, `MatchService.onApplicationBootstrap` reagenda
todas as partidas abertas a partir do `phase_ends_at` do banco.

**3. Como você evita condição de corrida entre um voto e o timer?**
Toda operação de uma sala passa por `RoomTransaction.run`, que usa um
`KeyedMutex`: operações da mesma sala rodam em fila, salas diferentes em paralelo. E
cada operação usa um `EntityManager` próprio (`em.fork()`).

**4. E com várias instâncias da API?**
O `KeyedMutex`, os timers e a presença ficam em memória, então não funcionam entre
processos. Precisaria do adapter Redis do Socket.IO, um lock distribuído (Redis ou
`SELECT ... FOR UPDATE`) e timers que não disparem duas vezes. Está em
`DECISOES.md`.

**5. Por que SNS na frente do SQS, e não só SQS?**
Para fan-out: `match.finished` vai para duas filas (ranking na API e estatísticas
no worker) com uma publicação só. O publicador não sabe quantos consumidores
existem. O mapa está em `packages/shared/src/bus-events.ts` e no
`infra/localstack/init-aws.sh`.

**6. O SQS entrega "pelo menos uma vez". Como você lida com mensagem duplicada?**
Consumidores idempotentes. O ranking usa `GameMatch.takeRankingDeltas()`, que marca
`rankingApplied` e devolve a lista vazia na segunda vez. As estatísticas do worker
ignoram uma partida já gravada.

**7. O que acontece se o handler da fila der erro?**
O `SqsPoller` só apaga a mensagem depois que o handler termina sem erro. Com erro,
ela volta para a fila depois do visibility timeout e, depois de 3 tentativas, vai
para a DLQ (`RedrivePolicy` criada no script do LocalStack).

**8. Por que o worker não lê o banco da API?**
O evento `ai.turn.requested` é autossuficiente (persona, mensagens recentes,
contadores). Assim cada serviço é dono dos seus dados (schemas `public` e `worker`),
o worker não tem estado da partida e pode ter várias réplicas.

**9. Como funciona o disjuntor de orçamento?**
`evaluateBudget` (função pura) compara o uso do dia com os limites e olha se houve
429. O contador fica em `worker.daily_usage` e é incrementado no banco com `INSERT
... ON CONFLICT DO UPDATE SET calls = daily_usage.calls + excluded.calls`. Aberto, o
worker publica `ai.unavailable` e a API leva a conversa para a votação.

**10. Por que incrementar no banco e não ler, somar e gravar?**
Ler-somar-gravar perde atualizações quando dois workers fazem ao mesmo tempo. O
incremento dentro do `UPDATE` é atômico. Mesmo assim, a checagem e a chamada não são
atômicas, e por isso o limite é "macio" (no teste de carga chegou a 401 com limite
400).

**11. Como a chave própria do Mestre fica segura?**
O campo só aparece em contexto seguro. A API cifra com AES-256-GCM assim que
recebe (`OwnKeyVault` + `ApiKeyCipher`) e guarda só o texto cifrado em memória. Ela
vai cifrada no evento, o worker decifra só na hora da chamada, nada vai para banco
ou log, e tudo é apagado na revelação.

**12. Como você protege a IA contra prompt injection?**
Em camadas (`prompt-builder.ts`): regras fixas primeiro, dizendo que mensagens do
chat são falas e não instruções; a conversa vai como transcrição entre
`<conversa>`; a persona do Mestre fica entre aspas triplas. Como nada disso é
garantido, `breaksCharacter` detecta respostas como "sou uma IA" e o Mestre perde
pontos.

**13. Como funcionam os testes sem gastar cota de IA?**
O `FakeLlmProvider` é determinístico (mesmo prompt, mesma resposta). Os testes do
worker usam ele e um repositório em memória; o teste da chave própria intercepta o
`fetch`. Os testes ponta a ponta da API trocam o barramento por `InMemoryMessageBus`
e simulam o worker.

**14. O que os testes ponta a ponta cobrem?**
`apps/api/test/*.e2e-spec.ts` sobem a API inteira com Postgres real: criar e entrar
em sala, validação, JWT inválido no WebSocket, configurações só do anfitrião,
avatar no S3, partida completa (criação, chat com a IA, intervenção, votação,
revelação, auditoria, ranking via fila), revisão de rascunho, disjuntor,
espectador, reconexão e mínimo de jogadores.

**15. Por que `EntitySchema` em vez de decorators do MikroORM?**
Para o domínio não depender do ORM. `GameMatch` é uma classe TypeScript comum,
testada sem banco. O mapeamento fica em `game.schema.ts`.

**16. Por que os lugares (seats) são JSON e não uma tabela?**
São sempre lidos e gravados junto com a partida e nunca consultados sozinhos. Uma
tabela traria joins sem ganho. O custo é não ter índice nem constraint dentro do
JSON.

**17. Como o jogador volta depois de cair?**
O JWT (`playerId`, `roomId`) fica no `localStorage`. O Socket.IO reconecta sozinho;
na conexão, a API manda de novo o estado e o histórico (`sendSnapshotTo`). O lugar é
o mesmo, porque o seat é do `playerId`. Há um teste ponta a ponta disso.

**18. Como o tempo de resposta não denuncia a IA?**
A IA mostra "digitando..." por um tempo proporcional ao texto (`typingDurationMs`),
e as mensagens humanas ganham de 0,4 a 2,2 s de atraso aleatório
(`humanDelayMs`). As duas coisas usam `visibleAt` e o `Scheduler`.

**19. Como o número secreto de IAs não vaza?**
`decideAiCount` sorteia 0, 1 ou 2 com pesos. Com zero IAs, a criação termina num
momento aleatório (sem Mestre, ninguém "termina"). A view esconde quantos podem
votar (`eligible: null`) e a votação não encerra antes do prazo.

**20. O que você mediria antes de colocar em produção?**
O teste de carga já mede ack e entrega (p50/p95/p99) com 250 sockets numa máquina.
Em produção eu acompanharia: latência do turno da IA (fila → resposta), tamanho e
idade das filas e das DLQs, taxa de 429 do provedor, chamadas e tokens por partida
(`/stats`) e uso de CPU da API, que foi o gargalo no teste (cerca de um núcleo com 50
salas).

## 4. Cinco exercícios para praticar ao vivo

Para cada um: rode `npm test` antes e depois, e escreva o teste primeiro.

**1. Nova regra de pontuação: acertar que não tinha IA vale mais.**
Hoje, votar "não tem IA" quando não tinha vale +100, como qualquer acerto. Faça
valer +120 (é mais difícil ter certeza). Mexa em `SCORE` e `computeScores` em
`scoring.ts` e ajuste `scoring.spec.ts`. Dica: `aiSeatIds.length === 0`.

**2. Nova configuração de sala: "conversa relâmpago".**
Adicione `shortMessagesOnly` em `RoomSettings` (`packages/shared`), com descrição
em `TOGGLE_DESCRIPTIONS`. Quando ligada, `maxMessageChars` devolve 60. O front-end
mostra o switch sozinho, porque `SettingsPanel` lê `TOGGLE_DESCRIPTIONS`.

**3. Novo endpoint: histórico de partidas da sala.**
`GET /api/rooms/:code/matches` devolvendo número, data e quantas IAs. Caminho: método
no `RoomsService` (ou num service novo no módulo game), rota no controller, teste em
`rooms.e2e-spec.ts` com Supertest.

**4. A IA responde mais quando alguém a acusa.**
Em `reply-decision.ts`, se a mensagem contiver "é a ia" junto com o pseudônimo
dela, a chance sobe para 0,95. Teste em `ai-domain.spec.ts` com `random` fixo.

**5. Limite de denúncias por jogador.**
Cada jogador pode denunciar no máximo 5 mensagens por partida. Conte em
`ChatService.report` com `em.count(Report, { matchId, reporterPlayerId })` e lance
`GameError('NOT_ALLOWED', ...)`. Teste ponta a ponta com `chat:report`.

## 5. Como rodar só uma parte enquanto estuda

```bash
docker compose up -d postgres localstack   # dependências
npm run build:packages                     # compila shared e cloud uma vez
npm run dev:api                            # API com recarga automática
npm run dev:worker                         # worker
npm run dev:web                            # front-end em http://localhost:5173
```

Para rodar a API fora do Docker, exporte `DATABASE_URL`, `JWT_SECRET`,
`BYOK_ENCRYPTION_KEY` e, para usar o LocalStack, `AWS_ENDPOINT_URL=http://localhost:4566`,
`AWS_ACCESS_KEY_ID=test`, `AWS_SECRET_ACCESS_KEY=test` e `SECRETS_ID=quem-e-a-ia/app`.
