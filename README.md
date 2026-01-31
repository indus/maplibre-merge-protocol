# maplibre-merge-protocol

A custom protocol for merging geometry with attributes from multiple tile sets in MapLibre.

## [DEMO](https://maplibre-merge-protocol.js.org)

The DEMO combines a **geometry** tileset with two **attribute** tilesets. One of them contains an administrative code, which is used to control opacity, while the other contains properties for population and area, which are combined to calculate and color the population density.

You may want to open the browser's developer tools to inspect the ***Network*** tab to see the individual tiles being loaded, or the ***Console*** tab to observe the durations for merging the tilesets.

## Using the `merge://` Protocol with MapLibre

For best performance, the protocol uses `self.addProtocol` in the **worker thread** and runs there.

To use the `maplibre-merge-protocol`, you need to import the script in the workers and define your vector tile source with the custom `merge://` protocol.


### Import the Worker Script

``` JS
  maplibregl.importScriptInWorkers(`./addMergeProtocol.js`);
```

Note: [`importScriptInWorkers`](https://maplibre.org/maplibre-gl-js/docs/API/functions/importScriptInWorkers/) is considered experimental and can break at any point.


### Using the merge protocol in a vector tile source

To merge Vector Tiles, start with the custom protocol `merge://`, then concatenate
the tile URLs using `|` as a separator.

  ``` JS
  "merge://http://geom.pbf|http://attr1.pbf|http://attr2.pbf"
  ```

The first tileset must contain geometry (and may also include attributes).   
All subsequent tilesets should contain attributes only; any geometry is ignored.

Example:
``` JS
const style = {
  sources: {
    merged_tiles: {
      type: "vector",
      tiles:
        ["merge://" +
          [
           'https://tiles/geometry/{z}/{x}/{y}.pbf',    // geometry tiles
           'https://tiles/attributes1/{z}/{x}/{y}.pbf', // attribute tiles
           'https://tiles/attributes2/{z}/{x}/{y}.pbf'  // additional attribute tiles
          ].join('|')
        ]
    }
  },
  layers: [
    // use the source in layers like normal
  ]
};
```

## Splitting Vector Tiles

In the [example](./example/index.js) folder of this repository, you’ll find code that prepares the split tilesets for the [DEMO](https://maplibre-merge-protocol.js.org).  
You can try it with the [npm script `example`](./package.json#L14) that runs this code and starts a server to display the output.


## Motivation

Separating geometry from attributes and merging them on the client is especially useful when you have complex, static geometry alongside a large or dynamic set of attributes. This approach lets you combine a **"bare" geometry tileset** with one or more **"naked" attribute tilesets** directly in the client. This can reduce download size, especially when the geometry tiles are cached between reuse.

A typical example is timeseries data on administrative divisions or on discrete global grids like [uber/h3](https://github.com/uber/h3). If you only need to display a single date or compare two dates, including all attributes for every available date can make tiles unnecessarily large. Creating a separate tileset for each date duplicates the geometry, forcing the client to download it multiple times when switching between dates. Pre-generating all possible combinations for a comparison of two dates quickly leads to an explosion in the number of tilesets.

In this case, you would typically use something like the [Martin](https://martin.maplibre.org/) and its [PostgreSQL Function Sources](https://maplibre.org/martin/sources-pg-functions.html#postgresql-function-sources) to generate tiles on the fly based on query parameters. However, this approach would still result in identical geometry being downloaded multiple times, and it requires hosting and maintaining a dedicated server and database.

The `maplibre-merge-protocol` addresses this issue by simply allowing you to maintain a single **geometry tileset** and merge it on the client with one or more **attribute tilesets**. This enables efficient combination of specific  attribute subsets with static geometry. These tilesets can be hosted as simple static assets, without any special infrastructure, as demonstrated in the demo.

## Example Data

The example/demo uses the following data sources:

© [BKG](https://www.bkg.bund.de) (2026), [dl-de/by-2-0](https://www.govdata.de/dl-de/by-2-0) (Daten verändert), Datenquellen: [https://sgx.geodatenzentrum.de/web_public/gdz/datenquellen/datenquellen_vg_nuts.pdf](https://sgx.geodatenzentrum.de/web_public/gdz/datenquellen/datenquellen_vg_nuts.pdf)

## License / Copyright

© 2026 Stefan Keim. All rights reserved. 