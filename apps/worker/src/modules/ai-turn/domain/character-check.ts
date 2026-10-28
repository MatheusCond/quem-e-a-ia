/**
 * Heurística para "a IA saiu do personagem": a resposta admite ser uma IA
 * ou soa como assistente. Não pega tudo, mas pega o clássico
 * "Como um modelo de linguagem, eu não posso...".
 */
const PATTERNS = [
  /\b(sou|eu sou) (uma?|um) (ia|inteligencia artificial|bot|robo|chatbot|modelo de linguagem|assistente( virtual)?|programa)\b/,
  /\bcomo (uma ia|uma inteligencia artificial|um modelo de linguagem|um assistente virtual)\b/,
  /\bmodelo de linguagem\b/,
  /\b(fui|sou) (programad|treinad)[oa]\b/,
  /\bnao posso (ajudar|fazer isso|atender)\b/,
  /\bas an ai\b/,
  /\blanguage model\b/,
  /\bi am an? (ai|bot|assistant)\b/,
];

export function breaksCharacter(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ');
  return PATTERNS.some((pattern) => pattern.test(normalized));
}
