import { existsSync } from 'node:fs';
import { extname, join, sep } from 'node:path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { NextFunction, Request, Response } from 'express';

/**
 * Serve o front-end compilado pela própria API. Só é usado no modo processo
 * único; no docker compose quem faz isso é o nginx (apps/web/nginx.conf),
 * com as mesmas regras de cache.
 */
export function serveWebApp(app: NestExpressApplication, dir: string): void {
  const indexHtml = join(dir, 'index.html');
  if (!existsSync(indexHtml)) throw new Error(`WEB_DIST_DIR sem index.html: ${dir}`);

  app.useStaticAssets(dir, {
    index: false,
    setHeaders: (res, path) => {
      // Arquivos com hash no nome podem ficar em cache para sempre.
      if (path.includes(`${sep}assets${sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  });

  // Rotas do React Router (/sala/ABC123) caem no index.html.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const isPageRequest =
      req.method === 'GET' &&
      !req.path.startsWith('/api/') &&
      !req.path.startsWith('/socket.io/') &&
      !extname(req.path);
    if (!isPageRequest) return next();
    res.sendFile(indexHtml);
  });
}
