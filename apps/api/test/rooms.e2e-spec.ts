import { GAME_NAMESPACE } from '@quem/shared';
import { io } from 'socket.io-client';
import request from 'supertest';
import { createRoom, createTestApp, joinRoom, PlayerClient, TestContext } from './test-app';

describe('Rooms (e2e)', () => {
  let ctx: TestContext;
  const clients: PlayerClient[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterEach(() => {
    clients.splice(0).forEach((c) => c.close());
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('creates a room and returns a token for the host', async () => {
    const host = await createRoom(ctx, 'Ana');
    expect(host.roomCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(host.token).toEqual(expect.any(String));
  });

  it('rejects an empty nickname', async () => {
    const res = await request(ctx.url).post('/api/rooms').send({ nickname: '' }).expect(400);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('returns 404 for an unknown room', async () => {
    const res = await request(ctx.url)
      .post('/api/rooms/ZZZZZZ/players')
      .send({ nickname: 'Beto' })
      .expect(404);
    expect(res.body.code).toBe('ROOM_NOT_FOUND');
  });

  it('lets friends join and refuses a repeated nickname', async () => {
    const host = await createRoom(ctx, 'Ana');
    await joinRoom(ctx, host.roomCode.toLowerCase(), 'Beto');

    const repeated = await request(ctx.url)
      .post(`/api/rooms/${host.roomCode}/players`)
      .send({ nickname: 'beto' })
      .expect(400);
    expect(repeated.body.message).toContain('apelido');

    const summary = await request(ctx.url).get(`/api/rooms/${host.roomCode}`).expect(200);
    expect(summary.body.playerCount).toBe(2);
  });

  it('refuses a WebSocket connection without a valid token', async () => {
    const socket = io(`${ctx.url}${GAME_NAMESPACE}`, {
      auth: { token: 'nope' },
      transports: ['websocket'],
      forceNew: true,
    });
    const error = await new Promise<Error>((resolve) => socket.once('connect_error', resolve));
    socket.close();
    expect(error.message).toContain('Sessão inválida');
  });

  it('shows the live player list and lets only the host change settings', async () => {
    const host = await createRoom(ctx, 'Ana');
    const beto = await joinRoom(ctx, host.roomCode, 'Beto');
    const caio = await joinRoom(ctx, host.roomCode, 'Caio');

    const [hostClient, betoClient, caioClient] = await Promise.all(
      [host, beto, caio].map((j) => PlayerClient.connect(ctx, j)),
    );
    clients.push(hostClient, betoClient, caioClient);

    await betoClient.waitFor(
      (c) => c.state?.players.filter((p) => p.connected).length === 3,
      'três jogadores online',
    );
    expect(betoClient.state!.players.find((p) => p.isHost)?.nickname).toBe('Ana');

    const denied = await betoClient.emit('room:settings', { voteLock: true });
    expect(denied).toEqual({ ok: false, error: expect.objectContaining({ code: 'NOT_HOST' }) });

    const accepted = await hostClient.emit('room:settings', { voteLock: true, votingSeconds: 5 });
    expect(accepted.ok).toBe(true);
    await caioClient.waitFor((c) => c.state?.settings.voteLock === true, 'configuração nova');
    expect(caioClient.state!.settings.votingSeconds).toBe(10);

    caioClient.close();
    await hostClient.waitFor(
      (c) => c.state?.players.find((p) => p.nickname === 'Caio')?.connected === false,
      'Caio offline',
    );
  });

  it('stores the avatar in S3 and serves it back', async () => {
    const host = await createRoom(ctx, 'Ana');
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );

    const upload = await request(ctx.url)
      .put('/api/players/me/avatar')
      .set('Authorization', `Bearer ${host.token}`)
      .attach('file', png, { filename: 'eu.png', contentType: 'image/png' })
      .expect(200);
    expect(upload.body.avatarUrl).toMatch(/^\/api\/avatars\/.+\.png$/);
    expect([...ctx.storage.objects.keys()].some((k) => k.startsWith('avatars/'))).toBe(true);

    const image = await request(ctx.url).get(upload.body.avatarUrl).expect(200);
    expect(image.headers['content-type']).toBe('image/png');
  });

  it('requires a token to upload an avatar', async () => {
    await request(ctx.url).put('/api/players/me/avatar').expect(401);
  });
});
