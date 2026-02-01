/*!
 * Copyright (c) 2026 Stefan Keim
 * MIT License — see LICENSE file for details
 */
addProtocol("merge", async (params, abortController) => {
  const urls = params.url.replace("merge://", "").split("|");
  const tiles = await Promise.all(
    urls.map(async (url) => {
      const resp = await makeRequest({ ...params, url }, abortController);
      return tile.read(new Pbf(resp.data));
    })
  );
  const [geom, ...attrTiles] = tiles;
  for (const attr of attrTiles) {
    if (geom.layers.length !== attr.layers.length) {
      throw new Error("Layer count mismatch");
    }
    for (let i = 0; i < geom.layers.length; i++) {
      const bl = geom.layers[i];
      const al = attr.layers[i];
      if (bl.features.length !== al.features.length) {
        throw new Error(`Feature count mismatch in layer ${i}`);
      }
      const keyOffset = bl.keys.length;
      if (keyOffset == 0) {
        bl.keys = al.keys;
        bl.values = al.values;
        for (let j = 0; j < bl.features.length; j++) {
          bl.features[j].tags = al.features[j].tags;
        }
      } else {
        const valueOffset = bl.values.length;
        for (let i2 = 0; i2 < al.keys.length; i2++) bl.keys.push(al.keys[i2]);
        for (let i2 = 0; i2 < al.values.length; i2++) bl.values.push(al.values[i2]);
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
  const data = pbf.finish();
  return { data };
});
let Pbf = self.sharedModule.Pbf;
let makeRequest = self.sharedModule.makeRequest;
if (!Pbf || !makeRequest) {
  const sharedModule = self.sharedModule;
  const Pbf_marker = "Expected varint not more than 10 bytes";
  const makeRequest_marker = 'getResponseHeader("Content-Type")';
  for (const key in sharedModule) {
    const item = sharedModule[key];
    if (typeof item === "function") {
      const str = item.toString();
      if (!Pbf && str.includes(Pbf_marker)) {
        Pbf = item;
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
      if (tag === 3) obj.layers.push(tile.layer.read(pbf2, pbf2.readVarint() + pbf2.pos));
    }, { layers: [] }, end);
  },
  write(obj, pbf) {
    if (obj.layers) for (let i = 0; i < obj.layers.length; i++) pbf.writeMessage(3, tile.layer.write, obj.layers[i]);
  },
  value: {
    read(pbf, end) {
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
    write(obj, pbf) {
      if (obj.string !== void 0) pbf.writeStringField(1, obj.string);
      else if (obj.float !== void 0) pbf.writeFloatField(2, obj.float);
      else if (obj.double !== void 0) pbf.writeDoubleField(3, obj.double);
      else if (obj.int !== void 0) pbf.writeVarintField(4, obj.int);
      else if (obj.uint !== void 0) pbf.writeVarintField(5, obj.uint);
      else if (obj.sint !== void 0) pbf.writeSVarintField(6, obj.sint);
      else if (obj.bool !== void 0) pbf.writeBooleanField(7, obj.bool);
    }
  },
  feature: {
    read(pbf, end) {
      return pbf.readFields((tag, obj, pbf2) => {
        if (tag === 1) obj.id = pbf2.readVarint();
        else if (tag === 2) pbf2.readPackedVarint(obj.tags);
        else if (tag === 3) obj.type = pbf2.readVarint();
        else if (tag === 4) pbf2.readPackedVarint(obj.geometry);
      }, { id: 0, tags: [], type: 0, geometry: [] }, end);
    },
    write(obj, pbf) {
      if (obj.id) pbf.writeVarintField(1, obj.id);
      if (obj.tags) pbf.writePackedVarint(2, obj.tags);
      if (obj.type) pbf.writeVarintField(3, obj.type);
      if (obj.geometry) pbf.writePackedVarint(4, obj.geometry);
    }
  },
  layer: {
    read(pbf, end) {
      return pbf.readFields((tag, obj, pbf2) => {
        if (tag === 2) obj.features.push(tile.feature.read(pbf2, pbf2.readVarint() + pbf2.pos));
        else if (tag === 3) obj.keys.push(pbf2.readString());
        else if (tag === 4) obj.values.push(tile.value.read(pbf2, pbf2.readVarint() + pbf2.pos));
        else if (tag === 1) obj.name = pbf2.readString();
        else if (tag === 5) obj.extent = pbf2.readVarint();
        else if (tag === 15) obj.version = pbf2.readVarint();
      }, { version: 0, name: "", features: [], keys: [], values: [], extent: 0 }, end);
    },
    write(obj, pbf) {
      if (obj.version) pbf.writeVarintField(15, obj.version);
      if (obj.name) pbf.writeStringField(1, obj.name);
      if (obj.features) for (let i = 0; i < obj.features.length; i++) pbf.writeMessage(2, tile.feature.write, obj.features[i]);
      if (obj.keys) for (let i = 0; i < obj.keys.length; i++) pbf.writeStringField(3, obj.keys[i]);
      if (obj.values) for (let i = 0; i < obj.values.length; i++) pbf.writeMessage(4, tile.value.write, obj.values[i]);
      if (obj.extent) pbf.writeVarintField(5, obj.extent);
    }
  }
};
