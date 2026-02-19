/**
 * Copyright (c) 2026 Stefan Keim
 * MIT License — see LICENSE file for details
 */

import Pbf from 'pbf';

export default function splitTile(buffer, splits = [
    { geom: true, attr: false, suffix: '_geom' },
    { geom: false, attr: true, suffix: '_attr' }
]) {
    const vt = tile.read(new Pbf(buffer));
    const results = [];

    for (const split of splits) {
        let attr = split.attr;

        // Normalize attr
        if (!attr || (Array.isArray(attr) && attr.length === 0)) {
            attr = false;
        } else if (attr === '*') {
            attr = true;
        } else if (typeof attr === 'string') {
            attr = [attr];
        }

        const vt_ = Array.isArray(attr) ? filterAttrs(vt, attr) : vt;
        const writeGeom = split.geom;
        const writeAttr = attr !== false;

        const pbf = new Pbf();
        tile.write(vt_, pbf, writeGeom, writeAttr);

        results.push({
            data: Buffer.from(pbf.finish()),
            meta: split
        });
    }

    return results;
}

export function filterAttrs(vt, keepAttrs) {
    const keep = new Set(keepAttrs);
    const result = { layers: [] };

    for (const layer of vt.layers) {
        const { features, keys, values, version, name, extent } = layer;

        if (!features?.length) {
            result.layers.push({ version, name, extent, keys: [], values: [], features: [] });
            continue;
        }

        if (!keys.some(k => keep.has(k))) continue;

        const newKeys = [];
        const newValues = [];
        const keyMap = new Array(keys.length);
        const valMap = new Array(values.length);
        const newFeatures = new Array(features.length);

        for (let i = 0; i < features.length; i++) {
            const feat = features[i];
            const newTags = [];

            for (let j = 0; j < feat.tags.length; j += 2) {
                const oldKeyIdx = feat.tags[j];
                const oldValIdx = feat.tags[j + 1];
                const keyName = keys[oldKeyIdx];

                if (!keep.has(keyName)) continue;

                let newKeyIdx = keyMap[oldKeyIdx];
                if (newKeyIdx === undefined) {
                    newKeyIdx = newKeys.length;
                    keyMap[oldKeyIdx] = newKeyIdx;
                    newKeys.push(keyName);
                }

                let newValIdx = valMap[oldValIdx];
                if (newValIdx === undefined) {
                    newValIdx = newValues.length;
                    valMap[oldValIdx] = newValIdx;
                    newValues.push(values[oldValIdx]);
                }

                newTags.push(newKeyIdx, newValIdx);
            }

            newFeatures[i] = {
                id: feat.id,
                type: feat.type,
                geometry: feat.geometry,
                tags: newTags
            };
        }

        result.layers.push({
            version,
            name,
            extent,
            keys: newKeys,
            values: newValues,
            features: newFeatures
        });
    }

    return result;
}


export const tile = {
    read(pbf, end) {
        return pbf.readFields((tag, obj, pbf) => {
            if (tag === 3) obj.layers.push(tile.layer.read(pbf, pbf.readVarint() + pbf.pos));
        }, { layers: [] }, end);
    },

    write(obj, pbf, geom = true, attr = true) {
        if (!obj.layers) return;
        for (let i = 0; i < obj.layers.length; i++) {
            pbf.writeMessage(3, (layerObj, layerPbf) => tile.layer.write(layerObj, layerPbf, geom, attr), obj.layers[i]);
        }
    },

    value: {
        read(pbf, end) {
            return pbf.readFields((tag, obj, pbf) => {
                if (tag === 1) obj.string_value = pbf.readString();
                else if (tag === 2) obj.float_value = pbf.readFloat();
                else if (tag === 3) obj.double_value = pbf.readDouble();
                else if (tag === 4) obj.int_value = pbf.readVarint(true);
                else if (tag === 5) obj.uint_value = pbf.readVarint();
                else if (tag === 6) obj.sint_value = pbf.readSVarint();
                else if (tag === 7) obj.bool_value = pbf.readBoolean();
            }, {}, end);
        },

        write(obj, pbf) {
            if (obj.string_value !== undefined) pbf.writeStringField(1, obj.string_value);
            else if (obj.float_value !== undefined) pbf.writeFloatField(2, obj.float_value);
            else if (obj.double_value !== undefined) pbf.writeDoubleField(3, obj.double_value);
            else if (obj.int_value !== undefined) pbf.writeVarintField(4, obj.int_value);
            else if (obj.uint_value !== undefined) pbf.writeVarintField(5, obj.uint_value);
            else if (obj.sint_value !== undefined) pbf.writeSVarintField(6, obj.sint_value);
            else if (obj.bool_value !== undefined) pbf.writeBooleanField(7, obj.bool_value);
        }
    },

    feature: {
        read(pbf, end) {
            return pbf.readFields((tag, obj, pbf) => {
                if (tag === 1) obj.id = pbf.readVarint();
                else if (tag === 2) pbf.readPackedVarint(obj.tags);
                else if (tag === 3) obj.type = pbf.readVarint();
                else if (tag === 4) pbf.readPackedVarint(obj.geometry);
            }, { id: 0, tags: [], type: 0, geometry: [] }, end);
        },

        write(obj, pbf, geom = true, attr = true) {
            if (geom) {
                if (obj.id) pbf.writeVarintField(1, obj.id);
                if (obj.type) pbf.writeVarintField(3, obj.type);
                if (obj.geometry) pbf.writePackedVarint(4, obj.geometry);
            }
            if (attr) {
                if (obj.tags) pbf.writePackedVarint(2, obj.tags[0] === 0 ? obj.tags.slice(1) : obj.tags);
            }
        }
    },

    layer: {
        read(pbf, end) {
            return pbf.readFields((tag, obj, pbf) => {
                if (tag === 2) obj.features.push(tile.feature.read(pbf, pbf.readVarint() + pbf.pos));
                else if (tag === 3) obj.keys.push(pbf.readString());
                else if (tag === 4) obj.values.push(tile.value.read(pbf, pbf.readVarint() + pbf.pos));
                else if (tag === 1) obj.name = pbf.readString();
                else if (tag === 5) obj.extent = pbf.readVarint();
                else if (tag === 15) obj.version = pbf.readVarint();
            }, { version: 0, name: "", features: [], keys: [], values: [], extent: 0 }, end);
        },

        write(obj, pbf, geom = true, attr = true) {
            if (geom) {
                if (obj.name) pbf.writeStringField(1, obj.name);
                if (obj.extent) pbf.writeVarintField(5, obj.extent);
                if (obj.version) pbf.writeVarintField(15, obj.version);
            }
            if (attr) {
                if (obj.keys) for (let i = 0; i < obj.keys.length; i++) pbf.writeStringField(3, obj.keys[i]);
                if (obj.values) for (let i = 0; i < obj.values.length; i++) pbf.writeMessage(4, tile.value.write, obj.values[i]);
            }
            if (obj.features) {
                for (let i = 0; i < obj.features.length; i++) {
                    pbf.writeMessage(2, (featureObj, featurePbf) => tile.feature.write(featureObj, featurePbf, geom, attr), obj.features[i]);
                }
            }
        }
    }
};