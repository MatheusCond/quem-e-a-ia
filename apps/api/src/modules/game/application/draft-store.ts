import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';

export interface Draft {
  id: string;
  matchId: string;
  roomId: string;
  seatId: string;
  masterPlayerId: string;
  text: string;
  brokeCharacter: boolean;
  expiresAt: Date;
}

export const DRAFT_TTL_MS = 25_000;

/**
 * Respostas da IA esperando o Mestre revisar ("editar a próxima resposta").
 * Ficam em memória por poucos segundos; se o Mestre não responder, a
 * original é enviada.
 */
@Injectable()
export class DraftStore {
  private readonly drafts = new Map<string, Draft>();

  create(params: Omit<Draft, 'id' | 'expiresAt'>, now = new Date()): Draft {
    const draft: Draft = {
      ...params,
      id: randomUUID(),
      expiresAt: new Date(now.getTime() + DRAFT_TTL_MS),
    };
    this.drafts.set(draft.id, draft);
    return draft;
  }

  hasPendingFor(seatId: string): boolean {
    return [...this.drafts.values()].some((d) => d.seatId === seatId);
  }

  /** Remove e devolve o rascunho (cada rascunho só pode ser usado uma vez). */
  take(id: string): Draft | null {
    const draft = this.drafts.get(id) ?? null;
    this.drafts.delete(id);
    return draft;
  }

  forgetMatch(matchId: string): void {
    for (const [id, draft] of this.drafts) {
      if (draft.matchId === matchId) this.drafts.delete(id);
    }
  }
}
