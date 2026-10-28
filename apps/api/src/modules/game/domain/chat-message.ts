import { randomUUID } from 'node:crypto';
import { MessageKind } from '@quem/shared';

/**
 * Uma mensagem do chat da partida.
 *
 * `visibleAt` existe por causa do atraso realista: a mensagem é gravada na
 * hora, mas só aparece para os outros quando o "digitando..." termina.
 * `isAi` fica no banco e só é mostrado na revelação.
 */
export class ChatMessage {
  id: string;
  matchId: string;
  seatId: string | null;
  kind: MessageKind;
  text: string;
  isAi: boolean;
  isIntervention: boolean;
  brokeCharacter: boolean;
  createdAt: Date;
  visibleAt: Date;

  static create(params: {
    matchId: string;
    seatId: string | null;
    kind: MessageKind;
    text: string;
    now: Date;
    delayMs?: number;
    isAi?: boolean;
    isIntervention?: boolean;
    brokeCharacter?: boolean;
  }): ChatMessage {
    const message = new ChatMessage();
    message.id = randomUUID();
    message.matchId = params.matchId;
    message.seatId = params.seatId;
    message.kind = params.kind;
    message.text = params.text;
    message.isAi = params.isAi ?? false;
    message.isIntervention = params.isIntervention ?? false;
    message.brokeCharacter = params.brokeCharacter ?? false;
    message.createdAt = params.now;
    message.visibleAt = new Date(params.now.getTime() + (params.delayMs ?? 0));
    return message;
  }

  static system(matchId: string, text: string, now: Date, kind: MessageKind = 'system') {
    return ChatMessage.create({ matchId, seatId: null, kind, text, now });
  }
}
