/**
 * Moderação por lista de bloqueio.
 *
 * É propositalmente simples: pega ofensas e discurso de ódio óbvios, mesmo
 * com acento, maiúsculas, letras repetidas ou números no lugar de letras.
 * Não entende contexto; por isso existe também o botão de denúncia.
 * Palavrões comuns entre amigos não estão na lista de propósito.
 */
const BLOCKED_TERMS = [
  // ofensas homofóbicas, transfóbicas e capacitistas
  'viado',
  'traveco',
  'retardado',
  'mongoloide',
  // racismo
  'crioulo',
  'macaco imundo',
  // violência sexual e abuso
  'estupro',
  'estuprar',
  'pedofilo',
  'pedofilia',
  // apologia ao nazismo
  'heil hitler',
  'sieg heil',
  // termos em inglês frequentes em ataques
  'nigger',
  'faggot',
  'retard',
];

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

/** Minúsculas, sem acento, sem leetspeak e sem letras repetidas. */
export function normalizeForModeration(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[013457@$]/g, (char) => LEET[char] ?? char)
    .replace(/[^a-z\s]/g, ' ')
    .replace(/([a-z])\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const NORMALIZED_TERMS = BLOCKED_TERMS.map(normalizeForModeration);

/** Devolve o termo bloqueado encontrado, ou null se o texto estiver ok. */
export function findBlockedTerm(text: string): string | null {
  const normalized = ` ${normalizeForModeration(text)} `;
  for (const term of NORMALIZED_TERMS) {
    if (normalized.includes(` ${term} `)) return term;
  }
  return null;
}
