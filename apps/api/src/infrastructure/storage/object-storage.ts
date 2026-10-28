import { Readable } from 'node:stream';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { AwsConnection, awsClientConfig } from '@quem/cloud';

export interface StoredObject {
  body: Readable;
  contentType: string;
}

/**
 * Porta de armazenamento de arquivos. Em produção é o S3 (LocalStack no
 * desenvolvimento); na hospedagem gratuita, uma tabela do Postgres; nos
 * testes, um Map em memória.
 */
export abstract class ObjectStorage {
  abstract put(key: string, body: Buffer | string, contentType: string): Promise<void>;
  abstract get(key: string): Promise<StoredObject | null>;
}

export class S3ObjectStorage extends ObjectStorage {
  private readonly s3: S3Client;

  constructor(
    connection: AwsConnection,
    private readonly bucket: string,
  ) {
    super();
    // forcePathStyle: o LocalStack atende em http://localstack:4566/<bucket>/<chave>.
    this.s3 = new S3Client({ ...awsClientConfig(connection), forcePathStyle: true });
  }

  async put(key: string, body: Buffer | string, contentType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const output = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        body: output.Body as Readable,
        contentType: output.ContentType ?? 'application/octet-stream',
      };
    } catch (error) {
      if ((error as { name?: string }).name === 'NoSuchKey') return null;
      throw error;
    }
  }
}

export class InMemoryObjectStorage extends ObjectStorage {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  async put(key: string, body: Buffer | string, contentType: string): Promise<void> {
    this.objects.set(key, { body: Buffer.from(body), contentType });
  }

  async get(key: string): Promise<StoredObject | null> {
    const object = this.objects.get(key);
    return object ? { body: Readable.from(object.body), contentType: object.contentType } : null;
  }
}
