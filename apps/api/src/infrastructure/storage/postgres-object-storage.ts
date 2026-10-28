import { Readable } from 'node:stream';
import { EntityManager } from '@mikro-orm/postgresql';
import { ObjectStorage, StoredObject } from './object-storage';
import { StoredObjectSchema } from './stored-object.schema';

/**
 * Guarda os arquivos (fotos e auditorias) numa tabela do próprio banco.
 * Existe para a hospedagem gratuita, onde não há S3 e o disco do container
 * é apagado a cada deploy. Os arquivos são pequenos (foto de até 2 MB), então
 * bytea dá conta.
 */
export class PostgresObjectStorage extends ObjectStorage {
  constructor(private readonly em: EntityManager) {
    super();
  }

  async put(key: string, body: Buffer | string, contentType: string): Promise<void> {
    await this.em.fork().upsert(StoredObjectSchema, {
      key,
      contentType,
      body: Buffer.from(body),
      createdAt: new Date(),
    });
  }

  async get(key: string): Promise<StoredObject | null> {
    const stored = await this.em.fork().findOne(StoredObjectSchema, { key });
    return stored ? { body: Readable.from(stored.body), contentType: stored.contentType } : null;
  }
}
