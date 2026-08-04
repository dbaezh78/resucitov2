const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Source paths
const SRC_IMA_DIR = 'C:/db/Github/resucito/src/ima';
const SRC_DATA_DIR = 'C:/db/Github/resucito/src/data';

// Target paths
const TARGET_DATA_DIR = path.resolve(__dirname, 'data');
const TARGET_SONGS_DIR = path.resolve(TARGET_DATA_DIR, 'songs');
const TARGET_IMA_DIR = path.resolve(__dirname, 'ima');

// Ensure target directories exist
if (!fs.existsSync(TARGET_DATA_DIR)) {
    fs.mkdirSync(TARGET_DATA_DIR, { recursive: true });
}
if (!fs.existsSync(TARGET_SONGS_DIR)) {
    fs.mkdirSync(TARGET_SONGS_DIR, { recursive: true });
}
if (!fs.existsSync(TARGET_IMA_DIR)) {
    fs.mkdirSync(TARGET_IMA_DIR, { recursive: true });
}

console.log('--- COMPILANDO BASE DE DATOS DE CANTOS ---');

// Setup global context for evaluating legacy JS files
const sandbox = {
    window: {},
    console: console,
    document: {
        addEventListener: () => {},
        querySelector: () => {},
        getElementById: () => {}
    },
    localStorage: {
        getItem: () => null,
        setItem: () => {}
    }
};
sandbox.window = sandbox;
vm.createContext(sandbox);

// Master list of all songs
sandbox.allCantosData = [];

function runInContext(filePath, bookName = null) {
    console.log(`Leyendo ${path.basename(filePath)}...`);
    let code = fs.readFileSync(filePath, 'utf8');
    
    const prevLength = sandbox.allCantosData.length;
    
    // Check if the file defines allCantosData as a new array (overwriting it)
    const definesArray = /const\s+allCantosData\s*=/.test(code) || /let\s+allCantosData\s*=/.test(code);
    
    if (definesArray) {
        // Replace the declaration with a temporary variable name to avoid global collision
        code = code.replace(/const\s+allCantosData\s*=/, 'var tempAllCantosData =');
        code = code.replace(/let\s+allCantosData\s*=/, 'var tempAllCantosData =');
        
        // Replace other top-level const/let with var to avoid Node eval scoping issues
        code = code.replace(/const\s+/g, 'var ');
        code = code.replace(/let\s+/g, 'var ');
        
        vm.runInContext(code, sandbox, { filename: filePath });
        vm.runInContext('allCantosData.push(...tempAllCantosData); delete tempAllCantosData;', sandbox);
    } else {
        code = code.replace(/const\s+/g, 'var ');
        code = code.replace(/let\s+/g, 'var ');
        
        vm.runInContext(code, sandbox, { filename: filePath });
    }
    
    // Tag the newly added items with the sourceBook name
    if (bookName) {
        const currentLength = sandbox.allCantosData.length;
        for (let i = prevLength; i < currentLength; i++) {
            sandbox.allCantosData[i].sourceBook = bookName;
        }
    }
}

// Helper to clean/normalize text for search index
function cleanTextForIndex(text) {
    if (!text) return '';
    return text.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/[^a-z0-9\s]/g, "")     // Remove punctuation
        .replace(/\s+/g, ' ')            // Normalize spacing
        .trim();
}

try {
    // 1. Cargar variables de Contents.js
    runInContext(path.join(SRC_DATA_DIR, 'Contents.js'));
    
    // 2. Cargar todos los archivos de datos etiquetando sus respectivos libros
    runInContext(path.join(SRC_DATA_DIR, 'canto_data.js'), 'resucito');
    runInContext(path.join(SRC_DATA_DIR, 'canto_data_aleluyai.js'), 'aclamaciones');
    runInContext(path.join(SRC_DATA_DIR, 'canto_data_joven.js'), 'joven');
    runInContext(path.join(SRC_DATA_DIR, 'canto_data_catolicos.js'), 'joven'); // Católicos se agrupa en Canto Joven
    runInContext(path.join(SRC_DATA_DIR, 'salmodia_data.js'), 'salmodias');
    
    const songs = sandbox.allCantosData;
    console.log(`\nTotal de canciones compiladas: ${songs.length}`);
    
    // 3. Crear el índice ligero de canciones (metadata de búsqueda)
    const songsIndex = [];
    
    for (const song of songs) {
        if (!song.id) {
            console.warn('Advertencia: Canción sin ID detectada y omitida.', song);
            continue;
        }
        
        // Determinar etapa principal para filtrado
        let stage = 'Otros';
        if (song.catCanto) {
            stage = song.catCanto;
        } else if (song.category && song.category.length > 0) {
            stage = song.category[0];
        }
        
        // Extraer la letra de forma limpia para construir el buscador elástico
        let lyricsRaw = '';
        const processLines = (lines) => {
            if (!lines || !Array.isArray(lines)) return;
            for (const item of lines) {
                if (item && item.line) {
                    const lineText = item.line;
                    const parenIndex = lineText.indexOf('(');
                    const cleanLine = parenIndex !== -1 ? lineText.substring(0, parenIndex) : lineText;
                    lyricsRaw += cleanLine + ' ';
                } else if (item && item.lines && Array.isArray(item.lines)) {
                    // For collapsible blocks
                    for (const subLine of item.lines) {
                        if (subLine && subLine.line) {
                            const lineText = subLine.line;
                            const parenIndex = lineText.indexOf('(');
                            const cleanLine = parenIndex !== -1 ? lineText.substring(0, parenIndex) : lineText;
                            lyricsRaw += cleanLine + ' ';
                        }
                    }
                }
            }
        };
        
        processLines(song.lizq);
        processLines(song.lder);
        
        const cleanTitle = cleanTextForIndex(song.title || song.tt);
        const cleanSubtitle = cleanTextForIndex(song.subtitle);
        const cleanLyrics = cleanTextForIndex(lyricsRaw);
        
        // Agregar al índice
        songsIndex.push({
            id: song.id,
            title: song.title || song.tt || 'Sin Título',
            subtitle: song.subtitle || '',
            category: song.category || [],
            stage: stage,
            cejilla: song.cejilla || '',
            acorde: song.acorde || '',
            dbno: song.dbno || '',
            hasAudio: !!song.audioSrc,
            audioSrc: song.audioSrc || '',
            sourceBook: song.sourceBook || 'resucito',
            // Cadena de búsqueda unificada pre-normalizada y limpia
            searchPool: `${cleanTitle} ${cleanSubtitle} ${cleanLyrics}`.trim()
        });
        
        // Guardar detalle de canción
        const songDetailPath = path.join(TARGET_SONGS_DIR, `${song.id}.json`);
        fs.writeFileSync(songDetailPath, JSON.stringify(song, null, 2), 'utf8');
    }
    
    // Escribir índice
    fs.writeFileSync(
        path.join(TARGET_DATA_DIR, 'songs-index.json'), 
        JSON.stringify(songsIndex, null, 2), 
        'utf8'
    );
    console.log(`Índice con buscador elástico escrito en: data/songs-index.json (${songsIndex.length} entradas)`);
    
    // 4. Copiar archivos adicionales
    const extraFiles = ['catequesis.json', 'paises.json'];
    for (const file of extraFiles) {
        const srcPath = path.join(SRC_DATA_DIR, file);
        if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, path.join(TARGET_DATA_DIR, file));
            console.log(`Copiado archivo extra: ${file}`);
        }
    }
    
    // 5. Copiar imágenes
    console.log('\nCopiando diagramas de acordes e imágenes...');
    let copiedImagesCount = 0;
    if (fs.existsSync(SRC_IMA_DIR)) {
        const files = fs.readdirSync(SRC_IMA_DIR);
        for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            if (ext === '.jpg' || ext === '.png') {
                const srcPath = path.join(SRC_IMA_DIR, file);
                const targetPath = path.join(TARGET_IMA_DIR, file);
                fs.copyFileSync(srcPath, targetPath);
                copiedImagesCount++;
            }
        }
        console.log(`Copiadas ${copiedImagesCount} imágenes a ima/`);
    }
    
    console.log('\n--- COMPILACIÓN COMPLETADA CON ÉXITO ---');
    
} catch (e) {
    console.error('Error durante la compilación:', e);
    process.exit(1);
}
