function ea_report() {
  const canvas = qs('canvas#canvas-population');
  const canvas_ratio = canvas.width/canvas.height;

  let doc;
  let page = {
    padding: [50, 50, 30, 50],
    width: 0,
    height: 0,
  };

  let lpad = page.padding[3];
  let c;

  const map_height = 100;
  const pie_size = 90;
  const font_size = 12;

  const block_height = map_height + pie_size + (30 * 2) + 20 + 40;
  let block_width;
  let hhalf;

  function reset_font() {
    doc.setFont("helvetica");
    doc.setFontType('normal');
    doc.setFontSize(font_size);
    doc.setTextColor("#393f44");
  };

  function add_page() {
    doc.addPage();
    c = page.padding[0];
  };

  function add_title(text, size) {
    size = size || font_size + 2;

    doc.setFont("helvetica");
    doc.setFontType('normal');
    doc.setTextColor("#00794C");
    doc.setFontSize(size);

    c += size + (size / 2);

    doc.text(text, lpad, c);

    c += size + (size / 2);

    reset_font();
  };

  function add_right_title() {
    doc.setFont("helvetica");
    doc.setFontType('normal');
    doc.setTextColor("#00794C");
    doc.setFontSize(16);

    doc.text("Energy Access Explorer", hhalf + 80, c);
  };

  function add_about() {
    add_title("About");

    const about = `
Energy Access Explorer is a research initiative led by World Resources Institute.
Partners and local stakeholders contribute to the development and update of
the platform. To learn more about Energy Access Explorer or provide feedback,
contact our team at`;

    doc.text(about, lpad, c);

    c += (about.split('\n').length * font_size) + font_size;

    doc.setTextColor("#00794C");
    doc.textWithLink("energyaccessexplorer@wri.org", lpad, c, { url: "mailto:energyaccessexplorer@wri.org"});
    reset_font();
  };

  function add_tables() {
    const names = ['area', 'population'];
    const tables = qsa('table.summary');

    for (let i = 0; i < tables.length; i += 1) {
      add_title(`Share of ${names[i]} for each category`);

      if (tables[i]) doc.autoTable({
        html: tables[i],
        startY: c,
        styles: { halign: "right" },
        columnStyles: { 0: { halign: "left" } },
        theme: "plain"
      });

      c += 120;
    }

    c += font_size * 2;
  };

  function add_indexes_infos() {
    add_title("Geospatial Analytical Outputs");

    for (let i in ea_indexes) {
      let info = ea_indexes[i]['info'];
      doc.text(info, lpad, c);
      c += (info.split('\n').length * font_size) + font_size;
    }

    c += font_size;
  };

  function add_selected_datasets() {
    add_title("Selected Datasets");

    const body = DS.all.filter(d => d.active).map(d => [d.name, d.category.unit, (d.domain || []).join(' - '), d.weight]);

    doc.autoTable({
      head: [['Dataset', 'Unit', 'Range', 'Importance']],
      body: body,
      startY: c,
      styles: { halign: "center" },
      theme: "plain"
    });

    c += 10;
  };

  async function add_indexes_graphs() {
    await add_title("Geospatial Analytical Outputs");

    const w = 300;
    const h = 10;

    await doc.addImage((await svg_png(qs('#summary-graphs .svg-interval'), w, h)),
                       "PNG", hhalf - (w/2), c, w, h);

    c += (h * 2) + 5;

    doc.text('MIN', hhalf - (w/2), c);
    doc.text('MID', hhalf - 10, c);
    doc.text('MAX', hhalf + (w/2) - 26, c);

    c += font_size * 3;

    const pies = qsa('#summary-graphs .index-graphs-container svg');

    await images_block("eai", lpad, c, pies[0], pies[1]);
    await images_block("ani", hhalf, c, pies[6], pies[7]);

    c += font_size * 2;

    await images_block("demand", lpad, c + block_height, pies[2], pies[3]);
    await images_block("supply", hhalf, c + block_height, pies[4], pies[5]);
  };

  async function svg_png(svg, width, height) {
    let tc = document.createElement('canvas');
    tc.width = width;
    tc.height = height;

    let context = tc.getContext("2d");
    let i = 0;

    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

	let blob = new Blob([svg.outerHTML], { type: "image/svg+xml;charset=utf-8" });
	let img = new Image();

	let url = URL.createObjectURL(blob);

    load_image = u => new Promise((resolve, reject) => {
      img.onload = _ => resolve(u);
      img.onerror = _ => reject(u);
      img.src = u;
    });

    await load_image(url);

    context.drawImage(img, 0, 0, width, height);
    const du = tc.toDataURL("image/png");

    URL.revokeObjectURL(url);
    tc.remove();

    return du;
  };

  async function images_block(indexname, x, y, p0, p1) {
    doc.setFont("helvetica");
    doc.setFontSize(font_size);
    doc.setTextColor("#00794C");

    doc.text(ea_indexes[indexname]['name'].toUpperCase(), x, y);

    const image_width = map_height * canvas_ratio;

    doc.addImage(qs('#canvas-' + indexname).toDataURL("image/png"),
                 "PNG",
                 x + (block_width/2) - (image_width/2),
                 y += 20,
                 image_width,
                 map_height);

    y += (map_height + 30) + 10;

    reset_font();

    doc.setFontSize(font_size * (3/4));
    doc.text("Population share", x + 28, y);
    doc.text("Area share", x + (block_width/2) + 40, y);

    y += 10;

    const s = pie_size * 8;

    await doc.addImage((await svg_png(p0, s, s)),
                       "PNG",
                       x + (block_width/4) - (pie_size/2),
                       y,
                       pie_size,
                       pie_size);

    await doc.addImage((await svg_png(p1, s, s)),
                       "PNG",
                       x + (3*block_width/4) - (pie_size/2),
                       y,
                       pie_size,
                       pie_size);

    y += pie_size + font_size;
  };

  async function gen_pdf() {
    doc = new jsPDF('p', 'pt', 'a4');
    c = page.padding[0];

    const _page = jsPDF.getPageSize('p', 'pt', 'a4');
    page.width = _page.width - (page.padding[1] + page.padding[3]);
    page.height = _page.height - (page.padding[0] + page.padding[2]);

    block_width = page.width / 2;
    hhalf = (page.width/2) + page.padding[3]; // NOT _page.width/2, thinkg uneven paddings.

    // START!

    add_right_title();

    add_title(GEOGRAPHY.name, 18);

    await add_indexes_infos();

    add_selected_datasets();

    add_page();

    await add_indexes_graphs();

    add_page();

    add_tables();

    add_about();

    doc.save("report.pdf");
  };

  if (typeof jsPDF === 'undefined') {
    const s0 = document.createElement('script');
    const s1 = document.createElement('script');

    s0.src = "/maps-and-data/lib/jspdf.js";
    s1.src = "/maps-and-data/lib/jspdf-autotable.js";

    s0.onload = _ => document.head.append(s1);
    s1.onload = gen_pdf;

    document.head.append(s0);
  } else {
    gen_pdf();
  };
};
