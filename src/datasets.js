class DS {
  constructor(o) {
    this.id = o.category.name;

    this.category = o.category;

    let config = o.configuration || {};
    this.config = config;

    this.name = config.name_override || o.category.name_long;

    this.indexname = (o.category.configuration.path && o.category.configuration.path[0]) || null;

    this.weight = o.category.weight || 2;

    this.metadata = o.metadata;

    this.invert = config.invert_override || o.category.configuration.invert;

    this.mutant = !!config.mutant;

    this.collection = !!config.collection;

    if (o.heatmap_file) {
      this.heatmap = o.category.heatmap
      this.heatmap.endpoint = o.heatmap_file.endpoint;
      this.heatmap.parse = ea_datasets_tiff;

      this.multifilter = (this.heatmap.scale === 'multi-key-delta');

      if (!this.mutant && !this.collection)
        ea_datasets_color_scale.call(this);
    }

    if (o.vectors_file) {
      this.vectors = o.category.vectors;
      this.vectors.endpoint = o.vectors_file.endpoint;

      switch (this.vectors.shape_type) {
      case "points": {
        this.vectors.parse = ea_datasets_points;
        break;
      }

      case "polygons": {
        this.vectors.parse = ea_datasets_polygons;
        break;
      }

      case "lines": {
        this.vectors.parse = ea_datasets_lines;
        break;
      }
      }
    }

    if (o.csv_file) {
      this.csv = config.csv;
      this.csv.endpoint = o.csv_file.endpoint;
      this.csv.parse = ea_datasets_csv;
    }

    this.presets = {};

    if (o.presets && o.presets.length) {
      o.presets.forEach(p => {
        return this.presets[p.name] = {
          "weight": p.weight,
          "min": p.min,
          "max": p.max
        };
      });
    }

    else if (o.category.presets && o.category.presets.length) {
      o.category.presets.forEach(p => {
        return this.presets[p.name] = {
          "weight": p.weight,
          "min": p.min,
          "max": p.max
        };
      });
    }

    __dstable[this.id] = this;
  };

  init(active, preset) {
    let presetsempty = Object.keys(this.presets).length === 0;
    let p = this.presets[preset];

    if (!presetsempty && p) {
      this.weight = p.weight;
    }

    this.active = active || (!presetsempty && p);

    this.datatype = (_ => {
      let t = null;

      if (this.mutant) t = null;
      else if (this.vectors) t = this.vectors.shape_type;
      else if (this.parent) t = this.parent.datatype;
      else if (this.heatmap) t = "raster";
      else throw `Cannot decide datatype of ${this.id}`;

      return t;
    })();
  };

  disable() {
    this.active = false;
    this.disabled = true;

    if (this.controls_el) this.controls_el.disable();
    if (this.input_el) this.input_el.disable();

    if (this.collection) {
      for (let i of this.config.collection) { DS.get(i).disable(); log(i); }
    }

    if (this.collection_parent) {
      if (!this.collection_parent.disabled) this.collection_parent.disable();
    }

    ea_overlord({
      "type": "dataset",
      "target": this,
      "caller": "dataset disable"
    });
  };

  add_source(opts) {
    if (this.source) return;

    this.source = MAPBOX.addSource(this.id, opts);
  };

  add_layer(opts) {
    if (this.layer) return;

    opts['id'] = this.id;
    opts['source'] = this.id;

    this.layer = MAPBOX.addLayer(opts, MAPBOX.first_symbol);
  };

  mutant_init() {
    if (!this.mutant) throw `${this.id} is not a mutant. Bye.`

    let m = DS.get(this.config.mutant_targets[0]);

    this.host = m;

    this.datatype = m.datatype;

    this.raster = m.raster;
    this.vectors = m.vectors;
    this.heatmap = m.heatmap;

    this.color_scale_fn = m.color_scale_fn;
    this.scale_stops = m.scale_stops;
  };

  async mutate(host) {
    if (!this.mutant) throw `${this.id} is not a mutant.`;

    if (!this.config.mutant_targets.includes(host.id))
      throw `${this.id} is not configured to mutate into ${host.id}.`

    this.host = host;

    await host.heatmap.parse.call(host);

    this.datatype = host.datatype;

    this.heatmap = host.heatmap;
    this.raster = host.raster;
    this.vectors = host.vectors;

    this.color_scale_fn = host.color_scale_fn;
    this.scale_stops = host.scale_stops;

    this.input_el.refresh();

    let src;
    if (src = MAPBOX.getSource(this.id)) {
      src.canvas = MAPBOX.getSource(host.id).canvas;
      src.play();
      src.pause();
    }

    return this;
  };

  collection_init() {
    for (let i of this.config.collection) {
      const d = DS.get(i);
      d.input_el = d.input_el || new dsinput(d);
      d.collection_parent = this;
    }
  };

  async multifilter_init(inputs) {
    if (!this.csv) return;

    await Promise.all([
      this.csv.parse.call(this),
      this.heatmap.parse.call(this),
      this.vectors.parse.call(this),
    ]);

    const features_json = JSON.stringify(this.features);

    for (let v in this.csv.options) {
      // we can do this because category is plain JSON, not javascript.
      let cat = JSON.parse(JSON.stringify(this.category));
      cat.name = this.id + "-" + v;
      cat.name_long = this.csv.options[v];

      let d = new DS({ category: cat });

      d.child_id = v;
      d.parent = this;
      d.config = {};
      d.metadata = this.metadata;

      Object.assign(d.heatmap = {}, this.heatmap);
      d.heatmap.scale = "key-delta";

      Object.assign(d.raster = {}, this.raster);
      Object.assign(d.vectors = {}, this.vectors);
      Object.assign(d.features = {}, JSON.parse(features_json));

      Object.assign(d.csv = {}, this.csv);

      await d.init(inputs.includes(d.id), null);

      d.singlefilter_init();
    }
  };

  async singlefilter_init() {
    let o = this.parent.config.polygons[this.child_id];
    let cs = this.vectors.color_stops;

    let max = Math.max.apply(null, this.features.features.map(f => f.properties[o]));
    max = (max <= 1) ? 1 : 100;

    const d = Array(cs.length).fill(0).map((x,i) => (0 + i * (max/(cs.length-1))));
    const s = d3.scaleLinear().domain(d).range(cs);

    this.color_scale_fn = s;
    this.scale_stops = d;

    const fs = this.features.features;
    for (let i = 0; i < fs.length; i += 1)
      fs[i].properties.__color = s(fs[i].properties[o])

    this.table = this.parent.table.map(r => r[this.child_id]);

    let src; if (src = MAPBOX.getSource(this.id)) { src.setData(this.features); }
  };

  /*
   * scale_fn
   *
   * Extract the scaling function given a dataset and the current parameters.
   *
   * @param "i" string
   *   name of the current index being drawn and decide if the range of the
   *   function should be inverted.
   *
   * returns function (ds domain) -> [0,1]
   */

  scale_fn(i) {
    let s = null;

    const d = (this.heatmap.domain && [this.heatmap.domain.min, this.heatmap.domain.max]) || [0,1];
    const t = this.domain;
    const v = this.heatmap.scale;
    const r = ((typeof this.invert !== 'undefined' && this.invert.includes(i)) ? [1,0] : [0,1]);

    switch (v) {
    case 'multi-key-delta':
      break;

    case 'key-delta': {
      if (!this.table) return (s = x => 1);

      s = x => {
        let z = this.table[x];
        if (!z) return -1;

        return (z < t[0] || z > t[1]) ? -1 : 1;
      };
      break;
    }

    case 'exclusion-buffer': {
      s = x => (x < t[0] || x > t[1]) ? 1 : -1;
      break;
    }

    case 'linear':
    default: {
      const lin = d3.scaleLinear()
            .domain(t || d)
            .range(r)

      s = lin.clamp(this.heatmap.clamp);
      break;
    }
    }

    return s;
  };

  async visible(t) {
    if (this.collection) {
      await Promise.all(this.config.collection.map(i => DS.get(i).visible(t)));
      return;
    }

    if (this.layer)
      MAPBOX.setLayoutProperty(this.id, 'visibility', t ? 'visible' : 'none');
  };

  async turn(v, draw) {
    if (v) {
      if (this.controls_el) this.controls_el.loading(true);
      await this.load();
      if (this.controls_el) this.controls_el.loading(false);
    }

    if (this.collection) {
      await Promise.all(this.config.collection.map(i => DS.get(i).turn(v, draw)));
      this.controls_el.turn(v);

      return;
    }

    if (this.mutant) this.mutate(this.host);

    if (this.controls_el) this.controls_el.turn(v);

    this.visible(v && draw);
  };

  async load(arg) {
    if (this.collection) {
      await Promise.all(this.config.collection.map(i => DS.get(i).load(arg)));

      // TODO: Remove this. It's a hack for transmission-lines-collection not
      // having per-element rasters but a single collection raster.
      //
      if (this.heatmap) await this.heatmap.parse.call(this);

      return;
    }

    if (!arg)
      await Promise.all(['vectors', 'csv', 'heatmap'].map(i => (this[i]) ? this.load(i) : null));
    else
      if (this[arg]) await this[arg].parse.call(this);
  };

  async raise() {
    if (this.layer)
      MAPBOX.moveLayer(this.id, MAPBOX.first_symbol);

    if (this.collection) {
      for (let i of this.config.collection)
        DS.get(i).raise();
    }
  };

  // class methods

  static get all() {
    return Object.keys(__dstable).map(i => __dstable[i]);
  };

  static get(i) {
    return __dstable[i];
  };
};

/*
 * This is a workaround for not having class variables
 */
window.__dstable = {};

/*
 * ea_datasets_init
 *
 * 1. fetch the datasets list from the API
 * 2. generate DS objects
 * 3. initialise mutants and collections
 *
 * @param "id" uuid
 * @param "inputs" string[] with DS.id's
 * @param "preset" string ("custom", "market", "investment", "planning")
 *
 * returns DS[]
 */

async function ea_datasets_init(id, inputs, preset, callback) {
  let attrs = '*,heatmap_file(*),vectors_file(*),csv_file(*),category(*)';

  let boundaries;

  await fetch(`${ea_settings.database}/datasets?geography_id=eq.${id}&select=${attrs}`)
    .then(r => r.json())
    .then(r => r.map(e => {
      let active = (inputs.includes(e.category.name));
      let ds = new DS(e);

      if (ds.id === 'boundaries') (async _ => {
        boundaries = ds;

        ds.active = true;

        await ds.load('vectors');
        await ds.load('heatmap');

        callback(ds.vectors.bounds);
      })();

      ds.init(active, preset);
    }));

  // We need all the datasets to be initialised _before_ setting
  // mutant/collection attributes (order is never guaranteed)
  //
  DS.all.filter(d => d.mutant).forEach(d => d.mutant_init());
  DS.all.filter(d => d.collection).forEach(d => d.collection_init());

  // multifilters generate new datasets. We need to wait for these sinces
  // the next step is to syncronise the entire thing.
  //
  await Promise.all(DS.all.filter(d => d.multifilter).map(d => d.multifilter_init(inputs)));
};

function ea_datasets_color_scale() {
  let cs = this.heatmap.color_stops;
  let c = ea_color_scale.name;
  let d = ea_color_scale.domain;

  if (!cs || !cs.length)
    this.heatmap.color_stops = cs = ea_color_scale.stops;
  else
    d = Array(cs.length).fill(0).map((x,i) => (0 + i * (1/(cs.length-1))));

  this.scale_stops = d;

  {
    let intervals;

    if (this.heatmap.configuration && (intervals = this.heatmap.configuration.intervals)) {
      let l = intervals.length;

      let s = d3.scaleLinear()
          .domain([0,255])
          .range([this.heatmap.domain.min, this.heatmap.domain.max])
          .clamp(true);

      const a = new Uint8Array(1024).fill(-1);
      for (let i = 0; i < 1024; i += 4) {
        let j = interval_index(s(i/4), intervals, this.heatmap.clamp);

        if (j === -1) {
          a[i] = a[i+1] = a[i+2] = a[i+3] = 0;
          continue;
        }

        let cj = cs[j];

        let color = hex_to_rgba(cs[j]);

        a[i] = color[0];
        a[i+1] = color[1];
        a[i+2] = color[2];
        a[i+3] = color[3];
      }

      plotty.colorscales[c = this.id] = a;

      this.color_theme = c;

      this.color_scale_fn = (x,i) => cs[i];
    }

    else {
      plotty.addColorScale((c = this.id), cs, d);

      this.color_theme = c;

      this.color_scale_fn = d3.scaleLinear()
        .domain(d)
        .range(cs)
        .clamp(this.heatmap.clamp || false);
    }
  }
};

/*
 * The following functions fetch and load the different types of data to the
 * datasets geojsons (points, lines or polygons), CSV's or rasters.
 */

function ea_datasets_fail(format) {
  ea_flash.push({
    type: 'error',
    timeout: 5000,
    title: "Network error",
    message: `
Failed to process the ${format} for '${this.name}'.
This is not fatal. Dataset disabled.`
  });

  this.disable();

  throw Error(`"Dataset '${this.name}' disabled`);
};

function ea_datasets_csv() {
  if (this.table) return;

  fetch(this.csv.endpoint)
    .then(r => r.text())
    .then(t => d3.csvParse(t, d => {
      const o = { oid: +d[this.csv.oid] };
      Object.keys(this.csv.options).forEach(k => o[k] = +d[k]);
      return o;
    }))
    .then(data => {
      // HACK: so we can access them by oid (as an array, they are
      // generally a sequence starting at 1)
      //
      if (data[0]['oid'] === 1) data.unshift({ oid: 0 });

      this.table = data;
    })
    .catch(e => warn(`'${this.id}' raised an error and several datasets might depend on this. Bye!`));
};

function ea_datasets_tiff() {
  async function run_it(blob) {
    function draw() {
      if (this.vectors) return;

      let d = this.heatmap.domain;

      if (!this.source) {
        (new plotty.plot({
          canvas: this.canvas,
          data: this.raster.data,
          width: this.raster.width,
          height: this.raster.height,
          domain: [d.min, d.max],
          noDataValue: this.raster.nodata,
          colorScale: this.color_theme,
        })).render();

        this.add_source({
          "type": "canvas",
          "canvas": this.canvas,
          "animate": false,
          "coordinates": MAPBOX.coords
        });
      }

      this.add_layer({
        "type": 'raster',
        "layout": {
          "visibility": "none",
        },
        "paint": {
          "raster-resampling": "nearest"
        }
      });

      // TODO: Remove this. It's a hack for transmission-lines-collection not
      // having per-element rasters but a single collection raster.
      //
      if (this.id === 'transmission-lines-collection') {
        MAPBOX.setLayoutProperty(this.id, 'visibility', 'none');
      }
    };

    if (this.raster && this.raster.data) {
      draw.call(this);
    }

    else {
      const tiff = await GeoTIFF.fromBlob(blob);
      const image = await tiff.getImage();
      const rasters = await image.readRasters();

      this.raster = {
        data: rasters[0],
        width: image.getWidth(),
        height: image.getHeight(),
        nodata: parseFloat(tiff.fileDirectories[0][0].GDAL_NODATA)
      };

      if (!this.canvas) this.canvas = ce('canvas');

      if (MAPBOX) {
        draw.call(this);
      }
    }

    return;
  };

  if (this.raster && this.raster.data) {
    run_it.call(this);
    return;
  }

  return fetch(this.heatmap.endpoint)
    .then(r => {
      if (!(r.ok && r.status < 400)) ea_datasets_fail.call(this, "TIFF");
      else return r;
    })
    .then(r => r.blob())
    .then(b => run_it.call(this, b));
};

function ea_datasets_geojson() {
  const source = _ => {
    this.add_source({
      "type": "geojson",
      "data": this.features
    });
  };

  if (this.features)
    return new Promise((res, rej) => { source(); res(); });

  return fetch(this.vectors.endpoint)
    .then(r => r.json())
    .catch(err => ea_datasets_fail.call(this, "GEOJSON"))
    .then(r => {
      this.features = r;

      try {
        this.vectors.bounds = geojsonExtent(r);
      }
      catch (err) {
        if (this.id === 'boundaries') throw err;

        warn(`geojsonExtent failed for '${this.id}'. This is not fatal. Here's the error:`, r);
        log(err);
      }
    })
    .then(r => source());
};

function ea_datasets_points() {
  return ea_datasets_geojson.call(this)
    .then(_ => {
      this.add_layer({
        "type": "circle",
        "layout": {
          "visibility": "none",
        },
        "paint": {
          "circle-radius": this.vectors.width || 3,
          "circle-opacity": this.vectors.opacity,
          "circle-color": this.vectors.fill || 'cyan',
          "circle-stroke-width": this.vectors['stroke-width'] || 1,
          "circle-stroke-color": this.vectors.stroke || 'black',
        },
      });
    });
};

function ea_datasets_lines() {
  return ea_datasets_geojson.call(this)
    .then(_ => {
      let da = this.vectors.dasharray.split(' ').map(x => +x);

      // mapbox-gl does not follow SVG's stroke-dasharray convention when it comes
      // to single numbered arrays.
      //
      if (da.length === 1) {
        (da[0] === 0) ?
          da = [1] :
          da = [da[0], da[0]];
      }

      this.add_layer({
        "type": "line",
        "layout": {
          "visibility": "none",
        },
        "paint": {
          "line-width": this.vectors.width || 1,
          "line-color": this.vectors.stroke,
          "line-dasharray": da,
        },
      });
    });
};

function ea_datasets_polygons() {
  return ea_datasets_geojson.call(this)
    .then(_ => {
      this.add_layer({
        "type": "fill",
        "layout": {
          "visibility": "none",
        },
        "paint": {
          "fill-color": this.parent ? ['get', '__color'] : this.vectors.fill,
          "fill-outline-color": this.vectors.stroke,
          "fill-opacity": this.vectors.opacity,
        },
      });
    });
};
