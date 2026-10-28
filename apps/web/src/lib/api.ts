import type { ApiErrorBody } from '@quem/shared';

export interface JoinResult {
  roomCode: string;
  playerId: string;
  token: string;
}

export interface RoomSummary {
  code: string;
  playerCount: number;
  maxPlayers: number;
}

/** Erro devolvido pela API, já com a mensagem em português. */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError('NETWORK', 'Sem conexão com o servidor. Confira a internet.');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = body as Partial<ApiErrorBody>;
    throw new ApiError(error.code ?? 'INTERNAL', error.message ?? 'Algo deu errado.');
  }
  return body as T;
}

const json = (data: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});

export const api = {
  createRoom: (nickname: string) => request<JoinResult>('/rooms', json({ nickname })),

  joinRoom: (code: string, nickname: string) =>
    request<JoinResult>(`/rooms/${encodeURIComponent(code)}/players`, json({ nickname })),

  getRoom: (code: string) => request<RoomSummary>(`/rooms/${encodeURIComponent(code)}`),

  uploadAvatar: (token: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ avatarUrl: string }>('/players/me/avatar', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  },
};
