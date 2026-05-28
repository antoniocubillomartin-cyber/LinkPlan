// Permite los imports de CSS global (p. ej. `import './globals.css'`)
// sin que el servidor de TypeScript marque el error 2882.
// El patrón más específico `*.module.css` de Next sigue teniendo prioridad.
declare module '*.css';
