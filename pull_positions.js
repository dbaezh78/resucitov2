// pull_positions.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function pullPositionsFromFirebase() {
  const url = 'https://firestore.googleapis.com/v1/projects/cristoresucito/databases/(default)/documents/global_positions?pageSize=1000';
  console.log('🔄 Descargando posiciones de acordes desde Firebase...');
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error en la petición: ${response.status} ${response.statusText}`);
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
    
    // Asegurarse de que la carpeta data existe
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    fs.writeFileSync(filePath, JSON.stringify(positionsDb, null, 2), 'utf8');
    console.log(`✅ Archivo chord_positions.json actualizado con éxito (${Object.keys(positionsDb).length} cantos).`);
  } catch (err) {
    console.error('❌ Error al sincronizar posiciones:', err.message || err);
    process.exit(1);
  }
}

pullPositionsFromFirebase();
