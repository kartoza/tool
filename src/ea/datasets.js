var ea_datasets = [
  {
    id: "dummy",
    description: "Dummy dataset",
    preload: false,

    url: "./data/empty_tiff.tif",
    parse: function(response) { return ea_dataset_tiff_url(this) },

    band: 0,
  },
  {
    id: "ghi",
    description: "Solar Potential",
    unit: "kWh/m<sup>2</sup>",
    preload: false,

    // url: "./data/ghi.tif",
    // parse: async function() { return ea_dataset_tiff_url(this) },

    endpoint: `${ea_database}/ghi_tiff_materialized`,
    parse: async function(cb) {
      if (!this.raster || !this.image)
      await ea_endpoint(
        this,
        'GET',
        null,
        (r) => ea_dataset_tiff_stream(this, r)
      );
    },

    clamp: false,
    domain: [1294, 2440],
    scalefn: () => d3.scaleLinear().domain([1294, 2440]).range([0,1]),
    band: 0,
    weight: 2,
    active: false,
  },
  {
    id: "poverty",
    description: "Poverty",
    unit: "< 2USD/day",
    preload: false,

    // url: "./data/poverty.tif",
    // parse: () => (!this.raster || !this.image) ? ea_dataset_tiff_url(this) : null,

    endpoint: `${ea_database}/poverty_tiff`,
    parse: async function(cb) {
      if (!this.raster || !this.image)
      await ea_endpoint(
        this,
        'GET',
        null,
        (r) => ea_dataset_tiff_stream(this, r)
      );
    },

    clamp: false,
    domain: [0.7, 1],
    scalefn: () => d3.scaleLinear().domain([0.7, 1]).range([0,1]),
    band: 0,
    weight: 5,
    active: false,
  },
  {
    id: "schools-distance",
    description: "Distance to schools",
    unit: "km",
    preload: false,

    // url: "./data/schools_distance.tif",
    // parse: () => (!this.raster || !this.image) ? ea_dataset_tiff_url(this) : null,

    endpoint: `${ea_database}/schools_tiff_resampled_materialized`,
    parse: async function(cb) {
      if (!this.raster || !this.image)
      await ea_endpoint(
        this,
        'GET',
        null,
        (r) => ea_dataset_tiff_stream(this, r)
      );
    },

    clamp: true,
    domain: [0, 120000],
    scalefn: () => d3.scaleLinear().domain([0, 120000]).range([0,120]),
    band: 0,
    weight: 3,
    active: false,
  },
  {
    id: "transmission-lines",
    description: "Transmission Lines Exclusion",
    preload: false,

    init: 20,
    steps: [1, 10, 20, 30, 50, 100],

    endpoint: `${ea_database}/rpc/transmission_lines_buffered_tiff`,
    parse: async function(v) {
      await ea_endpoint(
        this,
        'POST',
        { km: (v || this.init) },
        (r) => ea_dataset_tiff_stream(this, r)
      );
    },

    clamp: false,
    domain: [0,1],

    scalefn: () => (x) => -x,
    band: 0,
    weight: Infinity,
    datatype: "boolean",
    active: false,
  },
  {
    id: "transmission-lines-polygon",
    description: "Transmission Lines Polygons",
    preload: false,

    init: 20,
    steps: [1, 10, 20, 30, 50, 100],

    endpoint: `${ea_database}/rpc/merged_transmission_lines_geojson`,
    parse: async function(v) {
      await ea_endpoint(
        this,
        'POST',
        { km: (v || this.init) },
        (r) => {
          this.features = [r[0]['payload']];

          globe_load_features(
            ea_globe,
            this.features,
            'transmission-lines-polygon',
            null
          );
        }
      );
    },

    hide: function() {
      if (typeof ea_globe !== 'undefined')
        ea_globe.svg.select(`#${this.id}`).remove()
    },

    datatype: "boolean",
    active: false,
  },
  {
    id: "facilities",
    description: "Facilities",
    preload: false,

    endpoint: `${ea_database}/envelope_facilities`,
    parse: async function(v) {
      await ea_endpoint(
        this,
        'GET',
        null,
        (r) => {
          this.features = r[0]['jsonb_build_object'].features;

          globe_load_features(
            ea_globe,
            this.features,
            'facilities',
            null
          );
        }
      );
    },

    hide: function() {
      if (typeof ea_globe !== 'undefined')
        ea_globe.svg.select(`#${this.id}`).remove()
    },

    datatype: "boolean",
    active: false,
  },
  {
    id: "mines",
    description: "Mines",
    preload: false,

    endpoint: `${ea_database}/envelope_mines`,
    parse: async function(v) {
      await ea_endpoint(
        this,
        'GET',
        null,
        (r) => {
          this.features = r[0]['jsonb_build_object'].features;

          globe_load_features(
            ea_globe,
            this.features,
            'mines',
            null
          );
        }
      );
    },

    hide: function() {
      if (typeof ea_globe !== 'undefined')
        ea_globe.svg.select(`#${this.id}`).remove()
    },

    datatype: "boolean",
    active: false,
  },
  {
    id: "powerplants",
    description: "Power Plants",
    preload: false,

    endpoint: `${ea_database}/envelope_powerplants`,
    parse: async function(v) {
      await ea_endpoint(
        this,
        'GET',
        null,
        (r) => {
          this.features = r[0]['jsonb_build_object'].features

          globe_load_features(
            ea_globe,
            this.features,
            'powerplants',
            null
          );
        }
      );
    },

    hide: function() {
      if (typeof ea_globe !== 'undefined')
        ea_globe.svg.select(`#${this.id}`).remove()
    },

    datatype: "boolean",
    active: false,
  },
  {
    id: "hydro",
    description: "Hydro",
    preload: false,

    endpoint: `${ea_database}/envelope_hydro`,
    parse: async function(v) {
      await ea_endpoint(
        this,
        'GET',
        null,
        (r) => {
          this.features = r[0]['jsonb_build_object'].features

          globe_load_features(
            ea_globe,
            this.features,
            'hydro',
            'powerplants',
            null
          );
        }
      );
    },

    hide: function() {
      if (typeof ea_globe !== 'undefined')
        ea_globe.svg.select(`#${this.id}`).remove()
    },

    datatype: "boolean",
    active: false,
  },
  {
    id: "population disabled",
    description: "Population density",
    unit: "people/30m<sup>2</sup>",
    preload: false,

    // url: null,
    endpoint: `${ea_database}/population_materialized`,
    parse: null,

    clamp: false,
    domain: [0.7, 1],
    scalefn: () => d3.scaleLinear().domain([0, 1000]).range([0,1]),
    band: 0,
    weight: 5,
    active: false,
  },
];

const ea_datasets_category_tree = [{
  "name": "demand",
  "subcategories": [{
    "name": "demographics",
    "datasets": [
      "population",
      "poverty",
    ]
  }, {
    "name": "productive-uses",
    "datasets": [
      "schools-distance",
      "facilities",
      "mines",
      "crops",
    ]
  }],
}, {
  "name": "supply",
  "subcategories": [{
    "name": "resources",
    "datasets": [
      "ghi",
    ]
  }, {
    "name": "infrastructure",
    "datasets": [
      "hydro",
      "powerplants",
      "transmission-lines",
      "transmission-lines-polygon",
    ]
  }]
}];
