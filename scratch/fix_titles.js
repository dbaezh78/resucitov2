const fs = require('fs');

const PROPER_NOUNS = new Set([
  // Nombres sagrados y de Dios
  "Dios", "Señor", "Yahveh", "Yahvé", "Yahve",
  "Padre", "Hijo", "Espíritu", "Santo", "Trinidad",
  "Jesús", "Jesus", "Cristo", "Emmanuel", "Salvador", "Mesías", "Mesias",
  "María", "Maria", "Mariam", "Virgen", "Santa", "Santísima", "Santísimo", "Santuario",
  
  // Personajes bíblicos y nombres propios
  "Moisés", "Moises", "Abraham", "Jacob", "Israel", "Balaam", "Isaac", "David", "Jesé", "Jese",
  "Débora", "Debora", "Elías", "Elias", "Ezequiel", "Isaías", "Isaias", "Jeremías", "Jeremias",
  "Zaqueo", "Pablo", "Pedro", "Juan", "San", "Cruz", "Job", "Noé", "Noe",
  "Kiko", "Carmen", "Argüello",
  
  // Lugares sagrados y geográficos
  "Sión", "Sion", "Jerusalén", "Jerusalen", "Belén", "Belen", "Egipto", "Sinaí", "Sinai",
  "Jordán", "Jordan", "Galilea", "Tabor", "Líbano", "Libano", "Mambré", "Mambre", "Ur", "Roma", "Jasna", "Góra", "Babilonia", "Aram", "Moab",
  
  // Tiempos litúrgicos y festividades
  "Pascua", "Pascual", "Pentecostés", "Pentecostes", "Adviento", "Navidad", "Cuaresma",
  "Epifanía", "Epifania", "Vigilia", "Jueves", "Viernes", "Domingo", "Ramos", "Ascensión", "Ascension",
  
  // Términos litúrgicos / hebreos / latinos usados como nombre
  "Abbá", "Abba", "Dayenú", "Evenu", "Shemá", "Shema", "Shalom", "Shlom", "Magníficat", "Magnificat",
  "Benedictus", "Stabat", "Mater", "Urget", "Aquedah", "Noli", "Tangere", "Deum", "Credo",
  "Gloria", "Aleluya", "Amén", "Amen", "Salmo", "Cántico", "Cantico", "Resucitó", "Resucito", "Resurrexit",
  "Improperios", "Rosario", "Letanías", "Letanias", "Prefacio", "Pregón", "Plegaria", "Aclamación", "Aclamaciones", "Villancico", "Te",
  "Christi", "Lauda", "Laudes", "Creator"
]);

// Expresión regular para detectar numerales romanos (I, II, III, IV, etc.)
const ROMAN_REGEX = /^([IVXLCDM]+)(,|[.:;!?ªº])?$/i;

function cleanWordForLookup(word) {
  return word.replace(/^[«"'(¡¿]+/, '').replace(/[»"'),.:;!?ªº]+$/, '');
}

function formatTitle(title) {
  if (!title || typeof title !== 'string') return title;
  
  // Dividir por espacios preservando puntuación
  const words = title.trim().split(/\s+/);
  
  const formattedWords = words.map((word, index) => {
    const clean = cleanWordForLookup(word);
    
    // Si la palabra limpia coincide con un numeral romano (ej: I, II, III, IV, 1984 no es romano)
    if (ROMAN_REGEX.test(clean) && clean.toUpperCase() === clean) {
      return word.toUpperCase();
    }
    
    // Buscar si la palabra (con acento/caso exacto) es un nombre propio reservado
    let matchedProper = null;
    for (const prop of PROPER_NOUNS) {
      if (clean.toLowerCase() === prop.toLowerCase()) {
        matchedProper = prop;
        break;
      }
    }
    
    if (matchedProper) {
      // Reemplazar la parte limpia respetando signos alrededor
      const reg = new RegExp(clean, 'i');
      return word.replace(reg, matchedProper);
    }
    
    // Si es la primera palabra del título, la primera letra en mayúscula
    if (index === 0) {
      // Convertir toda la palabra a minúsculas excepto la primera letra
      const lower = word.toLowerCase();
      // Encontrar la primera letra alfabética
      return lower.replace(/^([^a-záéíóúüñ]*)([a-záéíóúüñ])/i, (m, p1, p2) => p1 + p2.toUpperCase());
    }
    
    // Todas las demás palabras que no son nombres propios van en minúsculas
    return word.toLowerCase();
  });
  
  return formattedWords.join(' ');
}

// Cargar songs-index.json
const indexPath = 'data/songs-index.json';
const songsIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

let changedCount = 0;
songsIndex.forEach(s => {
  const oldTitle = s.title;
  const newTitle = formatTitle(oldTitle);
  if (oldTitle !== newTitle) {
    console.log(`[${s.id}] "${oldTitle}"  -->  "${newTitle}"`);
    s.title = newTitle;
    changedCount++;
  }
});

console.log(`\nTotal cambiados: ${changedCount} de ${songsIndex.length}`);
