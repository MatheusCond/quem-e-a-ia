import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Cifra a chave própria do Mestre ("Usar minha própria chave") antes de ela
 * entrar na fila. AES-256-GCM: além de esconder o conteúdo, detecta se a
 * mensagem foi alterada no caminho.
 *
 * O segredo vem do Secrets Manager (BYOK_ENCRYPTION_KEY) e só a api e o
 * worker o conhecem. Formato do resultado: base64(iv | authTag | dados).
 */
export class ApiKeyCipher {
  private readonly key: Buffer;

  constructor(secret: string) {
    if (!secret) throw new Error('BYOK_ENCRYPTION_KEY não configurada');
    // Deriva 32 bytes de qualquer texto, para aceitar segredos de tamanho livre.
    this.key = createHash('sha256').update(secret).digest();
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
  }

  decrypt(payload: string): string {
    const raw = Buffer.from(payload, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  }
}
