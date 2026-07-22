/*!
 * Copyright (c) 2026 Stefan Keim
 * MIT License — see LICENSE file for details
 */
addProtocol("merge", async (params, abortController) => {
  const urls = params.url.replace("merge://", "").split("|");
  const tiles = await Promise.all(urls.map(async (url) => {
    const resp = await makeRequest({ ...params, url }, abortController);
    return tile.read(new Pbf(resp.data));
  }));
  const [base, ...attrTiles] = tiles;
  const baseLayersByName = new Map(base.layers.map((l) => [l.name, l]));
  const attrLayersByName = /* @__PURE__ */ new Map();
  for (const attr of attrTiles) {
    for (const al of attr.layers) {
      if (!attrLayersByName.has(al.name)) attrLayersByName.set(al.name, []);
      attrLayersByName.get(al.name).push(al);
    }
  }
  for (const [name, alList] of attrLayersByName) {
    const bl = baseLayersByName.get(name);
    if (!bl) throw new Error(`Layer "${name}" not found in base tile`);
    const blHasIds = bl.features.some((f) => f.id);
    let blFeaturesById = null;
    for (const al of alList) {
      const keyOffset = bl.keys.length;
      let valueOffset = 0;
      if (keyOffset === 0) {
        bl.keys = al.keys;
        bl.values = al.values;
      } else {
        valueOffset = bl.values.length;
        for (let j = 0; j < al.keys.length; j++) bl.keys.push(al.keys[j]);
        for (let j = 0; j < al.values.length; j++) bl.values.push(al.values[j]);
      }
      if (blHasIds && al.features.some((f) => f.id)) {
        if (!blFeaturesById) {
          blFeaturesById = /* @__PURE__ */ new Map();
          for (const f of bl.features) blFeaturesById.set(f.id, f);
        }
        for (const alFeature of al.features) {
          const blFeature = blFeaturesById.get(alFeature.id);
          if (!blFeature) {
            continue;
          }
          if (keyOffset === 0) {
            blFeature.tags = alFeature.tags;
          } else {
            const tags = blFeature.tags, alTags = alFeature.tags;
            for (let k = 0; k < alTags.length; k += 2) tags.push(alTags[k] + keyOffset, alTags[k + 1] + valueOffset);
          }
        }
      } else {
        if (bl.features.length !== al.features.length) {
          throw new Error(`No feature ids present and count mismatch in layer "${al.name}"`);
        }
        for (let j = 0; j < bl.features.length; j++) {
          const blFeature = bl.features[j], alFeature = al.features[j];
          if (keyOffset === 0) {
            blFeature.tags = alFeature.tags;
          } else {
            const tags = blFeature.tags, alTags = alFeature.tags;
            for (let k = 0; k < alTags.length; k += 2) tags.push(alTags[k] + keyOffset, alTags[k + 1] + valueOffset);
          }
        }
      }
    }
  }
  const pbf = new Pbf();
  tile.write(base, pbf);
  const data = pbf.finish();
  return { data };
});
const shMod = self.sharedModule;
let Pbf = shMod.Pbf;
let makeRequest = shMod.makeRequest;
if (!Pbf || !makeRequest) {
  const Pbf_marker = "ArrayBuffer.isView";
  const makeRequest_marker = 'getResponseHeader("Content-Type")';
  for (const key in shMod) {
    const item = shMod[key];
    if (typeof item === "function") {
      const str = item.toString();
      if (!Pbf && str.includes(Pbf_marker)) {
        Pbf = typeof new item() === "function" ? new item() : item;
        if (makeRequest) break;
      }
      if (!makeRequest && str.includes(makeRequest_marker)) {
        makeRequest = item;
        if (Pbf) break;
      }
    }
  }
  if (!Pbf || !makeRequest) {
    throw new Error("Unable to find sharedModules");
  }
}
const tile = {
  read(pbf, end) {
    return pbf.readFields((tag, obj, pbf2) => {
      if (tag === 3) obj.layers.push(tile.readL(pbf2, pbf2.readVarint() + pbf2.pos));
    }, { layers: [] }, end);
  },
  write(obj, pbf) {
    if (obj.layers) for (let i = 0; i < obj.layers.length; i++) pbf.writeMessage(3, tile.writeL, obj.layers[i]);
  },
  // value
  readV(pbf, end) {
    return pbf.readFields((tag, obj, pbf2) => {
      if (tag === 1) obj.string = pbf2.readString();
      else if (tag === 2) obj.float = pbf2.readFloat();
      else if (tag === 3) obj.double = pbf2.readDouble();
      else if (tag === 4) obj.int = pbf2.readVarint(true);
      else if (tag === 5) obj.uint = pbf2.readVarint();
      else if (tag === 6) obj.sint = pbf2.readSVarint();
      else if (tag === 7) obj.bool = pbf2.readBoolean();
    }, {}, end);
  },
  writeV(obj, pbf) {
    if (obj.string !== void 0) pbf.writeStringField(1, obj.string);
    else if (obj.float !== void 0) pbf.writeFloatField(2, obj.float);
    else if (obj.double !== void 0) pbf.writeDoubleField(3, obj.double);
    else if (obj.int !== void 0) pbf.writeVarintField(4, obj.int);
    else if (obj.uint !== void 0) pbf.writeVarintField(5, obj.uint);
    else if (obj.sint !== void 0) pbf.writeSVarintField(6, obj.sint);
    else if (obj.bool !== void 0) pbf.writeBooleanField(7, obj.bool);
  },
  // feature
  readF(pbf, end) {
    return pbf.readFields((tag, obj, pbf2) => {
      if (tag === 1) obj.id = pbf2.readVarint();
      else if (tag === 2) {
        pbf2.readPackedVarint(obj.tags);
        obj.tags.length % 2 && obj.tags.unshift(0);
      } else if (tag === 3) obj.type = pbf2.readVarint();
      else if (tag === 4) pbf2.readPackedVarint(obj.geometry);
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
    return pbf.readFields((tag, obj, pbf2) => {
      if (tag === 2) obj.features.push(tile.readF(pbf2, pbf2.readVarint() + pbf2.pos));
      else if (tag === 3) obj.keys.push(pbf2.readString());
      else if (tag === 4) obj.values.push(tile.readV(pbf2, pbf2.readVarint() + pbf2.pos));
      else if (tag === 1) obj.name = pbf2.readString();
      else if (tag === 5) obj.extent = pbf2.readVarint();
      else if (tag === 15) obj.version = pbf2.readVarint();
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
