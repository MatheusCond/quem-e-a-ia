import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { AwsConnection, awsClientConfig } from './aws-connection';
import { BusLogger } from './message-bus';

export type SecretValues = Record<string, string>;

/**
 * Lê um segredo JSON do Secrets Manager e devolve só os campos pedidos.
 *
 * Ordem de prioridade para cada chave:
 *   1. valor não vazio no Secrets Manager;
 *   2. variável de ambiente (.env), o fallback de desenvolvimento.
 *
 * Se o Secrets Manager estiver fora do ar ou SECRETS_ID não estiver
 * configurado, tudo vem do ambiente e um aviso vai para o log.
 */
export async function loadSecrets(options: {
  secretId: string | undefined;
  keys: readonly string[];
  connection: AwsConnection;
  logger: BusLogger;
  env?: NodeJS.ProcessEnv;
}): Promise<SecretValues> {
  const env = options.env ?? process.env;
  let fromManager: SecretValues = {};

  if (options.secretId) {
    try {
      const client = new SecretsManagerClient(awsClientConfig(options.connection));
      const output = await client.send(new GetSecretValueCommand({ SecretId: options.secretId }));
      fromManager = JSON.parse(output.SecretString ?? '{}') as SecretValues;
      options.logger.log(`Segredos carregados do Secrets Manager (${options.secretId})`);
    } catch (error) {
      options.logger.warn(
        `Secrets Manager indisponível (${(error as Error).message}); usando variáveis de ambiente`,
      );
    }
  }

  const result: SecretValues = {};
  for (const key of options.keys) {
    const value = fromManager[key] || env[key];
    if (value) result[key] = value;
  }
  return result;
}
