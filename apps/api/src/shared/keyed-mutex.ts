/**
 * Fila de execução por chave. Duas operações da mesma sala nunca rodam ao
 * mesmo tempo; salas diferentes rodam em paralelo.
 *
 * Sem isso, um voto e o timer que encerra a votação poderiam ler o mesmo
 * estado, cada um alterar uma parte e o último a salvar apagaria o outro.
 * Funciona dentro de um processo; com várias instâncias da API seria preciso
 * um lock distribuído (ver docs/DECISOES.md).
 */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    const tail = current.catch(() => undefined);
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return current;
  }
}
