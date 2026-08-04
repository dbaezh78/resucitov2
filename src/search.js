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
 * Filtra el catálogo de canciones basándose en la consulta, la etapa y los momentos litúrgicos.
 * @param {Array} songs Lista indexada de cantos
 * @param {string} query Texto buscado por el usuario
 * @param {string|null} activeStage Filtro por etapa (Precatecumenado, Catecumenado, Elección, Liturgia, etc.)
 * @param {Array} activeMoments Array de momentos litúrgicos seleccionados
 * @returns {Array} Cantos filtrados
 */
export function searchSongs(songs, query, activeStage = null, activeMoments = []) {
    const cleanQuery = normalizeText(query);
    const gluedQuery = cleanQuery.replace(/\s/g, ""); // Quitar todos los espacios para búsqueda elástica

    return songs.filter(song => {
        // 1. Filtrado por Etapa
        if (activeStage && song.stage.toLowerCase() !== activeStage.toLowerCase()) {
            return false;
        }

        // 2. Filtrado por Momentos Litúrgicos / Categorías
        if (activeMoments.length > 0) {
            const songMoments = (song.category || []).map(m => normalizeText(m));
            const matchesAllMoments = activeMoments.every(moment => {
                const cleanMoment = normalizeText(moment);
                return songMoments.includes(cleanMoment) ||
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
}
