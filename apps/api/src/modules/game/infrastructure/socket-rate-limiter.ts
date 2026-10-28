/**
 * Limite simples por conexão: no máximo `limit` eventos a cada `windowMs`.
 * Protege o servidor de um cliente modificado que dispare eventos em loop,
 * mesmo com o limite de mensagens do jogo desligado.
 */
export class SocketRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit = 20,
    private readonly windowMs = 5000,
  ) {}

  allow(socketId: string, now = Date.now()): boolean {
    const recent = (this.hits.get(socketId) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(socketId, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(socketId, recent);
    return true;
  }

  forget(socketId: string): void {
    this.hits.delete(socketId);
  }
}
