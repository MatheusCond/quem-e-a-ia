/**
 * O token de cada sala fica no localStorage do navegador. É ele que permite
 * voltar para a sala depois de fechar a aba ou perder a conexão.
 */
const key = (code: string) => `quem-e-a-ia:sala:${code.toUpperCase()}`;

export function saveToken(code: string, token: string): void {
  try {
    localStorage.setItem(key(code), token);
  } catch {
    // Navegação anônima com armazenamento bloqueado: a sessão dura só esta aba.
  }
}

export function loadToken(code: string): string | null {
  try {
    return localStorage.getItem(key(code));
  } catch {
    return null;
  }
}

export function clearToken(code: string): void {
  try {
    localStorage.removeItem(key(code));
  } catch {
    // ignorado
  }
}

export function readFlag(name: string): boolean {
  try {
    return localStorage.getItem(`quem-e-a-ia:${name}`) === '1';
  } catch {
    return false;
  }
}

export function writeFlag(name: string): void {
  try {
    localStorage.setItem(`quem-e-a-ia:${name}`, '1');
  } catch {
    // ignorado
  }
}
