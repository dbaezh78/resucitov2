import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  // Fuerza a Vite a usar rutas relativas para activos importados en el index.html de producción,
  // permitiendo que el proyecto funcione en cualquier subcarpeta (ej: /resucitov2/)
  base: './',
  server: {
    port: 5173,
    open: true
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        perfil: path.resolve(__dirname, 'perfil.html'),
        preparar: path.resolve(__dirname, 'preparar.html')
      }
    }
  },
  plugins: [
    {
      name: 'save-chord-positions-middleware',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
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
          } else if (req.url === '/api/pull-positions' && req.method === 'POST') {
            try {
              const url = 'https://firestore.googleapis.com/v1/projects/cristoresucito/databases/(default)/documents/global_positions?pageSize=1000';
              const response = await fetch(url);
              if (!response.ok) {
                throw new Error(`Firebase REST API error: ${response.status} ${response.statusText}`);
              }
              const data = await response.json();
              const positionsDb = {};
              
              if (data.documents && Array.isArray(data.documents)) {
                for (const doc of data.documents) {
                  const parts = doc.name.split('/');
                  const cantoId = parts[parts.length - 1];
                  
                  const fields = doc.fields || {};
                  
                  const deserializeArray = (field) => {
                    if (!field || !field.arrayValue || !Array.isArray(field.arrayValue.values)) {
                      return [];
                    }
                    return field.arrayValue.values.map(v => {
                      const str = v.stringValue || '';
                      try {
                        return JSON.parse(str);
                      } catch (e) {
                        return str;
                      }
                    });
                  };
                  
                  positionsDb[cantoId] = {
                    lizq: deserializeArray(fields.lizq),
                    lder: deserializeArray(fields.lder)
                  };
                }
              }
              
              const filePath = path.resolve(__dirname, 'data', 'chord_positions.json');
              
              // Ensure directory exists
              const dirPath = path.dirname(filePath);
              if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
              }
              
              fs.writeFileSync(filePath, JSON.stringify(positionsDb, null, 2), 'utf8');
              console.log(`[Server] Pulled positions from Firebase. Updated chord_positions.json with ${Object.keys(positionsDb).length} songs.`);
              
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, count: Object.keys(positionsDb).length }));
            } catch (e) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: e.message }));
            }
          } else {
            next();
          }
        });
      }
    }
  ]
});
