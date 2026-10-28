import { findBlockedTerm, normalizeForModeration } from './moderation';

describe('moderation', () => {
  it('normalizes accents, case, leetspeak and repeated letters', () => {
    expect(normalizeForModeration('Pédöfiiiilo!!')).toBe('pedofilo');
    expect(normalizeForModeration('r3t4rd4do')).toBe('retardado');
  });

  it('finds blocked terms even when disguised', () => {
    expect(findBlockedTerm('você é um VIAAADO')).toBe('viado');
    expect(findBlockedTerm('sieg   heil')).toBe('sieg heil');
  });

  it('only matches whole words', () => {
    // "retard" não pode bloquear "retardar" (atrasar).
    expect(findBlockedTerm('vou retardar o envio')).toBeNull();
  });

  it('lets ordinary chat through', () => {
    expect(findBlockedTerm('kkkk que isso mano, bora jogar mais tarde?')).toBeNull();
  });
});
