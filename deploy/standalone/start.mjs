/**
 * Modo processo único: API, worker e front-end no mesmo Node.
 *
 * É o formato da hospedagem gratuita, que dá um container só, sem SNS/SQS e
 * sem S3. Os eventos passam pelo barramento em memória e os arquivos vão
 * para uma tabela do Postgres. O código de negócio é o mesmo do docker
 * compose; só mudam os adaptadores (veja docs/HOSPEDAGEM.md).
 */
import { fileURLToPath } from 'node:url';

process.env.MESSAGE_BUS ??= 'memory';
process.env.OBJECT_STORAGE ??= 'postgres';
process.env.WEB_DIST_DIR ??= fileURLToPath(new URL('../../apps/web/dist', import.meta.url));

// Imports dinâmicos: as variáveis acima precisam existir antes de os módulos carregarem.
await import('reflect-metadata');
const { startWorker } = await import('../../apps/worker/dist/bootstrap.js');
const { startApi } = await import('../../apps/api/dist/bootstrap.js');

// O worker sobe antes para já estar inscrito nas filas quando a API publicar.
await startWorker({ listen: false });
await startApi();
