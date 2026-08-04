const fs = require('fs');
const path = require('path');

function copyFolderRecursiveSync(source, target) {
    if (!fs.existsSync(source)) return;
    
    // Create target directory if it doesn't exist
    if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
    }
    
    // Read source directory
    const files = fs.readdirSync(source);
    files.forEach(file => {
        const curSource = path.join(source, file);
        const curTarget = path.join(target, file);
        
        if (fs.lstatSync(curSource).isDirectory()) {
            copyFolderRecursiveSync(curSource, curTarget);
        } else {
            fs.copyFileSync(curSource, curTarget);
        }
    });
}

const distPath = path.resolve(__dirname, 'dist');
if (!fs.existsSync(distPath)) {
    fs.mkdirSync(distPath, { recursive: true });
}

console.log('--- COPIANDO ACTIVOS A LA CARPETA DIST ---');

// Copy folders
const folders = ['data', 'ima', 'img'];
folders.forEach(folder => {
    const src = path.resolve(__dirname, folder);
    const dest = path.resolve(distPath, folder);
    if (fs.existsSync(src)) {
        console.log(`Copiando carpeta ${folder}...`);
        copyFolderRecursiveSync(src, dest);
    }
});

// Copy individual files
const files = ['manifest.json', 'sw.js'];
files.forEach(file => {
    const src = path.resolve(__dirname, file);
    const dest = path.resolve(distPath, file);
    if (fs.existsSync(src)) {
        console.log(`Copiando archivo ${file}...`);
        fs.copyFileSync(src, dest);
    }
});

console.log('--- ACTIVOS COPIADOS CORRECTAMENTE A DIST ---');
