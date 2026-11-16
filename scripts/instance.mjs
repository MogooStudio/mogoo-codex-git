import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageInfo = JSON.parse(await readFile(path.join(projectDir, 'package.json'), 'utf8'));
export const instanceId = createHash('sha256').update(`${projectDir.toLowerCase()}@${packageInfo.version}`).digest('hex').slice(0, 16);
