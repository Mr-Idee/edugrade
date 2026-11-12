import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { app } from './app.ts';

const port = Number(process.env.PORT || 3000);
const vite = await createViteServer({
  appType: 'spa',
  server: { middlewareMode: true }
});

app.use(vite.middlewares);
app.use('*', async (request, response, next) => {
  try {
    const template = await vite.transformIndexHtml(
      request.originalUrl,
      await readFile('index.html', 'utf8')
    );
    response.status(200).set({ 'Content-Type': 'text/html' }).send(template);
  } catch (error) {
    next(error);
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`EduGrade cloud-mode development server listening on http://localhost:${port}`);
});
