const fs = require('fs');
const path = require('path');

// 1. Leer src/songs-data.js
let songsDataContent = fs.readFileSync(path.join(__dirname, 'src', 'songs-data.js'), 'utf-8');

// Quitar export si existe al final del archivo
songsDataContent = songsDataContent.replace(/export\s*\{[^}]*\};?/g, '').replace(/export\s+default\s+[^;]+;?/g, '');

// Extraer el array songs
const fn = new Function(songsDataContent + '; return songs;');
const songsData = fn();

console.log(`Cargados ${songsData.length} cantos desde src/songs-data.js`);

// Crear mapa id -> acorde
const chordMap = {};
songsData.forEach(s => {
  if (s.id) {
    chordMap[s.id] = s.acorde || '';
  }
});

// 2. Leer data/songs-index.json
const indexPath = path.join(__dirname, 'data', 'songs-index.json');
const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

console.log(`Cargados ${indexData.length} cantos desde data/songs-index.json`);

// 3. Sincronizar campo acorde
let updatedCount = 0;
indexData.forEach(song => {
  const acorde = chordMap[song.id];
  if (acorde !== undefined) {
    song.acorde = acorde;
    updatedCount++;
  }
});

console.log(`Actualizado campo acorde en ${updatedCount} cantos.`);

// 4. Guardar data/songs-index.json
fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2), 'utf-8');

// Copiar a dist/data/songs-index.json si existe dist/data
const distDir = path.join(__dirname, 'dist', 'data');
if (fs.existsSync(distDir)) {
  fs.writeFileSync(path.join(distDir, 'songs-index.json'), JSON.stringify(indexData, null, 2), 'utf-8');
  console.log('Copiado a dist/data/songs-index.json');
}
