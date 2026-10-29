/**
 * O token de cada sala fica em dois lugares:
 * - sessionStorage: a identidade desta aba. Sobrevive a recarregar a página e é
 *   separada por aba, então duas abas do mesmo navegador são duas pessoas.
 * - localStorage: a última sessão neste navegador. Quem fechou a aba e abriu o
 *   link de novo ganha um botão para voltar, em vez de entrar sem perguntar.
 */
const key = (code: string) => `quem-e-a-ia:sala:${code.toUpperCase()}`;

function read(storage: () => Storage, code: string): string | null {
  try {
    return storage().getItem(key(code));
  } catch {
    return null;
  }
}

export function saveToken(code: string, token: string): void {
  for (const storage of [() => sessionStorage, () => localStorage]) {
    try {
      storage().setItem(key(code), token);
    } catch {
      // Navegação anônima com armazenamento bloqueado: a sessão dura só esta aba.
    }
  }
}

/** A identidade desta aba na sala. */
export function loadToken(code: string): string | null {
  return read(() => sessionStorage, code);
}

/** A última sessão deste navegador na sala, para oferecer a volta. */
export function loadPreviousToken(code: string): string | null {
  return read(() => localStorage, code);
}

export function clearToken(code: string): void {
  for (const storage of [() => sessionStorage, () => localStorage]) {
    try {
      storage().removeItem(key(code));
    } catch {
      // ignorado
    }
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
