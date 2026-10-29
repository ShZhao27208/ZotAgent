import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
export function runtimeBuildID(root = import.meta.dirname) {
  const hash = createHash('sha256');
  const walk = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a,b)=>a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith('.js')) hash.update(relative(root,file).replaceAll('\\','/') + '\0').update(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).update('\0');
    }
  };
  walk(root); return hash.digest('hex');
}
