import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  // Fuerza a Vite a usar rutas relativas para activos importados en el index.html de producción,
  // permitiendo que el proyecto funcione en cualquier subcarpeta (ej: /lab/resucito/)
  base: './',
  server: {
    port: 5173,
    open: true
  },
  plugins: [
    {
      name: 'save-chord-positions-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/api/save-positions' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                const { songId, lizq, lder } = data;
                
                if (!songId) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: 'Missing songId' }));
                  return;
                }
                
                const filePath = path.resolve(__dirname, 'data', 'chord_positions.json');
                let positionsDb = {};
                if (fs.existsSync(filePath)) {
                  positionsDb = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                }
                
                positionsDb[songId] = { lizq, lder };
                
                fs.writeFileSync(filePath, JSON.stringify(positionsDb, null, 2), 'utf8');
                console.log(`[Server] Saved chord positions for song: ${songId}`);
                
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true, message: `Positions saved to data/chord_positions.json for ${songId}` }));
              } catch (e) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: e.message }));
              }
            });
          } else {
            next();
          }
        });
      }
    }
  ]
});
