/**
 * Como falar com a AWS. Em desenvolvimento o endpoint aponta para o
 * LocalStack; em produção fica vazio e o SDK usa os endpoints reais.
 */
export interface AwsConnection {
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export function awsClientConfig(connection: AwsConnection) {
  return {
    region: connection.region,
    ...(connection.endpoint ? { endpoint: connection.endpoint } : {}),
    ...(connection.accessKeyId && connection.secretAccessKey
      ? {
          credentials: {
            accessKeyId: connection.accessKeyId,
            secretAccessKey: connection.secretAccessKey,
          },
        }
      : {}),
  };
}

export function awsConnectionFromEnv(env: NodeJS.ProcessEnv = process.env): AwsConnection {
  return {
    region: env.AWS_REGION ?? 'us-east-1',
    endpoint: env.AWS_ENDPOINT_URL || undefined,
    accessKeyId: env.AWS_ACCESS_KEY_ID || undefined,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY || undefined,
  };
}
