/**
 * Configurações de uma sala. O anfitrião altera na sala de espera e elas
 * valem para as próximas partidas. Cada mecânica da seção 3 do design é
 * um booleano que liga ou desliga a regra.
 */
export interface RoomSettings {
  creationSeconds: number;
  conversationSeconds: number;
  votingSeconds: number;

  /** "digitando..." para a IA e atraso aleatório nas mensagens humanas. */
  typingAndDelay: boolean;
  /** Limite de caracteres e intervalo mínimo entre mensagens. */
  messageLimits: boolean;
  /** A IA escolhe quando responder em vez de reagir a toda mensagem. */
  selectiveReplies: boolean;
  /** Sorteia 0, 1 ou 2 IAs; ninguém sabe quantas existem. */
  secretAiCount: boolean;
  /** Permite travar o voto durante a conversa; travar cedo vale mais. */
  voteLock: boolean;
  /** O Mestre perde pontos se a IA sair do personagem. */
  injectionPenalty: boolean;
  /** O Mestre tem intervenções para escrever ou editar no lugar da IA. */
  masterInterventions: boolean;
  /** Tema da rodada e perguntas-relâmpago. */
  topicAndFlash: boolean;
  /** O Mestre cola mensagens reais dele para a IA imitar o estilo. */
  mirrorMode: boolean;
}

export type RoomToggle = {
  [K in keyof RoomSettings]: RoomSettings[K] extends boolean ? K : never;
}[keyof RoomSettings];

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  creationSeconds: 120,
  conversationSeconds: 300,
  votingSeconds: 60,
  typingAndDelay: true,
  messageLimits: true,
  selectiveReplies: true,
  secretAiCount: false,
  voteLock: false,
  injectionPenalty: true,
  masterInterventions: true,
  topicAndFlash: true,
  mirrorMode: false,
};

export const DURATION_LIMITS = {
  creationSeconds: { min: 10, max: 300 },
  conversationSeconds: { min: 20, max: 900 },
  votingSeconds: { min: 10, max: 180 },
} as const;

export const GAME_RULES = {
  minPlayers: 3,
  maxPlayers: 10,
  /** Com limites ligados. */
  maxMessageChars: 160,
  minMessageIntervalMs: 2500,
  /** Teto absoluto, mesmo com limites desligados. */
  hardMaxMessageChars: 500,
  masterInterventions: 3,
  flashAnswerSeconds: 30,
  maxPersonaChars: 2000,
  maxMirrorSamples: 5,
  maxMirrorSampleChars: 200,
  maxNicknameChars: 20,
} as const;

/** Descrição curta de cada mecânica, usada na tela de configurações. */
export const TOGGLE_DESCRIPTIONS: Record<RoomToggle, { title: string; description: string }> = {
  typingAndDelay: {
    title: '“Digitando…” e atraso realista',
    description:
      'A IA demora de acordo com o tamanho da mensagem e humanos ganham um pequeno atraso.',
  },
  messageLimits: {
    title: 'Limite de mensagens',
    description: `No máximo ${GAME_RULES.maxMessageChars} caracteres e um intervalo mínimo entre mensagens.`,
  },
  selectiveReplies: {
    title: 'IA não responde tudo',
    description: 'A IA responde mais quando é mencionada ou perguntada, e às vezes fica quieta.',
  },
  secretAiCount: {
    title: 'Número secreto de IAs',
    description: 'Pode ter 0, 1 ou 2 IAs. “Não tem IA” vira uma resposta possível.',
  },
  voteLock: {
    title: 'Voto travado',
    description: 'Dá para travar o voto durante a conversa. Quanto mais cedo, mais pontos.',
  },
  injectionPenalty: {
    title: 'Ataques de prompt valem',
    description: 'Se alguém fizer a IA sair do personagem, o Mestre perde pontos.',
  },
  masterInterventions: {
    title: 'Intervenções do Mestre',
    description: `O Mestre pode escrever ou editar ${GAME_RULES.masterInterventions} mensagens no lugar da IA.`,
  },
  topicAndFlash: {
    title: 'Tema e pergunta-relâmpago',
    description: `Um tema de conversa e uma pergunta que todos respondem em ${GAME_RULES.flashAnswerSeconds} segundos.`,
  },
  mirrorMode: {
    title: 'Modo espelho',
    description: 'O Mestre cola mensagens reais dele e a IA imita o estilo de escrita.',
  },
};

/**
 * Aceita qualquer objeto vindo do cliente e devolve configurações válidas:
 * ignora chaves desconhecidas, converte booleanos e limita as durações.
 */
export function sanitizeRoomSettings(
  input: unknown,
  base: RoomSettings = DEFAULT_ROOM_SETTINGS,
): RoomSettings {
  const result: RoomSettings = { ...base };
  if (typeof input !== 'object' || input === null) return result;
  const raw = input as Record<string, unknown>;

  for (const key of Object.keys(DURATION_LIMITS) as Array<keyof typeof DURATION_LIMITS>) {
    const value = Number(raw[key]);
    if (raw[key] !== undefined && Number.isFinite(value)) {
      const { min, max } = DURATION_LIMITS[key];
      result[key] = Math.min(max, Math.max(min, Math.round(value)));
    }
  }

  for (const key of Object.keys(TOGGLE_DESCRIPTIONS) as RoomToggle[]) {
    if (typeof raw[key] === 'boolean') result[key] = raw[key];
  }

  return result;
}
