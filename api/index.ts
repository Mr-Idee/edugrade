import type { Request, Response } from 'express';
import app from './app.ts';

export default function handler(request: Request, response: Response): void {
  const rewrittenUrl = new URL(request.url || '/', 'http://localhost');
  const originalPath = rewrittenUrl.searchParams.get('__vercel_route');
  if (!originalPath || !originalPath.startsWith('/api/')) {
    response.status(400).json({ ok: false, error: 'Invalid API route.' });
    return;
  }

  rewrittenUrl.searchParams.delete('__vercel_route');
  request.url = `${originalPath}${rewrittenUrl.search}`;
  app(request, response);
}
