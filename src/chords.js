/**
 * Módulo de transposición de acordes y cálculo de cejilla (capo).
 */

// Escala cromática de acordes usada por la app
export const CHROMATIC_SCALE = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "Si♭", "Si"];

// Mapeo inverso para resolver equivalencias en bemoles y sostenidos
const CHORD_TO_SEMITONE = {
    "Do": 0, "DO": 0,
    "Do#": 1, "DO#": 1, "Reb": 1, "Re♭": 1, "REB": 1,
    "Re": 2, "RE": 2,
    "Re#": 3, "RE#": 3, "Mib": 3, "Mi♭": 3, "MIB": 3,
    "Mi": 4, "MI": 4,
    "Fa": 5, "FA": 5,
    "Fa#": 6, "FA#": 6, "Solb": 6, "Sol♭": 6, "SOLB": 6,
    "Sol": 7, "SOL": 7,
    "Sol#": 8, "SOL#": 8, "Lab": 8, "La♭": 8, "LAB": 8,
    "La": 9, "LA": 9,
    "Si♭": 10, "Sib": 10, "SIB": 10, "Si♭": 10,
    "Si": 11, "SI": 11
};

/**
 * Normaliza un acorde de entrada para que coincida con la escala estándar.
 * @param {string} chordName Nombre del acorde (ej: "Sib", "Do#", "Reb")
 * @returns {string} Nombre del acorde normalizado de la escala
 */
export function normalizeChord(chordName) {
    if (!chordName) return '';
    const clean = chordName.trim();
    const semitone = CHORD_TO_SEMITONE[clean];
    if (semitone !== undefined) {
        return CHROMATIC_SCALE[semitone];
    }
    return clean;
}

/**
 * Transpone una nota original según la diferencia de semitonos dada.
 * @param {string} originalNote Nombre de la nota base (ej: "La", "Si♭")
 * @param {number} semitoneShift Diferencia de semitonos (ej: +2, -3)
 * @returns {string} Nueva nota transpuesta
 */
export function transposeNote(originalNote, semitoneShift) {
    if (!originalNote) return '';
    const cleanNote = originalNote.trim();
    const semitone = CHORD_TO_SEMITONE[cleanNote];
    if (semitone === undefined) {
        return originalNote; // Retornar tal cual si no se reconoce (ej: notas de paso o texto)
    }
    
    let newSemitone = (semitone + semitoneShift) % 12;
    if (newSemitone < 0) {
        newSemitone += 12;
    }
    
    return CHROMATIC_SCALE[newSemitone];
}

/**
 * Calcula el acorde visual que debe tocarse basándose en el traste de la cejilla.
 * (Tocar en Mi mayor con cejilla en el 3er traste suena en Sol mayor, por lo que el acorde virtual es Mi)
 * @param {string} targetChord Acorde deseado en tono real (ej: "Sol")
 * @param {number} capoTraste Traste del capo (ej: 3)
 * @returns {string} El acorde virtual a digitalizar con los dedos (ej: "Mi")
 */
export function getVirtualChord(targetChord, capoTraste) {
    // Para sonar targetChord con capo en capoTraste, debemos tocar (targetChord - capoTraste) semitonos
    return transposeNote(targetChord, -capoTraste);
}

/**
 * Calcula qué acorde real suena cuando se digitaliza un acorde base con cejilla.
 * (Tocar Mi con cejilla en 3 resulta en Sol)
 * @param {string} virtualChord Acorde digitalizado con los dedos (ej: "Mi")
 * @param {number} capoTraste Traste del capo (ej: 3)
 * @returns {string} El acorde real que se escucha (ej: "Sol")
 */
/**
 * Calcula qué acorde real suena cuando se digitaliza un acorde base con cejilla.
 * (Tocar Mi con cejilla en 3 resulta en Sol)
 * @param {string} virtualChord Acorde digitalizado con los dedos (ej: "Mi")
 * @param {number} capoTraste Traste del capo (ej: 3)
 * @returns {string} El acorde real que se escucha (ej: "Sol")
 */
export function getRealChord(virtualChord, capoTraste) {
    return transposeNote(virtualChord, capoTraste);
}

/**
 * Separa el nombre base de la nota de su variación/sufijo (ej: "Do 7" -> { noteName: "Do", typeSuffix: "7" })
 * @param {string} chordStr Nombre del acorde completo (ej: "Do 7", "Si♭ m", "Fa# 7")
 * @returns {{ noteName: string, typeSuffix: string }} Objeto con la nota base normalizada y el sufijo
 */
export function parseChord(chordStr) {
    if (!chordStr) return { noteName: 'La', typeSuffix: '' };
    
    const clean = chordStr.trim();
    
    // Lista de las 12 notas cromáticas ordenadas por longitud descendente para evitar falsas coincidencias
    const notesOrder = [
        "Do#", "Re#", "Fa#", "Sol#", "Si♭", "Sib", "DO#", "RE#", "FA#", "SOL#", "SIB", 
        "Do", "Re", "Mi", "Fa", "Sol", "La", "Si", "DO", "RE", "MI", "FA", "SOL", "LA", "SI"
    ];
    
    for (const note of notesOrder) {
        if (clean.startsWith(note)) {
            const typeSuffix = clean.substring(note.length).trim();
            return {
                noteName: normalizeChord(note),
                typeSuffix: typeSuffix
            };
        }
    }
    
    return { noteName: normalizeChord(clean), typeSuffix: '' };
}
