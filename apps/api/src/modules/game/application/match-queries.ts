import { EntityManager } from '@mikro-orm/postgresql';
import { GameError } from '../../../shared/game-error';
import { GameMatch } from '../domain/game-match';

/** A partida mais recente da sala (em andamento ou a última revelada). */
export function findCurrentMatch(em: EntityManager, roomId: string): Promise<GameMatch | null> {
  return em.findOne(GameMatch, { roomId }, { orderBy: { number: 'desc' } });
}

export async function requireCurrentMatch(em: EntityManager, roomId: string): Promise<GameMatch> {
  const match = await findCurrentMatch(em, roomId);
  if (!match) throw new GameError('INVALID_PHASE', 'Nenhuma partida em andamento.');
  return match;
}
