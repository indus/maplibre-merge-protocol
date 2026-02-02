/*!
 * Copyright (c) 2026 Stefan Keim
 * MIT License — see LICENSE file for details
 */

addProtocol('merge', async (params, abortController) => {

    const urls = params.url.replace('merge://', '').split('|');

    const tiles = await Promise.all(
        urls.map(async (url) => {
            const resp = await makeRequest({ ...params, url }, abortController);
            return tile.read(new Pbf(resp.data));
        })
    );

    console.time(params.url);

    const [geom, ...attrTiles] = tiles; // geom at index 0, all others are attr

    for (const attr of attrTiles) {
        if (geom.layers.length !== attr.layers.length) {
            throw new Error('Layer count mismatch');
        }

        for (let i = 0; i < geom.layers.length; i++) {
            const bl = geom.layers[i];
            const al = attr.layers[i];

            if (bl.features.length !== al.features.length) {
                throw new Error(`Feature count mismatch in layer ${i}`);
            }

            // Keep track of key/value offset
            const keyOffset = bl.keys.length;
            if (keyOffset == 0) {
                bl.keys = al.keys;
                bl.values = al.values;
                for (let j = 0; j < bl.features.length; j++) {
                    bl.features[j].tags = al.features[j].tags;
                }
            } else {
                const valueOffset = bl.values.length;

                for (let j = 0; j < al.keys.length; j++) bl.keys.push(al.keys[j]);
                for (let j = 0; j < al.values.length; j++) bl.values.push(al.values[j]);

                for (let j = 0; j < bl.features.length; j++) {
                    const tags = bl.features[j].tags;
                    const alTags = al.features[j].tags;

                    for (let k = 0; k < alTags.length; k += 2) {
                        tags.push(alTags[k] + keyOffset, alTags[k + 1] + valueOffset);
                    }
                }
            }
        }
    }

    const pbf = new Pbf();
    tile.write(geom, pbf);
    const data = pbf.finish()

    console.timeEnd(params.url);

    return { data };
});


let Pbf = self.sharedModule.Pbf;
let makeRequest = self.sharedModule.makeRequest;

// Locate utility functions in `sharedModules` in the minified build,
// since MapLibre is built with Rollup’s `minifyInternalExports` enabled.
// The markers have been tested for MapLibre minor versions v4.0–v5.17.

if (!Pbf || !makeRequest) {
    const sharedModule = self.sharedModule;

    const Pbf_marker = 'ArrayBuffer.isView'
    const makeRequest_marker = 'getResponseHeader("Content-Type")'

    for (const key in sharedModule) {
        const item = sharedModule[key];

        if (typeof item === 'function') {
            const str = item.toString();

            if (!Pbf && str.includes(Pbf_marker)) {
                // fix for MapLibre minor versions v5.0–v5.3
                Pbf = typeof new item === "function" ? new item : item
                if (makeRequest) break;
            }

            if (!makeRequest && str.includes(makeRequest_marker)) {
                makeRequest = item;
                if (Pbf) break;
            }
        }
    }

    if (!Pbf || !makeRequest) {
        throw new Error('Unable to find sharedModules');
    }
}

const tile = {
    read(pbf, end) {
        return pbf.readFields((tag, obj, pbf) => {
            if (tag === 3) obj.layers.push(tile.readL(pbf, pbf.readVarint() + pbf.pos));
        }, { layers: [] }, end);
    },
    write(obj, pbf) {
        if (obj.layers) for (let i = 0; i < obj.layers.length; i++) pbf.writeMessage(3, tile.writeL, obj.layers[i]);
    },

    // value
    readV(pbf, end) {
        return pbf.readFields((tag, obj, pbf) => {
            if (tag === 1) obj.string = pbf.readString();
            else if (tag === 2) obj.float = pbf.readFloat();
            else if (tag === 3) obj.double = pbf.readDouble();
            else if (tag === 4) obj.int = pbf.readVarint(true);
            else if (tag === 5) obj.uint = pbf.readVarint();
            else if (tag === 6) obj.sint = pbf.readSVarint();
            else if (tag === 7) obj.bool = pbf.readBoolean();
        }, {}, end);
    },
    writeV(obj, pbf) {
        if (obj.string !== undefined) pbf.writeStringField(1, obj.string);
        else if (obj.float !== undefined) pbf.writeFloatField(2, obj.float);
        else if (obj.double !== undefined) pbf.writeDoubleField(3, obj.double);
        else if (obj.int !== undefined) pbf.writeVarintField(4, obj.int);
        else if (obj.uint !== undefined) pbf.writeVarintField(5, obj.uint);
        else if (obj.sint !== undefined) pbf.writeSVarintField(6, obj.sint);
        else if (obj.bool !== undefined) pbf.writeBooleanField(7, obj.bool);
    },

    // feature
    readF(pbf, end) {
        return pbf.readFields((tag, obj, pbf) => {
            if (tag === 1) obj.id = pbf.readVarint();
            else if (tag === 2) pbf.readPackedVarint(obj.tags);
            else if (tag === 3) obj.type = pbf.readVarint();
            else if (tag === 4) pbf.readPackedVarint(obj.geometry);
        }, { id: 0, tags: [], type: 0, geometry: [] }, end);
    },
    writeF(obj, pbf) {
        if (obj.id) pbf.writeVarintField(1, obj.id);
        if (obj.tags) pbf.writePackedVarint(2, obj.tags);
        if (obj.type) pbf.writeVarintField(3, obj.type);
        if (obj.geometry) pbf.writePackedVarint(4, obj.geometry);
    },

    // layer
    readL(pbf, end) {
        return pbf.readFields((tag, obj, pbf) => {
            if (tag === 2) obj.features.push(tile.readF(pbf, pbf.readVarint() + pbf.pos));
            else if (tag === 3) obj.keys.push(pbf.readString());
            else if (tag === 4) obj.values.push(tile.readV(pbf, pbf.readVarint() + pbf.pos));
            else if (tag === 1) obj.name = pbf.readString();
            else if (tag === 5) obj.extent = pbf.readVarint();
            else if (tag === 15) obj.version = pbf.readVarint();
        }, { version: 0, name: "", features: [], keys: [], values: [], extent: 0 }, end);
    },
    writeL(obj, pbf) {
        if (obj.version) pbf.writeVarintField(15, obj.version);
        if (obj.name) pbf.writeStringField(1, obj.name);
        if (obj.features) for (let i = 0; i < obj.features.length; i++) pbf.writeMessage(2, tile.writeF, obj.features[i]);
        if (obj.keys) for (let i = 0; i < obj.keys.length; i++) pbf.writeStringField(3, obj.keys[i]);
        if (obj.values) for (let i = 0; i < obj.values.length; i++) pbf.writeMessage(4, tile.writeV, obj.values[i]);
        if (obj.extent) pbf.writeVarintField(5, obj.extent);
    }
};