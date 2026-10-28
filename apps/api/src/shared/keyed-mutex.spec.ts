import { KeyedMutex } from './keyed-mutex';

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('KeyedMutex', () => {
  it('runs tasks with the same key one after the other', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];
    await Promise.all([
      mutex.run('room', async () => {
        order.push('a:start');
        await tick();
        order.push('a:end');
      }),
      mutex.run('room', async () => {
        order.push('b:start');
        order.push('b:end');
      }),
    ]);
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });

  it('keeps going after a task fails', async () => {
    const mutex = new KeyedMutex();
    await expect(mutex.run('room', async () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
    await expect(mutex.run('room', async () => 42)).resolves.toBe(42);
  });

  it('does not block different keys', async () => {
    const mutex = new KeyedMutex();
    const order: string[] = [];
    await Promise.all([
      mutex.run('a', async () => {
        await tick();
        order.push('a');
      }),
      mutex.run('b', async () => {
        order.push('b');
      }),
    ]);
    expect(order).toEqual(['b', 'a']);
  });
});
