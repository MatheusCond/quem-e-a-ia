import { Injectable } from '@nestjs/common';
import { ApiKeyCipher } from '@quem/cloud';

/**
 * Guarda, só em memória e só enquanto a partida dura, a chave própria do
 * Mestre ("Usar minha própria chave").
 *
 * A chave é cifrada assim que chega: nem a API guarda o texto puro. Ela
 * nunca vai para o banco, para log ou de volta ao navegador. O worker
 * decifra na hora de chamar o LLM. Na revelação, a entrada é apagada.
 */
@Injectable()
export class OwnKeyVault {
  private readonly keys = new Map<string, Map<string, string>>();

  constructor(private readonly cipher: ApiKeyCipher) {}

  store(matchId: string, seatId: string, plainKey: string): void {
    const byMatch = this.keys.get(matchId) ?? new Map<string, string>();
    byMatch.set(seatId, this.cipher.encrypt(plainKey));
    this.keys.set(matchId, byMatch);
  }

  /** Devolve a chave já cifrada, pronta para ir no evento da fila. */
  encryptedFor(matchId: string, seatId: string): string | null {
    return this.keys.get(matchId)?.get(seatId) ?? null;
  }

  forget(matchId: string): void {
    this.keys.delete(matchId);
  }
}
