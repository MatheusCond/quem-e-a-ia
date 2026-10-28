/**
 * Eventos que trafegam entre os serviços por SNS + SQS.
 *
 * Tópicos (SNS) são para quem publica; filas (SQS) são para quem consome.
 * Um tópico pode entregar a mesma mensagem para várias filas (fan-out):
 * "match-events" alimenta o ranking (API) e as estatísticas (worker).
 */

export const TOPICS = {
  chatEvents: 'chat-events',
  aiReplies: 'ai-replies',
  matchEvents: 'match-events',
} as const;

export const QUEUES = {
  aiTurns: 'ai-turns',
  aiRepliesApi: 'ai-replies-api',
  matchRanking: 'match-ranking',
  matchStats: 'match-stats',
} as const;

export type TopicName = (typeof TOPICS)[keyof typeof TOPICS];
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/**
 * Quais filas assinam cada tópico. O script do LocalStack
 * (infra/localstack/init-aws.sh) cria exatamente estas assinaturas, e o
 * barramento em memória usado nos testes segue o mesmo mapa.
 */
export const SUBSCRIPTIONS: Record<TopicName, QueueName[]> = {
  'chat-events': ['ai-turns'],
  'ai-replies': ['ai-replies-api'],
  'match-events': ['match-ranking', 'match-stats'],
};

export interface AiSeatContext {
  seatId: string;
  pseudonym: string;
  persona: string;
  mirrorSamples: string[];
  repliesSoFar: number;
  lastMessageAt: string | null;
  /** Chave própria do Mestre, cifrada com AES-GCM. Nunca vai em texto puro. */
  encryptedApiKey: string | null;
}

export interface ContextMessage {
  seatId: string | null;
  /** null para mensagens do sistema (tema, pergunta-relâmpago). */
  pseudonym: string | null;
  text: string;
}

export type TurnTriggerKind = 'message' | 'theme' | 'flash';

/** API → worker: chegou uma mensagem no chat, a IA quer responder? */
export interface AiTurnRequestedEvent {
  type: 'ai.turn.requested';
  matchId: string;
  trigger: {
    kind: TurnTriggerKind;
    messageId: string;
    seatId: string | null;
    text: string;
  };
  aiSeats: AiSeatContext[];
  pseudonyms: string[];
  recentMessages: ContextMessage[];
  theme: string | null;
  settings: { selectiveReplies: boolean; maxChars: number };
  occurredAt: string;
}

/** Worker → API: a IA decidiu responder. */
export interface AiReplyEvent {
  type: 'ai.reply';
  matchId: string;
  seatId: string;
  replyToMessageId: string;
  text: string;
  /** Heurística do worker: a resposta parece admitir que é uma IA. */
  brokeCharacter: boolean;
  usage: { inputTokens: number; outputTokens: number };
  provider: string;
}

export type AiUnavailableReason = 'daily-budget' | 'provider-quota' | 'provider-error';

/** Worker → API: a IA não pode mais responder (disjuntor de orçamento). */
export interface AiUnavailableEvent {
  type: 'ai.unavailable';
  matchId: string;
  reason: AiUnavailableReason;
}

/** API → ranking (API) e estatísticas (worker): a partida terminou. */
export interface MatchFinishedEvent {
  type: 'match.finished';
  matchId: string;
  roomId: string;
  roomCode: string;
  startedAt: string;
  finishedAt: string;
  aiCount: number;
  playerCount: number;
  scores: Array<{ playerId: string; delta: number }>;
  correctVoters: number;
  totalVoters: number;
  aiMessages: number;
  humanMessages: number;
  auditKey: string | null;
}

export type BusEvent =
  AiTurnRequestedEvent | AiReplyEvent | AiUnavailableEvent | MatchFinishedEvent;
