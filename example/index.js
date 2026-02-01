/**
 * Copyright (c) 2026 Stefan Keim
 * MIT License — see LICENSE file for details
 */

import fs from 'fs';
import path from 'path';
import { globSync } from 'node:fs';
import splitTile from './vt-splitter.js';

const inputDir = path.resolve('./example/data/vg250_GEM');
const outputDir = path.resolve('./docs/data/vg250_GEM_split');

const splits = [
    { geom: true, attr: false, suffix: '_geom' },               // geometry-only
    { geom: false, attr: ['ARS'], suffix: '_ARS' },             // ARS attributes only
    { geom: false, attr: ['EWZ', 'KFL'], suffix: '_EWZ_KFL' }   // EWZ/KFL attributes only
// ,{ geometry: true, attrs: ['ARS'], suffix: '_geom_ARS' }     // combined geometry + ARS
];

console.time('split');

const files = globSync(`${inputDir}/**/*.pbf`);

for (const inputPath of files) {
    const base = path.basename(inputPath, '.pbf');
    const relDir = path.dirname(path.relative(inputDir, inputPath));
    const outDir = path.join(outputDir, relDir);
    fs.mkdirSync(outDir, { recursive: true });

    const buffer = fs.readFileSync(inputPath);
    const outputs = splitTile(buffer, splits);

    for (const output of outputs) {
        fs.writeFileSync(path.join(outDir, `${base}${output.meta.suffix}.pbf`), output.data);
    }
}

console.timeEnd('split');