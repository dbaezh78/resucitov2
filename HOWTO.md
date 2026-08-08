# Manual de Uso y Desarrollo: RESUCITÓ v2.0

Esta es la nueva versión optimizada y rediseñada de **Resucito**, construida en formato de **Single Page Application (SPA)** con soporte completo offline (**PWA**) y carga perezosa (lazy-loading) de cantos.

---

## 🚀 Cómo ejecutar localmente

1. Abre tu terminal en este directorio (`c:\db\Github\resucitov2`).
2. Instala las dependencias de desarrollo ejecutando:
   ```bash
   npm install
   ```
3. Inicia el servidor de desarrollo rápido de Vite:
   ```bash
   npm run dev
   ```
4. Abre el enlace proporcionado en tu navegador (típicamente `http://localhost:5173`).

---

## 📂 Estructura del Proyecto

* **`compile_data.cjs`**: Script en Node.js que extrae los cantos desde el repositorio original en `C:\db\Github\resucito`, unifica todas las bases de datos y genera archivos JSON individuales por canción y un índice ligero para la búsqueda.
* **`index.html`**: Estructura principal y única de la aplicación.
* **`public/`**: Contiene recursos estáticos como imágenes y el service worker.
  * **`public/data/`**: Base de datos en JSON autogenerada (índices y detalles de canciones).
  * **`public/ima/`**: Prontuario con diagramas de acordes.
  * **`public/sw.js`**: Service Worker responsable de almacenar en caché los archivos para el funcionamiento offline.
* **`src/`**: Código lógico de la aplicación.
  * **`src/style.css`**: Hoja de estilos con diseño responsive en Glassmorphism.
  * **`src/main.js`**: Controlador lógico central de la SPA.
  * **`src/search.js`**: Algoritmo de búsqueda flexible de David.
  * **`src/chords.js`**: Módulo matemático de acordes y cejilla.
  * **`src/pwa.js`**: Registro de PWA.

---

## 🛠️ Cómo añadir o modificar cantos

### Opción A: Modificar en el origen y recompilar (Recomendado)
Si quieres realizar cambios permanentes o añadir un canto, puedes hacerlo en los archivos `.js` de la base de datos original (`C:\db\Github\resucito\src\data\canto_data.js` o similares) y luego recompilar ejecutando:
```bash
node compile_data.cjs
```
El script leerá automáticamente los archivos originales, generará los JSONs individuales necesarios en `public/data/songs/` y actualizará el índice ligero de búsquedas.

### Opción B: Modificar directamente en el JSON
Puedes buscar la canción en la ruta `public/data/songs/<id_canto>.json` y editar su letra, acordes o configuración directamente. Nota: Si añades un canto nuevo de esta forma, deberás registrarlo manualmente en `public/data/songs-index.json` para que aparezca en el buscador.

---

## 🎸 Funcionalidades Destacadas

### 1. Transposición Inteligente
Usa los botones `+` y `-` en la barra del visor. Al hacerlo:
- El tono cambia de medio en medio tono cromático.
- La aplicación recalcula matemáticamente cada acorde en pantalla al instante sin recargar.

### 2. Cálculo de Cejilla Dinámica (Capo)
Si seleccionas un traste de cejilla diferente al original desde el modal de ajustes:
- La guitarra calculará los acordes visuales (digitación) necesarios para mantener el mismo tono acústico real.
- Todo el cálculo se realiza usando aritmética modular sobre la escala cromática de 12 semitonos.

### 3. Buscador Elástico de David
El buscador es extremadamente elástico y rápido:
- Ignora acentos ("Víctima" -> "victima").
- Ignora puntuaciones o símbolos especiales.
- Permite búsquedas con palabras pegadas o separadas (ej: "quienesestaquesube" coincide con "Quién es esta que sube").

### 4. Soporte Offline Completo
La primera vez que abres la aplicación, el Service Worker descarga todo el núcleo. Al buscar y abrir canciones, éstas se guardan en la caché del navegador. Si te quedas sin conexión (por ejemplo, dentro de una iglesia), la app cargará instantáneamente y podrás ver cualquier canto cargado previamente de forma local.
