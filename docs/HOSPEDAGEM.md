# Hospedagem gratuita

Duas formas de jogar com amigos fora da sua rede: um túnel temporário a partir do
seu PC (na hora, sem conta) ou um endereço fixo no Render (gratuito, precisa de
conta).

## 1. Túnel temporário (na hora)

Com o jogo rodando (`docker compose up`), o Cloudflare cria um endereço `https`
público que aponta para o seu `localhost:8080`. Não precisa de conta.

```bash
winget install Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:8080
```

O comando mostra um endereço `https://<palavras>.trycloudflare.com`. Mande para os
amigos. Ele funciona enquanto o PC estiver ligado e o comando aberto, e muda a cada
vez que você roda o túnel. O WebSocket funciona normalmente pelo túnel.

## 2. Endereço fixo no Render

### O que muda nesse modo

A plataforma gratuita dá um container só, sem SNS/SQS e sem S3. Por isso existe o
**modo processo único** ([deploy/standalone](../deploy/standalone)): a API, o worker
e o front-end sobem no mesmo Node.

| Peça | docker compose | Processo único |
| --- | --- | --- |
| Eventos (turnos da IA, ranking, estatísticas) | SNS + SQS (LocalStack) | `InMemoryMessageBus`, compartilhado pela API e pelo worker |
| Fotos e auditorias | S3 (LocalStack) | Tabela `stored_objects` no Postgres |
| Segredos | Secrets Manager (LocalStack) | Variáveis de ambiente do Render |
| Front-end | nginx | A própria API (`WEB_DIST_DIR`) |

As regras do jogo, o servidor autoritativo e os handlers do worker são os mesmos.
Só trocam os adaptadores, escolhidos por variáveis de ambiente (`MESSAGE_BUS=memory`,
`OBJECT_STORAGE=postgres`), que o `start.mjs` já define.

O que se perde nesse modo, de forma consciente:

- **Sem reentrega nem DLQ.** Se um handler falhar, o evento não volta para a fila.
  Na prática, a IA pula aquela fala.
- **Sem escalar o worker separado.** Tudo divide a mesma CPU. Para um grupo de
  amigos sobra; o teste de carga do README foi feito no modo docker compose.

### Passo a passo

1. Crie uma conta em [render.com](https://render.com) e conecte o GitHub.
2. No painel, clique em **New → Blueprint** e escolha este repositório e a branch.
   O Render lê o [render.yaml](../render.yaml) e cria:
   - o serviço web `quem-e-a-ia` (plano free, Docker);
   - o Postgres `quem-e-a-ia-db` (plano free);
   - `JWT_SECRET` e `BYOK_ENCRYPTION_KEY` gerados aleatoriamente pelo próprio Render.
3. O Render vai pedir o valor de `GEMINI_API_KEY`. Cole a chave **ali no painel**
   (nunca em chat, issue ou commit), ou deixe vazio para usar as respostas prontas
   do `FakeLlmProvider`. Use uma chave de um projeto sem faturamento (veja o
   README).
4. Espere o primeiro deploy (alguns minutos: ele compila tudo). O endereço fica
   `https://quem-e-a-ia.onrender.com` ou parecido; o painel mostra o certo.
5. A cada push na branch escolhida, o Render faz um deploy novo sozinho.

### Limites do plano gratuito

Confira sempre a [página de preços do Render](https://render.com/pricing); os
limites mudam. Os que mais afetam o jogo:

- O serviço gratuito **dorme** depois de um tempo sem acesso. O primeiro acesso
  depois disso demora (o servidor acorda e roda as migrações). Durante uma partida
  ele não dorme, porque os WebSockets mantêm o tráfego.
- O Postgres gratuito tem **prazo de validade**. Antes de vencer, dá para criar
  outro ou apontar `DATABASE_URL` para um Postgres gratuito de outro provedor
  (Neon, Supabase), com `?sslmode=require` no fim do endereço.

## 3. Instalar no celular (PWA)

O front-end tem manifesto e ícones. No Android (Chrome), abra o endereço e use
**⋮ → Adicionar à tela inicial**; no iPhone (Safari), **Compartilhar → Adicionar à
Tela de Início**. O jogo abre em tela cheia, com ícone próprio. Não há service
worker de propósito: o jogo é todo em tempo real e um cache offline só atrapalharia
as atualizações.

Um APK nativo não traria nada além disso: seria o mesmo site dentro de uma casca, e
ainda dependeria do servidor no ar.

## Testar o modo processo único na sua máquina

```bash
docker build -f deploy/standalone/Dockerfile -t quem-e-a-ia-standalone .
docker run --rm -p 8090:3000 \
  -e DATABASE_URL=postgresql://quem:quem@host.docker.internal:5432/quem_e_a_ia \
  -e JWT_SECRET=troque-isto -e BYOK_ENCRYPTION_KEY=troque-isto \
  quem-e-a-ia-standalone
```

Abra http://localhost:8090. Para uma partida automática:
`API_URL=http://localhost:8090 ROOMS=1 npm run load-test`.
