import { EntityManager } from '@mikro-orm/postgresql';
import { PostgresObjectStorage } from '../src/infrastructure/storage/postgres-object-storage';
import { createTestApp, TestContext } from './test-app';

async function readAll(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}

describe('PostgresObjectStorage (e2e)', () => {
  let ctx: TestContext;
  let storage: PostgresObjectStorage;

  beforeAll(async () => {
    ctx = await createTestApp();
    storage = new PostgresObjectStorage(ctx.app.get(EntityManager));
  });

  afterAll(() => ctx.close());

  it('stores binary files and overwrites by key', async () => {
    const photo = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
    await storage.put('avatars/a.png', photo, 'image/png');

    const stored = await storage.get('avatars/a.png');
    expect(stored?.contentType).toBe('image/png');
    expect(await readAll(stored!.body)).toEqual(photo);

    await storage.put('avatars/a.png', 'replaced', 'text/plain');
    const replaced = await storage.get('avatars/a.png');
    expect(replaced?.contentType).toBe('text/plain');
    expect((await readAll(replaced!.body)).toString()).toBe('replaced');
  });

  it('returns null for a missing key', async () => {
    expect(await storage.get('avatars/none.png')).toBeNull();
  });
});
