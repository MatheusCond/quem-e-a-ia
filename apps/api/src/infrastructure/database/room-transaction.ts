import { EntityManager, MikroORM } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import { KeyedMutex } from '../../shared/keyed-mutex';

/**
 * Executa uma operação sobre uma sala com duas garantias:
 *
 * 1. Exclusividade: operações da mesma sala rodam uma de cada vez
 *    (KeyedMutex), então um voto e o timer nunca se atropelam.
 * 2. Unidade de trabalho própria: cada operação recebe um EntityManager
 *    novo (fork) e, no fim, tudo que mudou é gravado numa transação (flush).
 *
 * É o papel que o @Transactional faz num serviço Spring.
 */
@Injectable()
export class RoomTransaction {
  private readonly mutex = new KeyedMutex();

  constructor(private readonly orm: MikroORM) {}

  run<T>(roomId: string, work: (em: EntityManager) => Promise<T>): Promise<T> {
    return this.mutex.run(roomId, async () => {
      const em = this.orm.em.fork();
      const result = await work(em);
      await em.flush();
      return result;
    });
  }

  /** Leitura avulsa, sem lock: para consultas que não alteram nada. */
  read<T>(work: (em: EntityManager) => Promise<T>): Promise<T> {
    return work(this.orm.em.fork());
  }
}
