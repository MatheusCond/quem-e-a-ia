import { EntitySchema } from '@mikro-orm/core';

/** Um arquivo guardado no Postgres (só no modo processo único). */
export interface StoredObjectRecord {
  key: string;
  contentType: string;
  body: Buffer;
  createdAt: Date;
}

export const StoredObjectSchema = new EntitySchema<StoredObjectRecord>({
  name: 'StoredObject',
  tableName: 'stored_objects',
  properties: {
    key: { type: 'string', length: 200, primary: true },
    contentType: { type: 'string', length: 100 },
    body: { type: 'blob' },
    createdAt: { type: 'datetime' },
  },
});
