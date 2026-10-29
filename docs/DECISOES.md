# Decisões

Cada decisão com o motivo e o que ela custa. No fim, os problemas reais que
apareceram durante a construção.

## Por que o chat não roda num grupo real de WhatsApp

- **Anonimato:** num grupo de WhatsApp todos veem o número e o nome de todos. O jogo
  depende de ninguém saber qual pseudônimo é de quem; num grupo real a IA seria o
  único número desconhecido.
- **Bots em grupo:** a API oficial do WhatsApp Business é pensada para conversa
  empresa ↔ cliente e tem fortes limitações para bots participando de grupos.
- **Bibliotecas não oficiais** (que automatizam o WhatsApp Web) violam os termos de
  uso e podem banir o número.

Por isso o WhatsApp entra como **canal de convite** (botão "Compartilhar no
WhatsApp" com um link `wa.me`) e o chat acontece dentro do jogo, com visual
inspirado em apps de mensagem, sem copiar marca, logo ou cores oficiais.

## Por que SNS + SQS para os turnos da IA

A chamada ao LLM leva segundos e pode falhar ou estourar cota. Se ficasse dentro da
API, o mesmo processo que segura os WebSockets ficaria esperando o modelo.

- **Desacoplamento:** a API publica "chegou mensagem" e segue. O worker processa no
  ritmo dele. Dá para escalar workers sem mexer na API.
- **Resiliência:** se o worker cair, as mensagens esperam na fila. Se uma mensagem
  falhar três vezes, vai para a DLQ em vez de travar a fila.
- **Fan-out:** o fim da partida é um evento só (`match.finished`) que o SNS entrega
  em duas filas: ranking (API) e estatísticas (worker). Um terceiro interessado
  seria só mais uma assinatura.
- **Evento autossuficiente:** o evento leva persona, últimas mensagens e contadores.
  O worker não lê o banco da API e não guarda estado da partida.

Custo: mais peças (tópicos, filas, DLQs) e entrega "pelo menos uma vez". Por isso os
consumidores são idempotentes: o ranking só soma uma vez (`ranking_applied`) e as
estatísticas ignoram uma partida já gravada.

## Por que o servidor é a autoridade

Num jogo de dedução, quem controla o estado pode trapacear. O cliente nunca recebe o
estado completo:

- o sorteio do Mestre, dos pseudônimos e dos avatares acontece no servidor;
- cada jogador recebe uma view própria (`RoomPresenter`): só o Mestre sabe que é
  Mestre, ninguém recebe o mapa pseudônimo → pessoa antes da revelação, e
  `isAi` só aparece no histórico revelado;
- prazos, votos e pontos são decididos no servidor. O relógio do celular serve só
  para desenhar a contagem regressiva (corrigida pela diferença com o horário do
  servidor);
- com o número de IAs secreto, a view esconde quantos jogadores podem votar e a
  votação não encerra antes do prazo, porque os dois entregariam quantos Mestres
  existem. Pelo mesmo motivo, na fase de criação o cronômetro só aparece para o
  Mestre (`GameMatch.deadlineVisibleTo`).

## Como os timers funcionam (e o limite deles)

- O fim de cada fase fica gravado em `matches.phase_ends_at`.
- O `Scheduler` da API agenda um `setTimeout` com uma chave por partida. Quando
  dispara, `advanceIfDue` confere no banco se a fase ainda é a esperada (timers
  velhos são ignorados) e se o prazo venceu.
- Se a API reiniciar, `MatchService.onApplicationBootstrap` reagenda o fim de fase
  de todas as partidas abertas a partir do banco.
- Toda operação de uma sala passa pelo `RoomTransaction`, que serializa as
  operações por sala (`KeyedMutex`) e dá a cada uma um `EntityManager` próprio.
  Assim um voto e o timer nunca leem e gravam a partida ao mesmo tempo.

**Limitação com várias instâncias:** o lock por sala, os timers, a presença online
e as salas do Socket.IO ficam na memória de um processo. Com duas APIs atrás de um
balanceador seria preciso:

1. o adapter Redis do Socket.IO, para um `emit` chegar a quem está conectado na
   outra instância;
2. um lock distribuído por sala (Redis ou `SELECT ... FOR UPDATE` no Postgres);
3. timers que sobrevivem e não disparam duas vezes (fila com atraso, por exemplo
   SQS com delay, ou um único "dono" por sala).

Também ficam só na memória a pergunta-relâmpago agendada, as mensagens esperando o
atraso e os rascunhos do Mestre. Se a API reiniciar no meio da conversa, essas
coisas pequenas se perdem; a partida continua.

## Como o custo de IA é controlado

Objetivo: custo zero por padrão.

1. **Chave gratuita sem faturamento.** Sem faturamento ativado não há como gerar
   cobrança; ao estourar a cota a API responde erro.
2. **Decidir antes de chamar.** A decisão de responder (`decideReply`) é local e não
   custa nada; a maioria das mensagens nem chega ao LLM. Ela barra a própria
   mensagem da IA, respeita um intervalo mínimo entre falas e o máximo de respostas
   por partida.
3. **Prompt pequeno.** Só as últimas `AI_CONTEXT_MESSAGES` mensagens vão no prompt e
   a resposta tem no máximo `AI_MAX_OUTPUT_TOKENS`. No Gemini, o "pensamento" do
   modelo fica desligado (`thinkingBudget: 0`).
4. **Disjuntor diário.** Contador de chamadas e tokens por dia (UTC) no Postgres,
   com incremento atômico (`INSERT ... ON CONFLICT DO UPDATE SET calls = calls +
   1`). Passou do limite ou recebeu HTTP 429: o worker publica `ai.unavailable`, a
   API mostra "A IA está descansando" e leva a conversa para a votação. A partida
   termina normalmente.
5. **Limites na API:** partidas por sala por dia e requisições REST por IP.

Limitações conhecidas do disjuntor: a checagem e a chamada não são atômicas, então
com várias respostas ao mesmo tempo o limite pode ser ultrapassado por poucas
chamadas (aconteceu: 401 com limite 400). E o dia do contador é UTC, enquanto a
cota diária do Gemini zera à meia-noite do horário do Pacífico.

### "Usar minha própria chave"

O Mestre pode colar a chave dele para jogar sem o limite diário do servidor. Os
cuidados:

- o campo só aparece em contexto seguro (`window.isSecureContext`: HTTPS ou
  localhost), então a chave não trafega em HTTP aberto pela rede;
- a API cifra a chave assim que ela chega (AES-256-GCM, segredo
  `BYOK_ENCRYPTION_KEY` do Secrets Manager) e guarda só o texto cifrado, em memória,
  durante a partida (`OwnKeyVault`);
- ela vai cifrada dentro do evento da fila; o worker decifra só na hora da chamada,
  e a chave fica apenas numa variável local;
- nunca vai para o banco, para log ou de volta ao navegador (a view só diz
  `usingOwnKey: true`);
- na revelação, a entrada é apagada;
- chamadas com a chave do Mestre não contam no orçamento do servidor, e um 429 com
  ela não desliga a IA das outras salas.

O pedido original era "a chave fica só na memória do worker". Preferi cifrar e
mandar no evento porque, com mais de um worker, não dá para saber qual instância vai
pegar a próxima mensagem. A chave em texto puro continua existindo só durante a
chamada ao LLM.

## Outras decisões

- **MikroORM com `EntitySchema` em vez de decorators.** As classes do domínio
  (`GameMatch`, `Room`) ficam livres do ORM e são testadas sem banco. O mapeamento
  fica em `infrastructure/*.schema.ts`.
- **Banco por serviço (lite).** Mesmo Postgres, schemas separados: `public` (API) e
  `worker`. Cada serviço tem suas migrações e nunca lê as tabelas do outro.
- **Pontuação como função pura.** `computeScores` recebe lugares e configurações e
  devolve as linhas; o ranking só soma o que ela devolveu.
- **Sem cadastro.** Entrar na sala gera um JWT com `playerId` e `roomId`. O token
  fica no `localStorage` e permite voltar depois de cair.
- **Moderação por lista de bloqueio** em apelidos, mensagens, personas e respostas
  da IA, mais botão de denúncia (tabela `reports`). Não entende contexto; o
  endpoint de moderação do provedor fica para depois.
- **Versões estáveis conhecidas** (NestJS 11, MikroORM 6, TypeScript 5.9, Vite 7)
  em vez das majors mais novas, que mudaram para ESM e trocaram de compilador.
- **Modo processo único para hospedagem gratuita.** Os planos gratuitos dão um
  container, sem SNS/SQS nem S3. Em vez de um segundo projeto, a API e o worker
  ganharam um `bootstrap.ts` exportável e os adaptadores viraram configuráveis
  (`MESSAGE_BUS=memory`, `OBJECT_STORAGE=postgres`). O `deploy/standalone/start.mjs`
  sobe os dois no mesmo Node, e a API serve o front-end. O custo é perder
  reentrega e DLQ; o docker compose continua sendo a arquitetura de referência.
  Detalhes em [HOSPEDAGEM.md](HOSPEDAGEM.md).
- **Socket.IO com ack** em toda ação: o front-end mostra o erro exato para quem
  tentou ("Calma! Espere um pouquinho...") sem um evento de erro genérico.

## Problemas encontrados

Problemas que aconteceram de verdade durante a construção, em ordem.

1. **O repositório antigo não fazia checkout no Windows.** O projeto começou no
   repositório do app do TCC, que tinha um arquivo perdido `et --soft <commit-hash>`
   com `<` e `>`, que o NTFS não aceita: o `git clone` terminava sem arquivos.
   Resolvi com sparse checkout excluindo esse caminho e depois removendo o arquivo
   num commit.
2. **Chaves do Firebase no histórico antigo.** O app do TCC tinha as chaves de API
   do Firebase versionadas desde o primeiro commit. Este repositório foi criado só
   com os commits do jogo novo, sem o app antigo, então nenhuma dessas chaves está
   aqui; procurei o padrão de chave do Google em todos os commits. As chaves ainda
   existem no repositório antigo, e a ação necessária continua: desativar o projeto
   Firebase ou restringir as chaves no Google Cloud Console.
3. **LocalStack passou a exigir conta.** A imagem `localstack/localstack:latest`
   (versão 2026.10) encerra com "License activation failed" sem
   `LOCALSTACK_AUTH_TOKEN`. Testei versões anteriores e fixei a `4.14`, que sobe sem
   token.
4. **MikroORM no Nest com configuração assíncrona.** Com `forRootAsync`, o Nest não
   conseguia injetar o `MikroORM` nos serviços até eu informar `driver:
   PostgreSqlDriver` explicitamente. No worker, a fábrica da configuração do ORM não
   enxergava `WORKER_CONFIG` até ele virar um módulo global.
5. **Jest não terminava depois dos testes ponta a ponta.** Ao fechar a aplicação,
   os sockets caíam e o handler de desconexão tentava consultar o banco que já
   estava fechado ("Knex: Timeout acquiring a connection"). O gateway passou a
   ignorar desconexões durante o desligamento (`beforeApplicationShutdown`).
6. **ts-jest não achava os tipos de `@quem/shared`** porque o pacote ainda não
   estava compilado. Os testes usam um `tsconfig.spec.json` com `paths` apontando
   para o código-fonte, e assim rodam sem build.
7. **Healthcheck da API falhando no Docker.** Dentro do Alpine, `localhost`
   resolve primeiro para `::1` (IPv6) e a API escuta em `0.0.0.0` (IPv4). O
   healthcheck passou a usar `127.0.0.1`.
8. **Avatares repetidos na mesma partida.** Jogando no navegador, dois pseudônimos
   apareceram com o mesmo emoji, o que confunde. O sorteio passou a embaralhar
   emojis e cores e distribuir por índice, sem repetição.
9. **O teste de carga abriu o disjuntor.** Na primeira rodada com 50 salas, o
   worker chegou a 401 chamadas no dia (limite 400), publicou `ai.unavailable` e as
   50 conversas foram para a votação com o aviso "A IA está descansando". Nenhuma
   partida quebrou, o que valida o disjuntor, mas também mostrou que o limite pode
   ser ultrapassado por pouco quando várias respostas checam o contador ao mesmo
   tempo. Para medir só o servidor, a segunda rodada usou um limite diário maior.
10. **Aviso de WebSocket no modo de desenvolvimento.** O `StrictMode` do React monta
    o efeito duas vezes e fecha a primeira conexão antes de ela abrir ("WebSocket is
    closed before the connection is established"). É só no `npm run dev`; o build
    de produção não tem o aviso.

Os próximos apareceram na revisão do front-end com as Web Interface Guidelines
(skill `web-design-guidelines`):

11. **O cronômetro da criação entregava "zero IAs".** Sem Mestre, a criação termina
    num momento aleatório, mas o prazo ia para todos os navegadores: com 2 minutos
    configurados e o relógio mostrando 0:52, dava para deduzir que não havia IA. A
    view passou a mandar o prazo da criação só para o Mestre quando o número de IAs
    é secreto. Há teste no domínio.
12. **A tela inteira "subia" ao abrir o replay da revelação.** Duas causas juntas:
    as áreas roláveis eram `flex-1 overflow-y-auto` sem `min-h-0`, então cresciam
    até o tamanho do conteúdo; e os textos para leitor de tela (`sr-only`, com
    `position: absolute`) ficavam posicionados em relação à página, esticando o
    documento. O contêiner do app e as áreas roláveis viraram `relative`, com
    `min-h-0`.
13. **Dois contornos de foco nos campos.** O estilo global de `:focus-visible` estava
    fora das layers do Tailwind e ganhava do `outline-none` dos campos, que têm anel
    próprio. Foi movido para `@layer base`.
14. **A migração nova quebrou o reset dos testes ponta a ponta.** A tabela
    `stored_objects` foi criada só por migração, sem mapeamento no MikroORM. O
    `dropSchema` dos testes só apaga as tabelas que o ORM conhece, então ela
    sobrevivia e a migração falhava com "relation already exists" no arquivo de
    teste seguinte. A tabela ganhou um `EntitySchema`, e o armazenamento passou a
    usar o próprio ORM (`upsert` e `findOne`) em vez de SQL solto.
15. **Duas abas do mesmo navegador viravam o mesmo jogador.** No primeiro teste no
    Render, com quatro abas, ninguém viu a tela do Mestre. O token ficava só no
    `localStorage`, que todas as abas do navegador compartilham: quem abria o link
    numa aba nova entrava sem perguntar como o criador da sala. O servidor sorteava
    o Mestre certo, mas a aba que deveria mostrar a tela dele era a de outra
    pessoa. Agora a identidade da aba fica no `sessionStorage`, e o `localStorage`
    só serve para oferecer "Voltar para a sala" a quem fechou a aba.
16. **A IA ficava muda no Render.** O modelo padrão era o `gemini-2.5-flash-lite`,
    que o Google passou a liberar só para quem já o usava; com uma chave nova, toda
    chamada voltava com erro. O worker tratava qualquer erro que não fosse 429 como
    falha pontual: registrava um aviso e perdia a resposta, sem nada na tela. O
    padrão virou `gemini-3.5-flash-lite`, que já pensa no nível mínimo e por isso não
    recebe o `thinkingBudget` da família 2.5. Erros 400, 401, 403 e 404 agora
    encerram a conversa com o aviso de IA indisponível, como a falta de cota, mas
    sem ligar o disjuntor do dia.
