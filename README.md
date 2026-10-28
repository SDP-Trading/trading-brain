# Trading Brain

Aplicación de escritorio (Electron + React + TypeScript) tipo Obsidian para construir un **segundo cerebro de trading**. Pegas todo lo que tienes sobre un modelo y la IA lo organiza en notas Markdown atómicas y enlazadas.

El vault es una carpeta normal de `.md` con frontmatter YAML y `[[wikilinks]]`: puedes abrirla también con Obsidian.

## Uso

```bash
npm install
npm run dev        # desarrollo con recarga
npm run build      # compila a out/
npm start          # ejecuta la versión compilada
npm run typecheck
```

> Si lanzas desde una terminal integrada de VS Code y la app arranca como Node, ejecuta `unset ELECTRON_RUN_AS_NODE` antes.

## Funciones

- **Vault**: árbol de archivos, búsqueda, crear/renombrar (actualiza enlaces)/borrar (a `.trash`), recarga automática si editas fuera de la app.
- **Editor**: CodeMirror con Markdown, autocompletado de `[[`, ⌘+clic para seguir enlaces, autoguardado. Modo lectura con propiedades, tablas y checklists.
- **Importar con IA** (⌘I): texto pegado o archivos (`.md`, `.txt`, `.csv`, `.json`, `.pine`, `.srt`…) → notas tipadas → vista previa editable → guardado. Crea o actualiza la nota MOC del modelo, añade las preguntas abiertas que detecta y guarda el texto original en `_Sources/`.
- **Grafo** (⌘G): notas coloreadas por tipo, foco en vecinos al pasar el ratón, clic para abrir.
- **Mind map**: árbol radial desde la nota principal del modelo, por enlaces (1-4 niveles) o por carpetas. Clic abre la nota, doble clic la convierte en el centro.
- **Decision flow**: la IA convierte el modelo en su diagrama de decisión (contexto → bias → setup → entrada → stop → gestión, con las salidas de "no trade") y lo guarda como `.canvas` en `Flows/`. Sin IA en la app, se lo pides a Claude/ChatGPT por MCP (`create_flow_canvas`).
- **Model health**: auditoría hecha por IA (la de la app o Claude/ChatGPT vía MCP con `save_model_health`): identifica los setups y puntúa contexto, entrada, stop, objetivo, invalidación, riesgo y ejemplos, con mejoras prioritarias y contradicciones. Se guarda en `.trading-brain/health.json`.
- **Canvas**: editor de archivos `.canvas` de Obsidian (JSON Canvas): tarjetas de texto con Markdown y wikilinks, tarjetas de nota, enlaces, grupos, flechas con color y etiqueta. Se guarda en el mismo formato.
- **Chat**: preguntas sobre tu modelo usando el vault como contexto (entero si cabe; si no, las notas más relevantes), con citas `[[...]]` clicables y "Guardar como nota".
- **Interfaz**: componentes [shadcn/ui](https://ui.shadcn.com) (Tailwind v4 + Radix) en `src/renderer/src/components/ui/`. Tema Light / Dark / System (sigue el modo de macOS), desde el icono junto a Ajustes o en Ajustes.
- **Ajustes** (⌘,): proveedor Claude / OpenAI / Ollama, modelo, API keys cifradas con el llavero del sistema (`safeStorage`), esfuerzo de razonamiento y tamaño de contexto.

## Usar con Claude y ChatGPT (MCP)

Trading Brain incluye un servidor MCP (`src/mcp/server.ts` → `out/main/mcp.js`) para que Claude Desktop, Claude Code o la app de escritorio de ChatGPT / Codex lean y escriban el vault con la suscripción del usuario, sin API key. Se conecta desde **Settings → Use with Claude & ChatGPT**:

- **Claude Desktop**: botón *Connect*. Añade `trading-brain` a `claude_desktop_config.json` (conserva el resto y guarda una copia `.bak`). Hay que reiniciar Claude Desktop.
- **Claude Code**: copia el comando `claude mcp add …` y ejecútalo una vez.
- **ChatGPT desktop / Codex**: botón *Connect*. Añade `[mcp_servers.trading-brain]` a `~/.codex/config.toml` (editado como texto para conservar comentarios; copia `.bak`). También hay un comando `codex mcp add …`. Solo la app de escritorio, no chatgpt.com; los conectores propios requieren Plus o Pro.

El servidor se ejecuta con el propio binario de la app (`ELECTRON_RUN_AS_NODE=1`), así que no hace falta Node. Trabaja sobre el vault abierto en la app (lee sus ajustes en cada llamada).

Herramientas: `get_model_overview`, `search_notes`, `read_note`, `list_notes`, `list_vaults`, `create_note`, `update_note`, `get_model_health`, `save_model_health`, `create_flow_canvas`. Prompt: `ask_my_model`.

## Taxonomía

La interfaz está en inglés. La IA escribe las notas en el idioma del material que importas.

| Tipo (`type:`) | Carpeta |
|---|---|
| model (MOC) | `00 Models` |
| concept | `01 Concepts` |
| setup | `02 Setups` |
| rule | `03 Rules` |
| risk | `04 Risk Management` |
| psychology | `05 Psychology` |
| market | `06 Markets & Sessions` |
| tool | `07 Indicators & Tools` |
| checklist | `08 Checklists` |
| example | `09 Examples & Trades` |
| glossary | `10 Glossary` |

Las fuentes originales van a `_Sources/`. Las notas con los tipos antiguos en español (`regla`, `riesgo`…) se siguen reconociendo.

Se define en [src/shared/types.ts](src/shared/types.ts) (`NOTE_TYPES`).

## Estructura

```
src/
  main/            proceso principal: vault (fs, índice, grafo), ajustes, IPC
    ai/providers.ts  Claude (SDK de Anthropic) y OpenAI/Ollama
    ai/organizer.ts  prompt, esquema JSON e importación
    ai/chat.ts       selección de contexto para el chat
  preload/         puente seguro (contextIsolation) → window.api
  renderer/        interfaz React
  shared/          tipos y utilidades de Markdown comunes
```

Con Claude, por defecto se usa `claude-opus-5-5` con salida estructurada (JSON Schema), streaming, caché de prompts para el contexto del vault y `fallbacks: "default"`, que reintenta en otro modelo si la petición se rechaza.
