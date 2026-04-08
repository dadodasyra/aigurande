# AI Agent Instructions for Aigurande Cadastre

## Big Picture Architecture
This is a mobile-first, offline-capable mapping application. 
- **Frontend**: Vanilla HTML/JS/CSS using Leaflet.js. There are no build steps or frontend frameworks (No React/Vue/Webpack). Global state and map initialization live in `public/app.js`. Domain logic is split into `public/drawing.js` (network lines and points of interest/lieux-dits), `public/notes.js` (parcel notes), and `public/auth.js`.
- **Backend**: A single-file Express.js monolith (`server.js`) connected to a local SQLite database (`database.sqlite`). 
- **Data Flow**: Base parcel geometry is loaded statically on the client from `/assets/merged_crozon_aigurande.json`. User-generated content (notes, lines, lieux-dits) routes through JSON fetches to `/api/*` endpoints.

## Core Patterns & Conventions

### Offline-First Resilience
Many features (notes, line drawing) implement offline caching. When network requests fail or `navigator.onLine` is false, data is pushed to `localStorage` (e.g., `offlineLinesQueue`, `offlineNotesQueue`). It automatically syncs back to the server when the `window.addEventListener('online')` event triggers. When building new entities, remember to implement this fallback.

### Global Scope for Modules
Since there is no bundler, cross-file functions are attached directly to the global window object (e.g., `window.undoDrawPoint = function() {...}`) so they can be called from `index.html` inline handlers.

### Custom Modals & Event Cleanup
Avoid using native `alert()` or `prompt()`. Use `window.customConfirm`, `window.customPrompt`, or `window.customLieuPrompt` (defined in `app.js`). These custom modal functions recreate their action buttons on the fly using `oldBtn.cloneNode(true)` to safely strip legacy event listeners before appending new callbacks.

### Leaflet Hitboxes
When rendering drawn lines, always group a visible thin polyline with an invisible thick polyline (`weight: 20, opacity: 0`, `weight: 25` for mobile) in a `L.featureGroup()`. This pattern drastically improves touchscreen tap detection for editing/deleting traces (see `drawing.js` -> `window.renderLineLocally`).

### Timezones
Always force the `Europe/Paris` timezone when parsing and displaying dates on the client side using the shared `formatTime()` function in `app.js`.

## Critical Developer Workflows
- **Database Modding**: `server.js` uses `.serialize()` and runs `CREATE TABLE IF NOT EXISTS` on boot. If altering existing schemas, you must use `ALTER TABLE` inside a safe callback (as seen with `public_notes.user_id` and `lieux_dits.icon`), since SQLite `ALTER` support is limited.
- **Running & Testing**: Start the server with `npm start` (or `node server.js`). There is no hot-reloading for the backend unless `nodemon` is used manually. Frontend changes only require a hard browser refresh.

