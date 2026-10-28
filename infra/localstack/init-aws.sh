#!/bin/bash
# Cria no LocalStack os recursos AWS do jogo. Roda sozinho quando o
# container fica pronto (pasta /etc/localstack/init/ready.d).
#
#   SNS chat-events  ──> SQS ai-turns        (worker: turnos da IA)
#   SNS ai-replies   ──> SQS ai-replies-api  (api: respostas da IA)
#   SNS match-events ──> SQS match-ranking   (api: ranking da sala)
#                    └─> SQS match-stats     (worker: estatísticas)
#
# Cada fila tem uma DLQ: depois de 3 falhas a mensagem sai do caminho.
set -euo pipefail

REGION="${AWS_DEFAULT_REGION:-us-east-1}"
ACCOUNT="000000000000"

create_queue() {
  local name="$1" visibility="$2"
  awslocal sqs create-queue --queue-name "${name}-dlq" >/dev/null
  local dlq_arn="arn:aws:sqs:${REGION}:${ACCOUNT}:${name}-dlq"
  local attributes
  attributes=$(python3 -c '
import json, sys
dlq, visibility = sys.argv[1], sys.argv[2]
print(json.dumps({
    "VisibilityTimeout": visibility,
    "RedrivePolicy": json.dumps({"deadLetterTargetArn": dlq, "maxReceiveCount": "3"}),
}))' "$dlq_arn" "$visibility")
  awslocal sqs create-queue --queue-name "$name" --attributes "$attributes" >/dev/null
}

subscribe() {
  local topic="$1" queue="$2"
  awslocal sns subscribe \
    --topic-arn "arn:aws:sns:${REGION}:${ACCOUNT}:${topic}" \
    --protocol sqs \
    --notification-endpoint "arn:aws:sqs:${REGION}:${ACCOUNT}:${queue}" \
    --attributes RawMessageDelivery=true >/dev/null
}

for topic in chat-events ai-replies match-events; do
  awslocal sns create-topic --name "$topic" >/dev/null
done

# O worker pode levar alguns segundos chamando o LLM: visibilidade maior.
create_queue ai-turns 60
create_queue ai-replies-api 30
create_queue match-ranking 30
create_queue match-stats 30

subscribe chat-events ai-turns
subscribe ai-replies ai-replies-api
subscribe match-events match-ranking
subscribe match-events match-stats

awslocal s3 mb "s3://${S3_BUCKET:-quem-e-a-ia}" >/dev/null

# Segredos: os valores vêm do .env (repassados pelo docker compose).
secret=$(python3 -c '
import json, os
keys = ["GEMINI_API_KEY", "JWT_SECRET", "BYOK_ENCRYPTION_KEY"]
print(json.dumps({key: os.environ.get(key, "") for key in keys}))')
awslocal secretsmanager create-secret --name "${SECRETS_ID:-quem-e-a-ia/app}" \
  --secret-string "$secret" >/dev/null

echo "Recursos AWS do Quem é a IA? criados no LocalStack."
