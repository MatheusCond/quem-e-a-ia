import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

/**
 * Timers do servidor: fim de fase, pergunta-relâmpago e entrega de
 * mensagens atrasadas. Cada timer tem uma chave; agendar de novo com a
 * mesma chave substitui o anterior.
 *
 * Os timers vivem na memória do processo. Se a API reiniciar, os prazos das
 * fases são recuperados do banco (MatchService.onApplicationBootstrap).
 */
@Injectable()
export class Scheduler implements OnModuleDestroy {
  private readonly logger = new Logger(Scheduler.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private sequence = 0;

  at(key: string, when: Date, task: () => Promise<unknown> | unknown): void {
    this.cancel(key);
    const delay = Math.max(0, when.getTime() - Date.now());
    const timer = setTimeout(() => {
      this.timers.delete(key);
      Promise.resolve()
        .then(task)
        .catch((error: Error) =>
          this.logger.error(`Timer ${key} falhou: ${error.message}`, error.stack),
        );
    }, delay);
    this.timers.set(key, timer);
  }

  after(ms: number, task: () => Promise<unknown> | unknown, prefix = 'task'): void {
    this.at(`${prefix}:${++this.sequence}`, new Date(Date.now() + ms), task);
  }

  cancel(key: string): void {
    const timer = this.timers.get(key);
    if (timer) clearTimeout(timer);
    this.timers.delete(key);
  }

  cancelPrefix(prefix: string): void {
    for (const key of [...this.timers.keys()]) {
      if (key.startsWith(prefix)) this.cancel(key);
    }
  }

  onModuleDestroy(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
