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

const ROMAN_REGEX = /^([IVXLCDM]+)(,|[.:;!?ªº])?$/i;

function cleanWordForLookup(word) {
  return word.replace(/^[«"'(¡¿]+/, '').replace(/[»"'),.:;!?ªº]+$/, '');
}

function formatTitle(title) {
  if (!title || typeof title !== 'string') return title;
  
  const words = title.trim().split(/\s+/);
  
  const formattedWords = words.map((word, index) => {
    const clean = cleanWordForLookup(word);
    
    if (ROMAN_REGEX.test(clean) && clean.toUpperCase() === clean && isNaN(clean)) {
      return word.toUpperCase();
    }
    
    let matchedProper = null;
    for (const prop of PROPER_NOUNS) {
      if (clean.toLowerCase() === prop.toLowerCase()) {
        matchedProper = prop;
        break;
      }
    }
    
    if (matchedProper) {
      const reg = new RegExp(clean, 'i');
      return word.replace(reg, matchedProper);
    }
    
    if (index === 0) {
      const lower = word.toLowerCase();
      return lower.replace(/^([^a-záéíóúüñ]*)([a-záéíóúüñ])/i, (m, p1, p2) => p1 + p2.toUpperCase());
    }
    
    return word.toLowerCase();
  });
  
  return formattedWords.join(' ');
}

// 1. Actualizar data/songs-index.json
const indexPath = 'data/songs-index.json';
const songsIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

let indexMap = {};
songsIndex.forEach(s => {
  s.title = formatTitle(s.title);
  indexMap[s.id] = s.title;
});

fs.writeFileSync(indexPath, JSON.stringify(songsIndex, null, 2), 'utf8');
console.log(`\n¡Éxito! Se actualizaron los títulos en ${indexPath}`);

// 2. Actualizar src/songs-data.js
const songsDataPath = 'src/songs-data.js';
let songsDataContent = fs.readFileSync(songsDataPath, 'utf8');

// Reemplazar los valores de title: "..." en src/songs-data.js
songsDataContent = songsDataContent.replace(/title:\s*"([^"]+)"/g, (match, oldTitle) => {
  const newTitle = formatTitle(oldTitle);
  return `title: "${newTitle}"`;
});

fs.writeFileSync(songsDataPath, songsDataContent, 'utf8');
console.log(`¡Éxito! Se actualizaron los títulos en ${songsDataPath}`);
