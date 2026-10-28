import 'reflect-metadata';
import { startWorker } from './bootstrap';

/**
 * O worker é um processo separado da API: consome as filas SQS e expõe só
 * /health e /stats. Pode ter várias réplicas; o SQS distribui as mensagens.
 */
void startWorker();
