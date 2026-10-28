/**
 * Conteúdo do jogo: pseudônimos, avatares, temas e perguntas-relâmpago.
 * Fica separado das regras para ser fácil de editar sem mexer em lógica.
 */

export const PSEUDONYMS = [
  'Capivara Zen',
  'Pastel de Vento',
  'Coxinha Astral',
  'Pinguim de Geladeira',
  'Mandioca Cósmica',
  'Tatu-Bola',
  'Sabiá Noturno',
  'Paçoca Rebelde',
  'Jabuti Veloz',
  'Pamonha Ninja',
  'Brigadeiro Sombrio',
  'Caju Misterioso',
  'Bem-te-vi Curioso',
  'Quindim Secreto',
  'Tucano Filósofo',
  'Guaraná Elétrico',
  'Lobo-Guará Tímido',
  'Pão de Queijo Lunar',
  'Boto Cor-de-Rosa',
  'Arara Anônima',
  'Jacaré de Óculos',
  'Sagui Apressado',
  'Cuscuz Fantasma',
  'Saci Pensativo',
] as const;

export const AVATAR_EMOJIS = [
  '🦊',
  '🐸',
  '🐙',
  '🦉',
  '🐢',
  '🦜',
  '🐼',
  '🐨',
  '🦥',
  '🐝',
  '🦄',
  '🐧',
  '🦦',
  '🐞',
] as const;

export const AVATAR_COLORS = [
  '#e76f51',
  '#f4a261',
  '#e9c46a',
  '#2a9d8f',
  '#4c7bd9',
  '#8e6bd9',
  '#d96bb0',
  '#5aa864',
  '#c0563f',
  '#3e8fb0',
] as const;

export const THEMES = [
  'A pior comida que vocês já comeram',
  'Se ganhassem na loteria amanhã, o que fariam primeiro?',
  'A viagem dos sonhos do grupo',
  'O filme ou série que todo mundo deveria assistir',
  'A maior vergonha que já passaram na escola',
  'Qual superpoder seria mais útil no dia a dia?',
  'O melhor rolê que vocês já fizeram juntos',
  'Pizza de abacaxi: crime ou obra-prima?',
  'O emprego mais estranho que aceitariam',
  'Música boa de verdade é a de qual década?',
] as const;

export const FLASH_QUESTIONS = [
  'Qual foi a última coisa que você comeu?',
  'Café ou chá? Por quê?',
  'Descreva seu dia de hoje em três palavras.',
  'Qual emoji você mais usa?',
  'Que horas você acordou hoje?',
  'Qual é o seu lanche de madrugada favorito?',
  'Gato ou cachorro?',
  'Qual foi o último lugar onde você foi passear?',
] as const;

/** Usada quando o Mestre não escreve nada a tempo. */
export const DEFAULT_PERSONA =
  'Jovem brasileiro comum, escreve tudo em minúsculas, usa "kkkk" e gírias leves, ' +
  'responde curto e às vezes muda de assunto.';
