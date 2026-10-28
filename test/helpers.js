import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

export const fixtureText = (name) => readFileSync(path.join(DIR, name), 'utf8').replace(/^﻿/, '');
export const fixture = (name) => JSON.parse(fixtureText(name));
