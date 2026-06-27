/**
 * BlobCursor — vanilla JS port of the React Bits component.
 * Uses GSAP if available, otherwise falls back to requestAnimationFrame lerp.
 * Zero hard dependencies — works even if the GSAP CDN fails.
 */

class BlobCursor {
  constructor(options) {
    var defaults = {
      blobType:               'circle',
      fillColor:              '#5227FF',
      trailCount:             3,
      sizes:                  [60, 125, 75],
      innerSizes:             [20, 35,  25],
      innerColor:             'rgba(255,255,255,0.8)',
      opacities:              [0.6, 0.6, 0.6],
      shadowColor:            'rgba(0,0,0,0.75)',
      shadowBlur:             5,
      shadowOffsetX:          10,
      shadowOffsetY:          10,
      filterId:               'blob-filter-' + Math.random().toString(36).slice(2, 7),
      filterStdDeviation:     30,
      filterColorMatrixValues:'1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 35 -10',
      useFilter:              true,
      fastDuration:           0.1,
      slowDuration:           0.5,
      fastEase:               'power3.out',
      slowEase:               'power1.out',
      zIndex:                 999999,   // above everything incl. tv-boot
    };

    this.options = Object.assign({}, defaults, options || {});
    this.blobs   = [];

    // RAF-based lerp positions for each blob [x, y]
    this._pos    = [];
    this._mouseX = window.innerWidth  / 2;
    this._mouseY = window.innerHeight / 2;

    this._handleMove = this._onMove.bind(this);
    this._build();
    this._attachEvents();
    this._startRAF();
  }

  /* ─────────────────── DOM build ─────────────────── */
  _build() {
    var o = this.options;

    this.container = document.createElement('div');
    this.container.className = 'blob-container';
    this.container.style.zIndex = o.zIndex;

    /* SVG gooey filter */
    if (o.useFilter) {
      var svgNS  = 'http://www.w3.org/2000/svg';
      var svg    = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('style', 'position:absolute;width:0;height:0;pointer-events:none;overflow:hidden;');

      var filter = document.createElementNS(svgNS, 'filter');
      filter.setAttribute('id', o.filterId);
      // Make filter region large enough so blobs don't clip
      filter.setAttribute('x', '-50%');
      filter.setAttribute('y', '-50%');
      filter.setAttribute('width',  '200%');
      filter.setAttribute('height', '200%');

      var blur = document.createElementNS(svgNS, 'feGaussianBlur');
      blur.setAttribute('in',           'SourceGraphic');
      blur.setAttribute('result',       'blur');
      blur.setAttribute('stdDeviation', o.filterStdDeviation);

      var matrix = document.createElementNS(svgNS, 'feColorMatrix');
      matrix.setAttribute('in',     'blur');
      matrix.setAttribute('values', o.filterColorMatrixValues);

      filter.appendChild(blur);
      filter.appendChild(matrix);
      svg.appendChild(filter);
      this.container.appendChild(svg);
    }

    /* Blob wrapper */
    var blobMain = document.createElement('div');
    blobMain.className = 'blob-main';
    if (o.useFilter) {
      blobMain.style.filter = 'url(#' + o.filterId + ')';
    }
    this.container.appendChild(blobMain);

    /* Individual blobs */
    for (var i = 0; i < o.trailCount; i++) {
      var size      = o.sizes[i]      !== undefined ? o.sizes[i]      : 60;
      var innerSize = o.innerSizes[i] !== undefined ? o.innerSizes[i] : 20;
      var opacity   = o.opacities[i]  !== undefined ? o.opacities[i]  : 0.6;
      var radius    = o.blobType === 'circle' ? '50%' : '0%';

      var blob = document.createElement('div');
      blob.className = 'blob';
      blob.style.cssText = [
        'width:'            + size + 'px',
        'height:'           + size + 'px',
        'border-radius:'    + radius,
        'background-color:' + o.fillColor,
        'opacity:'          + opacity,
        'box-shadow:'       + o.shadowOffsetX + 'px ' + o.shadowOffsetY + 'px ' + o.shadowBlur + 'px 0 ' + o.shadowColor,
      ].join(';') + ';';

      var dot = document.createElement('div');
      dot.className = 'inner-dot';
      dot.style.cssText = [
        'width:'            + innerSize + 'px',
        'height:'           + innerSize + 'px',
        'top:'              + ((size - innerSize) / 2) + 'px',
        'left:'             + ((size - innerSize) / 2) + 'px',
        'background-color:' + o.innerColor,
        'border-radius:'    + radius,
      ].join(';') + ';';

      blob.appendChild(dot);
      blobMain.appendChild(blob);
      this.blobs.push(blob);

      // Initialise lerp positions at current mouse (centre screen)
      this._pos.push({ x: this._mouseX, y: this._mouseY });

      // Prime position so blobs aren't stuck at 0,0
      this._applyPos(blob, this._mouseX, this._mouseY, size);
    }

    document.body.appendChild(this.container);
  }

  /* ─────────────────── position helper ─────────────────── */
  _applyPos(el, x, y, size) {
    // Keep the -50% centering in JS so no CSS transform conflict
    el.style.left = (x - size / 2) + 'px';
    el.style.top  = (y - size / 2) + 'px';
  }

  /* ─────────────────── events ─────────────────── */
  _attachEvents() {
    window.addEventListener('mousemove',  this._handleMove);
    window.addEventListener('touchmove',  this._handleMove, { passive: true });
  }

  _onMove(e) {
    if (e.touches && e.touches[0]) {
      this._mouseX = e.touches[0].clientX;
      this._mouseY = e.touches[0].clientY;
    } else {
      this._mouseX = e.clientX;
      this._mouseY = e.clientY;
    }
  }

  /* ─────────────────── RAF lerp loop ─────────────────── */
  _startRAF() {
    var self    = this;
    var o       = this.options;

    // Damping: lead blob snaps fast, trail blobs follow slowly
    // Expressed as fraction per frame @60fps equivalent
    var leadDamp  = 1 - Math.pow(1 - Math.min(o.fastDuration * 10, 0.99), 1 / 60);
    var trailDamp = 1 - Math.pow(1 - Math.min(o.slowDuration * 2,  0.99), 1 / 60);

    function tick() {
      for (var i = 0; i < self.blobs.length; i++) {
        var pos  = self._pos[i];
        var damp = i === 0 ? leadDamp : trailDamp;
        var size = o.sizes[i] !== undefined ? o.sizes[i] : 60;

        // Lead blob follows mouse; trail blobs follow the one ahead
        var targetX = i === 0 ? self._mouseX : self._pos[i - 1].x;
        var targetY = i === 0 ? self._mouseY : self._pos[i - 1].y;

        pos.x += (targetX - pos.x) * damp;
        pos.y += (targetY - pos.y) * damp;

        self._applyPos(self.blobs[i], pos.x, pos.y, size);
      }
      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  /* ─────────────────── cleanup ─────────────────── */
  destroy() {
    window.removeEventListener('mousemove', this._handleMove);
    window.removeEventListener('touchmove',  this._handleMove);
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }
}

/* ── Auto-init ── */
(function () {
  function init() {
    if (document.getElementById('blob-cursor-root')) return;

    var cursor = new BlobCursor(window.blobCursorOptions || {});
    if (cursor.container) cursor.container.id = 'blob-cursor-root';
    window.blobCursor = cursor;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
