// Writes src/styles/glass-roles.css from the built-in glass roles (src/components/glass-roles.js), so the roles work
// in CSS alone. Run it after changing BUILTIN_ROLES: npm run build:glass-roles.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { builtinGlassRolesCSS } from '../src/components/glass-roles.js';

const out = fileURLToPath(new URL('../src/styles/glass-roles.css', import.meta.url));
writeFileSync(out, builtinGlassRolesCSS());
console.log('wrote', out);
