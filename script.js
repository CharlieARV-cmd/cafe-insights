/* Café Insights · Etapa 2 — JavaScript puro, sin dependencias.
   Consume los datos que sirve la API (/api/resultados). */
(async () => {
  'use strict';

  // Los datos los sirve la API (api.py). Si index.html se abre como archivo, se apunta a la API local.
  const API = window.location.protocol === 'file:' ? 'http://127.0.0.1:8000' : '';
  let R;
  try {
    const respuesta = await fetch(`${API}/api/resultados`);
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    R = await respuesta.json();
  } catch (error) {
    document.body.insertAdjacentHTML('afterbegin',
      '<p class="aviso">No se pudieron cargar los datos desde la API. Iniciala con: uvicorn api:app</p>');
    return;
  }

  /* ================= Utilidades ================= */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Formato numérico en español (1.234,5), igual que el notebook
  function fmt(n, d = 0) {
    const fijo = Math.abs(n).toFixed(d);
    const [entero, dec] = fijo.split('.');
    const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const negativo = n < 0 && Number(fijo) !== 0 ? '-' : '';
    return negativo + miles + (dec ? ',' + dec : '');
  }
  const pct = (x, d = 1) => `${fmt(x * 100, d)} %`;
  const signed = (x, d = 0) => `${x > 0 ? '+' : ''}${fmt(x * 100, d)} %`;
  const fecha = (iso) => iso.split('-').reverse().join('/');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`(.+?)`/g, '<code>$1</code>');
  const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const lista = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}` : items[0] || '');

  function svg(tag, attrs = {}, parent) {
    const node = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (parent) parent.appendChild(node);
    return node;
  }

  // Paleta del local: cobre, crema, salvia y piedra sobre negro mate
  const PALETA = { cobre: '#c58a55', cobreClaro: '#e2ab72', beige: '#d8c7ad', ok: '#a3b48b', alerta: '#cf7a62', panel: '#15120f' };
  const COLOR_MODELO = { 'Random Forest': '#d9965c', 'Linear Regression': '#9fae96' };
  const COLORES = {
    'Americano': '#c58a55', 'Americano with Milk': '#e6d3b0', 'Cappuccino': '#a3b48b', 'Cocoa': '#c4938f',
    'Cortado': '#d9b04e', 'Espresso': '#8f877b', 'Hot Chocolate': '#d1795e', 'Latte': '#7ea0ae',
  };
  const colorCafe = (c) => COLORES[c] || '#8f877b';
  const colorModelo = (m) => COLOR_MODELO[m] || '#8f877b';

  const ETIQUETAS = {
    participacion_30d: 'Participación en compras (30 d)', ingresos_30d: 'Ingresos últimos 30 d', ingresos_7d: 'Ingresos últimos 7 d',
    compras_7d: 'Compras últimos 7 d', compras_14d: 'Compras últimos 14 d', compras_30d: 'Compras últimos 30 d',
    precio_actual: 'Precio vigente', tendencia: 'Tendencia (7 d vs. 30 d)', pct_noche_30d: '% de compras de noche (30 d)',
    pct_finde_30d: '% de compras en fin de semana (30 d)', cafe: 'Tipo de café',
  };
  const etiqueta = (v) => ETIQUETAS[v] || v;

  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const mesCorto = (ym) => { const [y, m] = ym.split('-'); return `${MESES[Number(m) - 1]} ${y.slice(2)}`; };

  /* ================= Datos derivados ================= */
  const M = R.meta;
  const ranking = R.ranking;
  const top = ranking[0];
  const segundo = ranking[1];
  const MAE = R.metricas.rf.MAE;
  const totalEstimado = ranking.reduce((a, r) => a + r.estimada, 0);
  const totalPrevio = ranking.reduce((a, r) => a + r.ultimos_30d, 0);
  const baseBaja = ranking.filter((r) => r.compras_30d < 10);
  const mejora = R.metricas.mejora_mae;
  const brecha = top.estimada - segundo.estimada;
  const solapan = top.p10 < segundo.p90 && segundo.p10 < top.p90;
  const imp = (modo) => R.importancia[modo];

  /* ================= Tooltip ================= */
  const tip = $('#tooltip');
  function mostrarTip(html, x, y) {
    tip.innerHTML = html;
    tip.classList.add('is-visible');
    tip.setAttribute('aria-hidden', 'false');
    const w = tip.offsetWidth, h = tip.offsetHeight, pad = 14;
    let left = x + pad, arriba = y + pad;
    if (left + w > window.innerWidth - 8) left = x - w - pad;
    if (arriba + h > window.innerHeight - 8) arriba = y - h - pad;
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = Math.max(8, arriba) + 'px';
  }
  function ocultarTip() { tip.classList.remove('is-visible'); tip.setAttribute('aria-hidden', 'true'); }
  function enlazarTip(nodo, htmlFn) {
    nodo.addEventListener('pointerenter', (e) => mostrarTip(htmlFn(), e.clientX, e.clientY));
    nodo.addEventListener('pointermove', (e) => mostrarTip(htmlFn(), e.clientX, e.clientY));
    nodo.addEventListener('pointerleave', ocultarTip);
    nodo.addEventListener('focus', () => { const b = nodo.getBoundingClientRect(); mostrarTip(htmlFn(), b.left + b.width / 2, b.top); });
    nodo.addEventListener('blur', ocultarTip);
  }

  /* ================= Gráficos SVG ================= */
  const redibujar = [];
  function registrar(host, fn) {
    fn();
    redibujar.push({ host, fn, ancho: host.clientWidth });
  }
  window.addEventListener('resize', debounce(() => {
    redibujar.forEach((r) => {
      if (r.host.clientWidth !== r.ancho) { r.ancho = r.host.clientWidth; r.fn(); }
    });
  }, 150));

  const leyenda = (items) =>
    `<div class="leyenda">${items.map((i) => `<span><i style="background:${i.color}"></i>${esc(i.name)}</span>`).join('')}</div>`;

  // Parte un rótulo en líneas de hasta `max` caracteres
  function envolver(texto, max) {
    const lineas = [''];
    texto.split(' ').forEach((palabra) => {
      const actual = lineas[lineas.length - 1];
      if (!actual) lineas[lineas.length - 1] = palabra;
      else if ((actual + ' ' + palabra).length <= max) lineas[lineas.length - 1] = actual + ' ' + palabra;
      else lineas.push(palabra);
    });
    return lineas;
  }

  // Barras horizontales finas (admite varias series y valores negativos)
  function barrasH(host, filas, series, opt = {}) {
    const W = host.clientWidth || 640;
    const masLarga = Math.max(...filas.map((f) => f.etiqueta.length));
    const izq = Math.round(Math.min(Math.max(masLarga * 6.4 + 18, 104), W * 0.4));
    const maxChars = Math.floor((izq - 16) / 6.4);
    const der = W < 520 ? 66 : 92, sup = 6, inf = 26;
    const altoBarra = series.length > 1 ? 10 : 14, sepBarra = 4;
    const plotW = Math.max(60, W - izq - der);
    const rotulos = filas.map((f) => envolver(f.etiqueta, maxChars));
    const alturaFila = (i) => Math.max(series.length * altoBarra + (series.length - 1) * sepBarra, rotulos[i].length * 14) + 18;
    const H = sup + filas.reduce((a, _, i) => a + alturaFila(i), 0) + inf;
    const tope = opt.max ?? Infinity, piso = opt.min ?? -Infinity;
    const recorte = (v) => Math.min(tope, Math.max(piso, v));
    const vals = filas.flatMap((f) => f.valores.map(recorte));
    const minV = Math.min(0, ...vals), maxV = Math.max(0, ...vals) || 1;
    const x = (v) => izq + ((v - minV) / (maxV - minV)) * plotW;
    const x0 = x(0);

    host.innerHTML = '';
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'presentation' }, host);
    const rejilla = svg('g', { class: 'rejilla' }, s), ejes = svg('g', { class: 'eje' }, s);
    for (let i = 0; i <= 4; i++) {
      const v = minV + ((maxV - minV) * i) / 4, gx = x(v);
      svg('line', { x1: gx, x2: gx, y1: sup, y2: H - inf }, rejilla);
      svg('text', { x: gx, y: H - 8, 'text-anchor': 'middle' }, ejes).textContent = opt.ejeFmt ? opt.ejeFmt(v) : fmt(v);
    }
    svg('line', { class: 'base', x1: x0, x2: x0, y1: sup, y2: H - inf }, s);

    let y = sup;
    filas.forEach((f, i) => {
      const alto = alturaFila(i);
      const grupo = series.length * altoBarra + (series.length - 1) * sepBarra;
      const y0 = y + (alto - grupo) / 2;
      const rotulo = svg('text', { class: 'rotulo-svg fuerte', 'text-anchor': 'end', x: izq - 12, y: y + alto / 2 - ((rotulos[i].length - 1) * 7) + 4 }, s);
      rotulos[i].forEach((linea, k) => {
        const t = svg('tspan', { x: izq - 12, dy: k === 0 ? 0 : 14 }, rotulo);
        t.textContent = linea;
      });
      f.valores.forEach((v, j) => {
        const vr = recorte(v), xv = x(vr), by = y0 + j * (altoBarra + sepBarra);
        const color = opt.colorFn ? opt.colorFn(v, f, j) : series[j].color;
        const barra = svg('rect', { class: 'barra', x: Math.min(x0, xv), y: by, width: Math.max(1, Math.abs(xv - x0)), height: altoBarra, rx: 2, fill: color }, s);
        if (!reduceMotion) {
          barra.style.transformOrigin = `${x0}px ${by}px`;
          barra.style.transform = 'scaleX(0)';
          requestAnimationFrame(() => requestAnimationFrame(() => { barra.style.transform = 'scaleX(1)'; }));
        }
        const recortado = vr !== v;
        const txt = svg('text', { class: 'rotulo-svg valor', x: v >= 0 ? xv + 7 : xv - 7, y: by + altoBarra / 2 + 4, 'text-anchor': v >= 0 ? 'start' : 'end' }, s);
        txt.textContent = (recortado ? (v > 0 ? '▶ ' : '◀ ') : '') + opt.fmt(v, f, j);
      });
      const zona = svg('rect', { x: 0, y, width: W, height: alto, fill: 'transparent', tabindex: 0, 'aria-label': f.etiqueta }, s);
      enlazarTip(zona, () => `<strong>${esc(f.etiqueta)}</strong>` + f.valores.map((v, j) => `<br>${esc(series[j].name)}: ${esc(opt.fmt(v, f, j))}`).join(''));
      y += alto;
    });

    if (series.length > 1) host.insertAdjacentHTML('beforeend', leyenda(series));
  }

  // Líneas con varias series y cursor interactivo
  function lineas(host, etiquetas, series, opt = {}) {
    const W = host.clientWidth || 640;
    const chico = W < 520;
    const H = chico ? 260 : 320, izq = chico ? 46 : 56, der = 16, sup = 14, inf = 34;
    const plotW = W - izq - der, plotH = H - sup - inf;
    const maxDato = Math.max(1, ...series.flatMap((s) => s.valores));
    const paso = (() => { const crudo = maxDato / 4, mag = Math.pow(10, Math.floor(Math.log10(crudo))); const r = crudo / mag; return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * mag; })();
    const maxY = Math.ceil(maxDato / paso) * paso;
    const n = etiquetas.length;
    const x = (i) => izq + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const y = (v) => sup + plotH - (v / maxY) * plotH;

    host.innerHTML = '';
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'presentation' }, host);
    const rejilla = svg('g', { class: 'rejilla' }, s), ejes = svg('g', { class: 'eje' }, s);
    for (let v = 0; v <= maxY + 1e-9; v += paso) {
      svg('line', { x1: izq, x2: W - der, y1: y(v), y2: y(v) }, rejilla);
      svg('text', { x: izq - 10, y: y(v) + 4, 'text-anchor': 'end' }, ejes).textContent = fmt(v);
    }
    const saltar = Math.ceil(n / Math.max(2, Math.floor(plotW / 62)));
    etiquetas.forEach((e, i) => {
      if (i % saltar !== 0 && i !== n - 1) return;
      svg('text', { x: x(i), y: H - 12, 'text-anchor': 'middle' }, ejes).textContent = opt.etiquetaFmt ? opt.etiquetaFmt(e) : e;
    });

    series.forEach((serie) => {
      const d = serie.valores.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      const trazo = svg('path', { d, class: 'trazo', stroke: serie.color }, s);
      if (serie.discontinua) trazo.setAttribute('stroke-dasharray', '6 5');
      if (!reduceMotion && !serie.discontinua && trazo.getTotalLength) {
        const largo = trazo.getTotalLength();
        trazo.style.strokeDasharray = largo; trazo.style.strokeDashoffset = largo;
        trazo.getBoundingClientRect();
        trazo.style.transition = 'stroke-dashoffset 1.1s ease';
        requestAnimationFrame(() => { trazo.style.strokeDashoffset = 0; });
      }
      serie.valores.forEach((v, i) => svg('circle', { cx: x(i), cy: y(v), r: 3, fill: serie.color, stroke: PALETA.panel, 'stroke-width': 1.5 }, s));
    });

    const guia = svg('line', { class: 'guia', y1: sup, y2: sup + plotH, visibility: 'hidden' }, s);
    const capa = svg('rect', { x: izq, y: sup, width: plotW, height: plotH, fill: 'transparent', tabindex: 0, 'aria-label': 'Gráfico interactivo' }, s);
    let activo = 0;
    const mostrar = (i, cx, cy) => {
      activo = i; guia.setAttribute('x1', x(i)); guia.setAttribute('x2', x(i)); guia.setAttribute('visibility', 'visible');
      mostrarTip(`<strong>${esc(opt.etiquetaFmt ? opt.etiquetaFmt(etiquetas[i]) : etiquetas[i])}</strong>` +
        series.map((sr) => `<br><span style="color:${sr.color}">●</span> ${esc(sr.nombre)}: ${fmt(sr.valores[i], opt.decimales || 0)}`).join(''), cx, cy);
    };
    const indiceDe = (e) => { const r = s.getBoundingClientRect(); const px = ((e.clientX - r.left) / (r.width || W)) * W; return Math.max(0, Math.min(n - 1, Math.round(((px - izq) / plotW) * (n - 1)))); };
    capa.addEventListener('pointermove', (e) => mostrar(indiceDe(e), e.clientX, e.clientY));
    capa.addEventListener('pointerleave', () => { guia.setAttribute('visibility', 'hidden'); ocultarTip(); });
    capa.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const i = Math.max(0, Math.min(n - 1, activo + (e.key === 'ArrowRight' ? 1 : -1)));
      const b = capa.getBoundingClientRect();
      mostrar(i, b.left + ((x(i) - izq) / plotW) * b.width, b.top);
    });
    capa.addEventListener('blur', () => { guia.setAttribute('visibility', 'hidden'); ocultarTip(); });

    host.insertAdjacentHTML('beforeend', leyenda(series.map((sr) => ({ name: sr.nombre, color: sr.color }))));
  }

  // Dispersión: real vs. predicho
  function dispersion(host, puntos) {
    const W = host.clientWidth || 640;
    const H = Math.round(Math.min(W * 0.62, 420)), izq = 58, der = 16, sup = 14, inf = 40;
    const plotW = W - izq - der, plotH = H - sup - inf;
    const maxV = Math.max(1, ...puntos.flatMap((p) => [p.real, p.rf])) * 1.06;
    const x = (v) => izq + (v / maxV) * plotW, y = (v) => sup + plotH - (v / maxV) * plotH;

    host.innerHTML = '';
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'presentation' }, host);
    const rejilla = svg('g', { class: 'rejilla' }, s), ejes = svg('g', { class: 'eje' }, s);
    for (let i = 0; i <= 4; i++) {
      const v = (maxV * i) / 4;
      svg('line', { x1: izq, x2: W - der, y1: y(v), y2: y(v) }, rejilla);
      svg('line', { x1: x(v), x2: x(v), y1: sup, y2: sup + plotH }, rejilla);
      svg('text', { x: izq - 10, y: y(v) + 4, 'text-anchor': 'end' }, ejes).textContent = fmt(v);
      svg('text', { x: x(v), y: H - 22, 'text-anchor': 'middle' }, ejes).textContent = fmt(v);
    }
    svg('text', { class: 'rotulo-svg', x: izq + plotW / 2, y: H - 4, 'text-anchor': 'middle' }, s).textContent = 'Rentabilidad real';
    svg('text', { class: 'rotulo-svg', x: 12, y: sup + plotH / 2, 'text-anchor': 'middle', transform: `rotate(-90 12 ${sup + plotH / 2})` }, s).textContent = 'Predicha';
    svg('line', { x1: x(0), y1: y(0), x2: x(maxV), y2: y(maxV), stroke: PALETA.cobre, 'stroke-opacity': .55, 'stroke-dasharray': '5 5' }, s);

    puntos.forEach((p) => {
      const c = svg('circle', { class: 'punto', cx: x(p.real), cy: y(p.rf), r: 5, fill: colorCafe(p.cafe), 'fill-opacity': .85, stroke: PALETA.panel, 'stroke-width': 1.2, tabindex: 0, 'aria-label': `${p.cafe}, ${p.fecha}` }, s);
      enlazarTip(c, () => `<strong>${esc(p.cafe)}</strong><br>Corte: ${fecha(p.fecha)}<br>Real: ${fmt(p.real)}<br>Random Forest: ${fmt(p.rf)}<br>Modelo base: ${fmt(p.base)}`);
    });
    const usados = [...new Set(puntos.map((p) => p.cafe))];
    host.insertAdjacentHTML('beforeend', leyenda(usados.map((c) => ({ name: c, color: colorCafe(c) }))));
  }

  /* ================= Secciones ================= */
  function animarNumero(nodo) {
    const destino = Number(nodo.dataset.to), dec = Number(nodo.dataset.dec || 0);
    const sufijo = nodo.dataset.suffix || '', prefijo = nodo.dataset.prefix || '';
    const dibujar = (v) => { nodo.textContent = prefijo + fmt(v, dec) + sufijo; };
    if (reduceMotion || !window.requestAnimationFrame) { dibujar(destino); return; }
    const t0 = performance.now(), dur = 1100;
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      dibujar(destino * e);
      if (k < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  }
  function numeroAnimado(valor, dec = 0, sufijo = '', prefijo = '') {
    return `<span data-count data-to="${valor}" data-dec="${dec}" data-suffix="${esc(sufijo)}" data-prefix="${esc(prefijo)}">${prefijo}${fmt(valor, dec)}${sufijo}</span>`;
  }

  // 01 · Resumen ejecutivo: café ganador, modelo ganador, métricas y recomendación
  function resumen() {
    const C = R.comparacion;
    $('#heroLead').innerHTML = rich(
      `Con ${fmt(M.filas_base)} ventas con tarjeta de ${M.n_cafes} cafés (${fecha(M.periodo[0])} a ${fecha(M.periodo[1])}), un Random Forest estima que **${top.cafe}** tendrá la mayor rentabilidad esperada entre el ${fecha(M.inicio_prediccion)} y el ${fecha(M.fin_prediccion)}. El resultado es una guía para priorizar el abastecimiento, no un pronóstico exacto.`);
    $('#heroTags').innerHTML = ['RandomForestRegressor', 'GridSearchCV', 'Validación temporal', `Horizonte de ${M.horizonte_dias} días`]
      .map((t) => `<li class="sello">${esc(t)}</li>`).join('');

    $('#heroName').textContent = top.cafe;
    $('#heroValue').innerHTML = numeroAnimado(Math.round(top.estimada));
    const datos = [
      ['Participación del total proyectado', pct(top.peso)],
      ['Rango entre árboles (P10–P90)', `${fmt(top.p10)} – ${fmt(top.p90)}`],
      ['Últimos 30 días', fmt(top.ultimos_30d)],
      ['Variación estimada', signed(top.variacion)],
      ['Precio vigente', fmt(top.precio_actual, 2)],
    ];
    $('#heroDatos').innerHTML = datos.map(([t, v]) => `<div><dt>${t}</dt><dd>${v}</dd></div>`).join('');
    if (C) {
      const ganados = C.votos.filter((v) => v.ganador === C.recomendado).length;
      $('#heroModelo').innerHTML = `Modelo ganador: <strong>${esc(C.recomendado)}</strong> · gana ${ganados} de ${C.votos.length} criterios de la comparación.`;
    } else {
      $('#heroModelo').remove();
    }

    // Recomendación para el encargado de compras
    const top3 = ranking.slice(0, 3), peso3 = top3.reduce((a, r) => a + r.peso, 0);
    const cauteloso = solapan || brecha / MAE < 2;
    $('#recomendacion').innerHTML = `
      <p class="recomendacion__rotulo">Recomendación para el encargado de compras</p>
      <div>
        <p class="recomendacion__texto">${rich(`Priorizar el abastecimiento de **${top.cafe}** y, junto con él, de ${lista(top3.slice(1).map((r) => r.cafe))}: los tres concentran el ${pct(peso3, 0)} de la rentabilidad proyectada.`)}</p>
        <p class="recomendacion__nota">${cauteloso
          ? `${esc(top.cafe)} es el líder más probable, no un ganador seguro: su ventaja sobre ${esc(segundo.cafe)} (${fmt(brecha)} u. m.) equivale a ${fmt(brecha / MAE, 1)} veces el error típico del modelo.`
          : `La ventaja de ${esc(top.cafe)} sobre ${esc(segundo.cafe)} (${fmt(brecha)} u. m.) supera con holgura el error típico del modelo.`}</p>
      </div>`;

    const base = R.metricas.base;
    const kpis = [
      ['Total proyectado', numeroAnimado(Math.round(totalEstimado)), `${signed(totalEstimado / totalPrevio - 1)} vs. últimos 30 días`],
      ['Error típico (MAE)', numeroAnimado(Math.round(MAE)), `Mes anterior: ${fmt(base.MAE)} · ${signed(MAE / base.MAE - 1, 1)}`],
      ['R² en prueba', numeroAnimado(R.metricas.rf['R²'], 2), `Mes anterior: ${fmt(base['R²'], 2)}`],
      ['Orden de los cafés', numeroAnimado(R.metricas.ranking_rf.Spearman, 2), `Spearman · acierta el top 3 en el ${pct(R.metricas.ranking_rf['Top 3'], 0)}`],
      ['Ventas analizadas', numeroAnimado(M.filas_base), `de ${fmt(M.filas_archivo)} del archivo`],
    ];
    $('#kpiGrid').innerHTML = kpis.map(([l, v, h]) =>
      `<article class="kpi reveal"><p class="kpi__rotulo">${l}</p><p class="kpi__valor">${v}</p><p class="kpi__pie">${h}</p></article>`).join('');
  }

  // 06 · Metodología
  function metodologia() {
    const p = R.parametros;
    const params = Object.entries(p).map(([k, v]) => `${k} = ${v === null ? 'None' : v}`).join(', ');
    const pasos = [
      ['Datos', `El archivo tiene ${fmt(M.filas_archivo)} filas y 6 columnas. Se trabaja con la base de la Etapa 1: bloque A y solo pagos con tarjeta (${fmt(M.filas_base)} filas), por ser la captura más consistente.`],
      ['Preparación', `La base no tiene nulos. Se conservan ${fmt(M.duplicados_base)} duplicados exactos, que sin ID de transacción no se distinguen de compras repetidas. Los días sin registros cuentan como días sin ventas y el café se codifica con one-hot.`],
      ['Ingeniería de características', 'Diez variables calculadas solo con el pasado de cada fecha de corte: compras e ingresos recientes, precio vigente, tendencia, participación y mezcla horaria y semanal, más el café codificado.'],
      ['Variable objetivo', `Rentabilidad = Σ (precio × cantidad) de cada café en los ${M.horizonte_dias} días siguientes. Es un ingreso bruto: el dataset no tiene costos.`],
      ['Partición temporal', `${M.n_fechas_corte} fechas de corte semanales × ${M.n_cafes} cafés. Entrenamiento: ${M.n_entrenamiento} filas; prueba: ${M.n_prueba} filas del período más reciente, con ${M.horizonte_dias} días de separación entre ambos.`],
      ['Optimización', `GridSearchCV evaluó ${M.combinaciones} combinaciones de n_estimators, max_depth, min_samples_split y min_samples_leaf con validación cruzada temporal. Mejor configuración: ${params}. MAE de validación: ${fmt(R.mae_validacion_cruzada)}.`],
      ['Evaluación', 'MAE, RMSE y R² en la prueba, comparados con un modelo base que repite los 30 días anteriores y con una regresión lineal de referencia. También se mide si el orden de los cafés coincide con la realidad (Spearman y acierto en el top 3).'],
      ['Predicción', `Se reentrena el mejor modelo con todas las fechas de corte y se predice desde el ${fecha(M.fecha_ultimo_dato)}. Solo el Random Forest genera las predicciones.`],
    ];
    const cont = $('#metodo');
    cont.innerHTML = pasos.map(([t, d], i) => `
      <div class="paso${i === 0 ? ' is-open' : ''}" role="listitem">
        <button class="paso__btn" type="button" aria-expanded="${i === 0}" aria-controls="paso${i}">
          <span class="paso__n">${String(i + 1).padStart(2, '0')}</span><span class="paso__titulo">${esc(t)}</span><span class="paso__chev" aria-hidden="true"></span>
        </button>
        <div class="paso__cuerpo" id="paso${i}"><div class="paso__interior"><p>${esc(d)}</p></div></div>
      </div>`).join('');
    cont.addEventListener('click', (e) => {
      const btn = e.target.closest('.paso__btn');
      if (!btn) return;
      const paso = btn.parentElement, abrir = !paso.classList.contains('is-open');
      $$('.paso', cont).forEach((s) => { s.classList.remove('is-open'); $('.paso__btn', s).setAttribute('aria-expanded', 'false'); });
      if (abrir) { paso.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); }
    });
  }

  // 07 · Métricas del modelo
  function metricas() {
    const rf = R.metricas.rf, base = R.metricas.base;
    $('#metricasLead').textContent =
      `En el período de prueba (${M.n_prueba} filas) el Random Forest ${mejora >= 0 ? 'reduce' : 'aumenta'} el MAE en ${pct(Math.abs(mejora))} frente al modelo base, con un ajuste moderado (R² de ${fmt(rf['R²'], 2)}).`;

    const tarjeta = (titulo, valor, ref, menorMejor, dec, ayuda) => {
      const dif = menorMejor ? 1 - valor / ref : valor - ref;
      const bueno = dif > 0;
      const txt = menorMejor ? `${bueno ? '−' : '+'}${pct(Math.abs(dif))} vs. base` : `${bueno ? '+' : '−'}${fmt(Math.abs(dif), 2)} vs. base`;
      return `<article class="metrica reveal"><p class="metrica__rotulo">${titulo}</p>
        <p class="metrica__valor">${numeroAnimado(valor, dec)}</p>
        <p class="metrica__delta">Modelo base: ${fmt(ref, dec)}<strong class="${bueno ? 'mejor' : 'peor'}">${txt}</strong></p>
        <p class="metrica__ayuda">${ayuda}</p></article>`;
    };
    $('#metricGrid').innerHTML =
      tarjeta('MAE', rf.MAE, base.MAE, true, 0, 'Error medio absoluto por café y mes, en unidades monetarias.') +
      tarjeta('RMSE', rf.RMSE, base.RMSE, true, 0, 'Penaliza más los errores grandes.') +
      tarjeta('R²', rf['R²'], base['R²'], false, 2, 'Parte de la variación explicada (1 es perfecto).');

    const filas = [
      ['Random Forest (prueba)', rf, R.metricas.ranking_rf, true],
      ['Modelo base (prueba)', base, R.metricas.ranking_base, false],
      ['Random Forest (entrenamiento)', R.metricas.entrenamiento, null, false],
    ];
    $('#tablaMetricas tbody').innerHTML = filas.map(([n, m, rk, destacado]) =>
      `<tr${destacado ? ' class="es-top"' : ''}><td>${n}</td><td>${fmt(m.MAE)}</td><td>${fmt(m.RMSE)}</td><td>${fmt(m['R²'], 2)}</td>` +
      `<td>${rk ? fmt(rk.Spearman, 2) : '—'}</td><td>${rk ? pct(rk['Top 3'], 0) : '—'}</td></tr>`).join('');

    const host = $('#chartPrueba'), sel = $('#cafeFiltro'), wrap = $('#cafeFiltroWrap'), nota = $('#notaPrueba');
    const cafes = [...new Set(R.prueba.puntos.map((p) => p.cafe))].sort();
    sel.innerHTML = '<option value="todos">Todos los cafés</option>' + cafes.map((c) => `<option>${esc(c)}</option>`).join('');
    let vista = 'dispersion';
    const dibujar = () => {
      wrap.classList.toggle('is-disabled', vista !== 'dispersion');
      if (vista === 'dispersion') {
        const pts = R.prueba.puntos.filter((p) => sel.value === 'todos' || p.cafe === sel.value);
        dispersion(host, pts);
        nota.textContent = 'Cada punto es un café en una fecha de corte. Los puntos sobre la diagonal serían predicciones perfectas.';
      } else {
        const t = R.prueba.totales;
        lineas(host, t.fechas, [
          { nombre: 'Real', color: '#f0e6d6', valores: t.real },
          { nombre: 'Random Forest', color: COLOR_MODELO['Random Forest'], valores: t.rf },
          { nombre: 'Modelo base', color: '#8f877b', valores: t.base, discontinua: true },
        ], { etiquetaFmt: (f) => fecha(f).slice(0, 5) });
        nota.textContent = 'Suma de los ocho cafés por fecha de corte: muestra cuánto sigue el modelo el nivel real y dónde se aleja.';
      }
    };
    registrar(host, dibujar);
    sel.addEventListener('change', dibujar);
    $('#vistaPrueba').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      vista = b.dataset.vista;
      $$('#vistaPrueba button').forEach((x) => x.classList.toggle('is-active', x === b));
      dibujar();
    });
  }

  // 08 · Comparación de modelos (Random Forest vs. Linear Regression)
  function comparacion() {
    const C = R.comparacion;
    if (!C) {
      const sec = $('#modelos'); if (sec) sec.remove();
      const enlace = $('a[href="#modelos"]'); if (enlace) enlace.remove();
      return;
    }
    const [A, B] = C.modelos, m = C.metricas, rec = C.recomendado;
    $('#modelosLead').textContent = `Se incorporó ${B} como modelo de referencia para validar si ${A}, el modelo principal, es realmente la mejor alternativa. Ambos usan las mismas variables y la misma partición temporal.`;

    // Modelo recomendado y criterios de decisión
    $('#winner').innerHTML = `
      <div>
        <p class="veredicto__sello">Modelo recomendado para producción</p>
        <h3 class="veredicto__nombre">${esc(rec)}</h3>
        <p class="veredicto__motivo">${esc(C.motivo)}</p>
      </div>
      <div>
        <div class="veredicto__datos">
          <div><span>Modelo más preciso (R²)</span><strong>${esc(C.mas_preciso)}</strong></div>
          <div><span>Modelo con menor error (MAE)</span><strong>${esc(C.menor_error)}</strong></div>
        </div>
        <ul class="votos" aria-label="Criterios de decisión">
          ${C.votos.map((v) => `<li class="${v.ganador === rec ? 'gana' : ''}"><span>${esc(v.criterio)}</span><b>${esc(v.ganador)}</b></li>`).join('')}
        </ul>
      </div>`;

    // Filas comparables: [rótulo, clave, formato, mejor modelo]
    const mayor = (k) => (m[A][k] >= m[B][k] ? A : B);
    const filas = [
      ['MAE', 'MAE', (v) => fmt(v, 1), C.mejores['MAE']],
      ['RMSE', 'RMSE', (v) => fmt(v, 1), C.mejores['RMSE']],
      ['R²', 'R2', (v) => fmt(v, 3), C.mejores['R²']],
      ['Entrenamiento (s)', 't_entrenamiento_s', (v) => fmt(v, 3), C.mejores['Entrenamiento (s)']],
      ['Predicción (ms)', 't_prediccion_ms', (v) => fmt(v, 1), C.mejores['Predicción (ms)']],
      ['Spearman (orden de cafés)', 'Spearman', (v) => fmt(v, 2), mayor('Spearman')],
      ['Acierto del top 3', 'Top 3', (v) => pct(v, 0), mayor('Top 3')],
    ];

    $('#modelCards').innerHTML = [A, B].map((n) => `
      <article class="ficha reveal${n === rec ? ' is-recomendada' : ''}">
        <header class="ficha__cabeza">
          <span class="ficha__punto" style="background:${colorModelo(n)}"></span>
          <h3>Métricas del ${esc(n)}</h3>${n === rec ? '<span class="etiqueta etiqueta--top">Recomendado</span>' : ''}
        </header>
        <dl class="ficha__lista">
          ${filas.map(([et, k, f, mejor]) => `<div><dt>${et}</dt><dd class="${mejor === n ? 'mejor' : ''}">${f(m[n][k])}</dd></div>`).join('')}
        </dl>
      </article>`).join('');

    $('#tablaModelos thead').innerHTML = `<tr><th scope="col">Métrica</th><th scope="col">${esc(A)}</th><th scope="col">${esc(B)}</th><th scope="col">Mejor</th></tr>`;
    $('#tablaModelos tbody').innerHTML = filas.map(([et, k, f, mejor]) =>
      `<tr><td>${et}</td><td class="${mejor === A ? 'mejor' : ''}">${f(m[A][k])}</td><td class="${mejor === B ? 'mejor' : ''}">${f(m[B][k])}</td><td>${esc(mejor)}</td></tr>`).join('');

    // Barras comparativas de MAE, RMSE y R²
    const mini = (id, clave, formato, eje) => {
      const host = $(id);
      registrar(host, () => barrasH(host, [A, B].map((n) => ({ etiqueta: n, valores: [m[n][clave]] })), [{ name: clave, color: PALETA.cobre }],
        { fmt: formato, ejeFmt: eje, colorFn: (v, f) => colorModelo(f.etiqueta) }));
    };
    mini('#chartMAE', 'MAE', (v) => fmt(v, 0), (v) => fmt(v, 0));
    mini('#chartRMSE', 'RMSE', (v) => fmt(v, 0), (v) => fmt(v, 0));
    mini('#chartR2', 'R2', (v) => fmt(v, 3), (v) => fmt(v, 2));

    // Evidencia: desempeño relativo y estabilidad por pliegue
    const host = $('#chartModelos'), nota = $('#notaModelos');
    let vista = 'relativo';
    const relativo = (k, menorMejor) => {
      const vals = [m[A][k], m[B][k]];
      const mejor = menorMejor ? Math.min(...vals) : Math.max(...vals);
      return vals.map((v) => (menorMejor ? (v > 0 ? mejor / v : 0) : (mejor > 0 ? Math.max(0, v) / mejor : 0)));
    };
    const series = [{ name: A, color: colorModelo(A) }, { name: B, color: colorModelo(B) }];
    const dibujar = () => {
      if (vista === 'relativo') {
        const rel = [['MAE', 'MAE', true], ['RMSE', 'RMSE', true], ['R²', 'R2', false], ['Spearman', 'Spearman', false], ['Acierto top 3', 'Top 3', false]];
        barrasH(host, rel.map(([et, k, menor]) => ({ etiqueta: et, valores: relativo(k, menor) })), series, { fmt: (v) => pct(v, 0), ejeFmt: (v) => pct(v, 0), max: 1 });
        nota.textContent = 'Cada barra se expresa como porcentaje del mejor valor de esa métrica (100 % = mejor modelo). Los dos modelos quedan muy cerca en el error de prueba y se separan en el orden de los cafés.';
      } else {
        const cv = C.cv;
        barrasH(host, cv.pliegues.map((p, i) => ({ etiqueta: `Pliegue ${p} (${cv.filas_entrenamiento[i]} filas)`, valores: [cv[A][i], cv[B][i]] })), series, { fmt: (v) => fmt(v, 0) });
        const b = C.bootstrap, incluyeCero = b.ic95[0] <= 0 && b.ic95[1] >= 0;
        nota.textContent = `MAE por pliegue de la validación cruzada temporal; los primeros pliegues tienen pocas filas de entrenamiento. En prueba, la diferencia de MAE (${A} − ${B}) es ${fmt(b.diferencia_mae, 1)} con IC 95 % [${fmt(b.ic95[0], 1)}; ${fmt(b.ic95[1], 1)}], que ${incluyeCero ? 'incluye' : 'no incluye'} el cero.`;
      }
    };
    registrar(host, dibujar);
    $('#vistaModelos').addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      vista = btn.dataset.vm;
      $$('#vistaModelos button').forEach((x) => x.classList.toggle('is-active', x === btn));
      dibujar();
    });

    $('#conclusionModelos').innerHTML = rich(C.conclusion);
  }

  // 09 · Importancia de variables
  function importancia() {
    const lider = imp('final').slice(0, 2).map((v) => etiqueta(v.variable).toLowerCase());
    $('#impLead').textContent = `El modelo se apoya sobre todo en ${lider[0]} y en ${lider[1]}. Cambiá la vista para comparar tres formas de medir la importancia.`;
    const notas = {
      final: 'Peso relativo de cada variable en el modelo final, el que genera la predicción de negocio. Las variables son señales del modelo, no causas.',
      interna: 'Peso relativo en el modelo evaluado con el período de prueba (entrenado solo con el pasado).',
      permutacion: 'Aumento del error (MAE) en la prueba al desordenar cada variable: cuanto mayor, más depende el modelo de ella.',
    };
    const host = $('#chartImp');
    let modo = 'final';
    const dibujar = () => {
      const datos = [...imp(modo)].sort((a, b) => b.valor - a.valor);
      const esPerm = modo === 'permutacion';
      barrasH(host, datos.map((d) => ({ etiqueta: etiqueta(d.variable), valores: [d.valor] })), [{ name: esPerm ? 'Aumento del MAE' : 'Importancia', color: PALETA.cobre }], {
        fmt: (v) => (esPerm ? fmt(v, 0) : pct(v, 1)),
        ejeFmt: (v) => (esPerm ? fmt(v, 0) : pct(v, 0)),
        colorFn: (v) => (v < 0 ? PALETA.alerta : PALETA.cobre),
      });
      $('#impNota').textContent = notas[modo];
    };
    registrar(host, dibujar);
    $('#vistaImp').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      modo = b.dataset.imp;
      $$('#vistaImp button').forEach((x) => x.classList.toggle('is-active', x === b));
      dibujar();
    });
  }

  // 10 · Café más rentable esperado: explicación y carta
  function prediccion() {
    $('#predLead').textContent = `Predicción para el ${fecha(M.inicio_prediccion)} al ${fecha(M.fin_prediccion)}, generada exclusivamente con el Random Forest.`;
    const lider = imp('final').slice(0, 2).map((v) => etiqueta(v.variable).toLowerCase());
    const top3 = ranking.slice(0, 3).map((r) => r.cafe).join(', ');
    $('#spotlight').innerHTML = `
      <h3>¿Qué explica la predicción para ${esc(top.cafe)}?</h3>
      <p>Las variables más influyentes del modelo son ${esc(lider[0])} y ${esc(lider[1])}. Estos son los indicadores de ${esc(top.cafe)} en el último mes:</p>
      <div class="indicadores">
        <div class="indicador"><p class="indicador__rotulo">Participación en compras</p><p class="indicador__valor">${pct(top.participacion)}</p></div>
        <div class="indicador"><p class="indicador__rotulo">Ingresos últimos 30 d</p><p class="indicador__valor">${fmt(top.ultimos_30d)}</p></div>
        <div class="indicador"><p class="indicador__rotulo">Compras últimos 30 d</p><p class="indicador__valor">${fmt(top.compras_30d)}</p></div>
        <div class="indicador"><p class="indicador__rotulo">Tendencia 7 d vs. 30 d</p><p class="indicador__valor">${fmt(top.tendencia, 2)}</p></div>
      </div>
      <p class="aclaracion">La ventaja sobre ${esc(segundo.cafe)} es de ${fmt(brecha)} u. m. (${fmt(brecha / MAE, 1)} veces el error típico) y sus rangos entre árboles ${solapan ? 'se superponen' : 'no se superponen'}: conviene tomarlo como líder más probable dentro del grupo prioritario (${esc(top3)}).</p>`;

    $('#carta').innerHTML = ranking.map((r) =>
      `<li class="carta__fila${r.puesto === 1 ? ' es-primero' : ''}"><span class="carta__n">${String(r.puesto).padStart(2, '0')}</span><span class="carta__nombre">${esc(r.cafe)}</span><span class="carta__puntos" aria-hidden="true"></span><span class="carta__valor">${fmt(r.estimada)}</span><span class="carta__peso">${pct(r.peso, 1)}</span></li>`).join('');
  }

  // 11 · Ranking: gráfico, tabla dinámica y evolución mensual
  function rankingSeccion() {
    const host = $('#chartRanking'), nota = $('#notaRanking');
    let metrica = 'comparacion';
    const filas = () => ranking.map((r) => ({ etiqueta: `${r.puesto}. ${r.cafe}`, r, valores: [] }));
    const dibujar = () => {
      if (metrica === 'comparacion') {
        const f = filas().map((x) => ({ ...x, valores: [x.r.estimada, x.r.ultimos_30d] }));
        barrasH(host, f, [{ name: 'Estimada (próximos 30 días)', color: PALETA.cobre }, { name: 'Últimos 30 días', color: '#6f665b' }], { fmt: (v) => fmt(v) });
        nota.textContent = 'Barras de cobre: estimación del Random Forest. Barras de piedra: lo obtenido en los últimos 30 días.';
      } else if (metrica === 'peso') {
        const f = filas().map((x) => ({ ...x, valores: [x.r.peso] }));
        barrasH(host, f, [{ name: 'Participación proyectada', color: PALETA.cobre }], { fmt: (v) => pct(v), ejeFmt: (v) => pct(v, 0) });
        nota.textContent = 'Participación de cada café en la rentabilidad total proyectada.';
      } else {
        const f = filas().map((x) => ({ ...x, valores: [x.r.variacion] }));
        barrasH(host, f, [{ name: 'Variación vs. últimos 30 días', color: PALETA.ok }], {
          fmt: (v) => signed(v), ejeFmt: (v) => pct(v, 0), max: 1, min: -1,
          colorFn: (v) => (v >= 0 ? PALETA.ok : PALETA.alerta),
        });
        nota.textContent = 'Las variaciones fuera de ±100 % se recortan en el gráfico (▶). ' + (baseBaja.length
          ? `${baseBaja.map((r) => `${r.cafe} tuvo solo ${r.compras_30d} compras`).join('; ')} en los últimos 30 días: su variación parte de una base muy baja.`
          : '');
      }
    };
    registrar(host, dibujar);
    $('#vistaRanking').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      metrica = b.dataset.metrica;
      $$('#vistaRanking button').forEach((x) => x.classList.toggle('is-active', x === b));
      dibujar();
    });

    // Tabla dinámica: filtros, búsqueda y orden
    const columnas = [
      ['puesto', '#', (r) => r.puesto, (r) => r.puesto],
      ['cafe', 'Café', (r) => esc(r.cafe) + (r.puesto === 1 ? '<span class="etiqueta etiqueta--top">Top</span>' : '') + (r.compras_30d < 10 ? '<span class="etiqueta etiqueta--aviso">base baja</span>' : ''), (r) => r.cafe],
      ['estimada', 'Estimada', (r) => fmt(r.estimada), (r) => r.estimada],
      ['peso', '% del total', (r) => pct(r.peso), (r) => r.peso],
      ['p10', 'Rango P10–P90', (r) => `${fmt(r.p10)} – ${fmt(r.p90)}`, (r) => r.p10],
      ['ultimos_30d', 'Últimos 30 d', (r) => fmt(r.ultimos_30d), (r) => r.ultimos_30d],
      ['variacion', 'Variación', (r) => `<span class="${r.variacion >= 0 ? 'pos' : 'neg'}">${signed(r.variacion)}</span>`, (r) => r.variacion],
      ['precio_actual', 'Precio', (r) => fmt(r.precio_actual, 2), (r) => r.precio_actual],
      ['compras_30d', 'Compras 30 d', (r) => fmt(r.compras_30d), (r) => r.compras_30d],
      ['tendencia', 'Tendencia', (r) => fmt(r.tendencia, 2), (r) => r.tendencia],
    ];
    const estado = { orden: 'puesto', dir: 1, filtro: 'todos', texto: '' };
    const thead = $('#tablaRanking thead'), tbody = $('#tablaRanking tbody');
    const dibujarTabla = () => {
      thead.innerHTML = '<tr>' + columnas.map(([k, t]) =>
        `<th scope="col" tabindex="0" data-key="${k}" aria-sort="${estado.orden === k ? (estado.dir > 0 ? 'ascending' : 'descending') : 'none'}">${t}</th>`).join('') + '</tr>';
      const col = columnas.find((c) => c[0] === estado.orden);
      const q = norm(estado.texto.trim());
      const lista = ranking
        .filter((r) => (estado.filtro === 'top3' ? r.puesto <= 3 : estado.filtro === 'suben' ? r.variacion > 0 : estado.filtro === 'bajan' ? r.variacion < 0 : true))
        .filter((r) => !q || norm(r.cafe).includes(q))
        .sort((a, b) => {
          const va = col[3](a), vb = col[3](b);
          return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * estado.dir;
        });
      tbody.innerHTML = lista.length
        ? lista.map((r) => `<tr${r.puesto === 1 ? ' class="es-top"' : ''}>${columnas.map((c) => `<td>${c[2](r)}</td>`).join('')}</tr>`).join('')
        : `<tr><td class="tabla__vacio" colspan="${columnas.length}">Ningún café coincide con el filtro.</td></tr>`;
      $('#notaTabla').textContent = `Mostrando ${lista.length} de ${ranking.length} cafés. “Base baja”: menos de 10 compras en los últimos 30 días. Hacé clic en un encabezado para ordenar.`;
    };
    const ordenar = (k) => { estado.dir = estado.orden === k ? -estado.dir : 1; estado.orden = k; dibujarTabla(); };
    thead.addEventListener('click', (e) => { const th = e.target.closest('th'); if (th) ordenar(th.dataset.key); });
    thead.addEventListener('keydown', (e) => { if (e.key !== 'Enter' && e.key !== ' ') return; const th = e.target.closest('th'); if (th) { e.preventDefault(); ordenar(th.dataset.key); } });
    $('#filtroTabla').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      estado.filtro = b.dataset.filtro;
      $$('#filtroTabla .chip').forEach((x) => x.classList.toggle('is-active', x === b));
      dibujarTabla();
    });
    $('#buscar').addEventListener('input', (e) => { estado.texto = e.target.value; dibujarTabla(); });
    dibujarTabla();

    historico();
  }

  // Evolución mensual con filtros por café
  function historico() {
    const H = R.historico, cafes = Object.keys(H.series);
    const activos = new Set(ranking.slice(0, 3).map((r) => r.cafe));
    const chips = $('#chipsHistorico'), host = $('#chartHistorico');
    const pintarChips = () => {
      chips.innerHTML = cafes.map((c) => `<button type="button" class="chip${activos.has(c) ? ' is-active' : ''}" data-cafe="${esc(c)}" aria-pressed="${activos.has(c)}"><span class="chip__punto" style="background:${colorCafe(c)}"></span>${esc(c)}</button>`).join('') +
        `<button type="button" class="chip" data-cafe="__todos">Todos</button>`;
    };
    const dibujar = () => {
      const series = cafes.filter((c) => activos.has(c)).map((c) => ({ nombre: c, color: colorCafe(c), valores: H.series[c] }));
      if (!series.length) { host.innerHTML = '<p class="nota">Seleccioná al menos un café.</p>'; return; }
      lineas(host, H.meses, series, { etiquetaFmt: mesCorto });
    };
    pintarChips();
    registrar(host, dibujar);
    chips.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const c = b.dataset.cafe;
      if (c === '__todos') cafes.forEach((x) => activos.add(x));
      else if (activos.has(c)) activos.delete(c); else activos.add(c);
      pintarChips(); dibujar();
    });
    const [anio, mes, dia] = M.fecha_ultimo_dato.split('-').map(Number);
    const diasMes = new Date(anio, mes, 0).getDate();
    $('#notaHistorico').textContent = dia < diasMes
      ? `El último mes (${mesCorto(H.meses[H.meses.length - 1])}) incluye solo ${dia} días de datos.` : '';
  }

  // 12 y 13 · Hallazgos y conclusiones
  function cierre() {
    $('#hallazgosGrid').innerHTML = R.hallazgos.map((h) => `<li class="reveal"><p>${rich(h)}</p></li>`).join('');
    $('#conclusionesTexto').innerHTML = R.conclusiones.map((p) => `<p class="reveal">${rich(p)}</p>`).join('');
    const p = Object.entries(R.parametros).map(([k, v]) => `${k}=${v === null ? 'None' : v}`).join(', ');
    $('#footerMeta').textContent = `Datos hasta el ${fecha(M.fecha_ultimo_dato)} · RandomForestRegressor (${p})`;
  }

  /* ================= Navegación, escena y animaciones ================= */
  function navegacion() {
    const nav = $('#nav'), btn = $('#menuBtn'), cabecera = $('#cabecera'), escena = $('#escena');
    const alternarMenu = (abierto) => {
      nav.classList.toggle('is-open', abierto);
      btn.setAttribute('aria-expanded', String(abierto));
      btn.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
      document.body.style.overflow = abierto ? 'hidden' : '';
    };
    btn.addEventListener('click', () => alternarMenu(!nav.classList.contains('is-open')));
    $$('a', nav).forEach((a) => a.addEventListener('click', () => alternarMenu(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') alternarMenu(false); });

    const enlaces = $$('a', nav).map((a) => ({ a, sec: $(a.getAttribute('href')) })).filter((x) => x.sec);
    const barra = $('#progress');
    let pendiente = false;
    const actualizar = () => {
      pendiente = false;
      const y = window.scrollY, max = document.documentElement.scrollHeight - window.innerHeight;
      barra.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';
      cabecera.classList.toggle('is-solida', y > 24);
      // La fotografía se oscurece y se desplaza apenas al avanzar: de portada a lectura
      const t = Math.min(1, y / (window.innerHeight * 0.9));
      escena.style.setProperty('--oscuridad', (t * 0.4).toFixed(3));
      escena.style.setProperty('--desplazamiento', `${Math.min(y * 0.035, 40).toFixed(1)}px`);
      let actual = enlaces[0];
      enlaces.forEach((x) => { if (x.sec.getBoundingClientRect().top <= 140) actual = x; });
      enlaces.forEach((x) => x.a.classList.toggle('is-active', x === actual));
    };
    window.addEventListener('scroll', () => { if (!pendiente) { pendiente = true; requestAnimationFrame(actualizar); } }, { passive: true });
    actualizar();
  }

  function revelar() {
    const nodos = $$('.reveal');
    const mostrar = (n) => { n.classList.add('is-visible'); $$('[data-count]', n).forEach(animarNumero); };
    if (!('IntersectionObserver' in window)) { nodos.forEach(mostrar); return; }
    const obs = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => { if (e.isIntersecting) { mostrar(e.target); obs.unobserve(e.target); } });
    }, { threshold: 0.1, rootMargin: '0px 0px -4% 0px' });
    nodos.forEach((n) => obs.observe(n));
  }

  /* ================= Inicio ================= */
  resumen();
  metodologia();
  metricas();
  comparacion();
  importancia();
  prediccion();
  rankingSeccion();
  cierre();
  navegacion();
  revelar();
})();
