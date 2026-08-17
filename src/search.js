/**
 * Módulo de búsqueda ultra-elástica de David.
 * Normaliza acentos, elimina puntuación y realiza búsquedas espaciadas e hiladas.
 */

/**
 * Normaliza y limpia una cadena de texto para comparación.
 * Quita acentos y caracteres especiales.
 * @param {string} text 
 * @returns {string}
 */
export function normalizeText(text) {
    if (!text) return '';
    return text.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
        .replace(/[^a-z0-9\s]/g, "")     // Quitar puntuación y símbolos
        .replace(/\s+/g, ' ')            // Colapsar espacios múltiples
        .trim();
}

/**
 * Calcula la puntuación de relevancia para ordenar los resultados de búsqueda.
 * @param {Object} song Objeto de la canción
 * @param {string} cleanQuery Consulta de búsqueda normalizada
 * @returns {number} Puntuación de relevancia
 */
function getRelevanceScore(song, cleanQuery) {
    if (!cleanQuery) return 0;
    const cleanTitle = normalizeText(song.title || '');
    const cleanSubtitle = normalizeText(song.subtitle || '');
    
    // 1. Coincidencia exacta de título
    if (cleanTitle === cleanQuery) return 100;
    
    // 2. El título empieza con la consulta
    if (cleanTitle.startsWith(cleanQuery)) return 80;
    
    // 3. El título contiene la consulta
    if (cleanTitle.includes(cleanQuery)) return 60;
    
    // 4. El subtítulo contiene la consulta
    if (cleanSubtitle.includes(cleanQuery)) return 40;
    
    // 5. La letra / pool contiene la consulta
    const pool = song.searchPool || '';
    if (pool.includes(cleanQuery)) return 20;
    
    // 6. Búsqueda elástica pegada
    const gluedQuery = cleanQuery.replace(/\s/g, "");
    const gluedPool = pool.replace(/\s/g, "");
    if (gluedQuery.length > 2 && gluedPool.includes(gluedQuery)) return 10;
    
    return 0;
}

/**
 * Filtra el catálogo de canciones basándose en la consulta, la etapa y los momentos litúrgicos.
 * @param {Array} songs Lista indexada de cantos
 * @param {string} query Texto buscado por el usuario
 * @param {string|null} activeStage Filtro por etapa (Precatecumenado, Catecumenado, Elección, Liturgia, etc.)
 * @param {Array} activeMoments Array de momentos litúrgicos seleccionados
 * @returns {Array} Cantos filtrados y ordenados por relevancia
 */
export function searchSongs(songs, query, activeStage = null, activeMoments = []) {
    const cleanQuery = normalizeText(query);
    const gluedQuery = cleanQuery.replace(/\s/g, ""); // Quitar todos los espacios para búsqueda elástica

    // Convertir activeMoments a Array si se pasa como Set o Array
    const momentsArray = Array.isArray(activeMoments) ? activeMoments : (activeMoments ? Array.from(activeMoments) : []);

    const filtered = songs.filter(song => {
        // SEGURIDAD: Filtrar según la etapa del usuario y la etapa requerida por el canto
        if (typeof window.canCurrentUserSeeSong === 'function' && !window.canCurrentUserSeeSong(song.id)) {
            return false;
        }

        // 1. Filtrado por Etapa
        if (activeStage && normalizeText(song.stage || '') !== normalizeText(activeStage)) {
            return false;
        }

        // 2. Filtrado por Momentos Litúrgicos / Categorías
        if (momentsArray.length > 0) {
            const rawCategory = song.category || song.moments || [];
            const songCategoryList = Array.isArray(rawCategory) ? rawCategory : (rawCategory ? [rawCategory] : []);
            const songMoments = songCategoryList.map(m => normalizeText(m));
            const songStageClean = normalizeText(song.stage || '');

            const matchesAllMoments = momentsArray.every(moment => {
                const cleanMoment = normalizeText(moment);
                return songMoments.includes(cleanMoment) ||
                       songStageClean === cleanMoment ||
                       (cleanMoment === 'aclamacion' && song.sourceBook === 'aclamaciones') ||
                       (cleanMoment === 'catolicos' && (songMoments.includes('catolicos') || song.sourceBook === 'joven'));
            });
            if (!matchesAllMoments) return false;
        }

        // 3. Filtrado por búsqueda elástica (Pool unificado)
        if (!cleanQuery) return true;

        const pool = song.searchPool || '';
        const gluedPool = pool.replace(/\s/g, "");

        // Regla 1: Búsqueda exacta respetando espacios
        if (pool.includes(cleanQuery)) return true;

        // Regla 2: Búsqueda elástica pegada (ej: "quienesestaquesube" -> "quien es esta que sube")
        if (gluedQuery.length > 2 && gluedPool.includes(gluedQuery)) return true;

        return false;
    });

    if (!cleanQuery) return filtered;

    // Ordenar por relevancia
    return filtered
        .map(song => ({
            song,
            score: getRelevanceScore(song, cleanQuery)
        }))
        .sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            const titleA = a.song.title || '';
            const titleB = b.song.title || '';
            return titleA.localeCompare(titleB);
        })
        .map(item => item.song);
}
