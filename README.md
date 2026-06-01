# Mi Peso · PWA de seguimiento

PWA responsive para iPhone/iOS y escritorio que permite registrar el peso, definir un objetivo, ver una gráfica de evolución y exportar/importar datos. La información se guarda en `localStorage`, así que no necesita backend.

## Funciones

- Registro de peso por fecha con nota opcional.
- Resumen de peso actual, cambio total, tendencia y distancia al objetivo.
- Gráfica SVG sin dependencias externas.
- Exportación a CSV y JSON, e importación desde JSON.
- PWA instalable con `manifest`, iconos, `apple-touch-icon` y service worker offline.
- Lista para desplegar en Vercel desde GitHub.

## Desarrollo local

```bash
npm install
npm run dev
```

Abre la URL que muestre Vite. Para probar la instalación PWA real, usa HTTPS en producción o `localhost`.

## Build

```bash
npm run build
npm run preview
```

El resultado queda en `dist/`.

## Subir a GitHub

```bash
git init
git add .
git commit -m "Crear PWA de seguimiento de peso"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git push -u origin main
```

## Publicar en GitHub Pages

Este proyecto está preparado para GitHub Pages con una acción automática. Después de subirlo a GitHub:

1. En el repositorio, ve a `Settings` → `Pages`.
2. En `Build and deployment`, elige `Source: GitHub Actions`.
3. Haz un `push` a `main`.
4. GitHub ejecutará el workflow `Deploy to GitHub Pages` y publicará la carpeta `dist`.

Si Pages sirve la rama directamente en vez de usar GitHub Actions, pueden fallar los estilos porque la app necesita el build de Vite.

## Desplegar en Vercel

1. Entra en [Vercel](https://vercel.com/) e importa el repositorio de GitHub.
2. Vercel detectará Vite automáticamente.
3. Usa:
   - Build command: `npm run build`
   - Output directory: `dist`
4. Despliega y abre la URL HTTPS en Safari.
5. En iPhone: compartir → “Añadir a pantalla de inicio”.
