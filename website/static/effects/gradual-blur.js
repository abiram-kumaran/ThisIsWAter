/**
 * GradualBlurScroll — scroll-driven edge blur overlays.
 *
 * Fixed at top/bottom of viewport. Uses stacked backdrop-filter layers
 * with CSS mask-image to create a smooth blur gradient.
 *
 * Key fixes vs original port:
 *  - mask uses white (visible) not black (hidden)
 *  - outer wrapper has NO overflow:hidden so backdrop-filter isn't clipped
 *  - bottom overlay is always visible (opacity 1) immediately, no fade-in delay
 *  - top overlay fades in after scrolling 80px
 */
(function () {
  'use strict';

  var CURVE_FN = {
    linear:        function (p) { return p; },
    bezier:        function (p) { return p * p * (3 - 2 * p); },
    'ease-in':     function (p) { return p * p; },
    'ease-out':    function (p) { return 1 - Math.pow(1 - p, 2); },
    'ease-in-out': function (p) { return p < 0.5 ? 2*p*p : 1 - Math.pow(-2*p+2,2)/2; }
  };

  function buildLayers(position, strength, divCount, exponential, curve) {
    var increment = 100 / divCount;
    var fn = CURVE_FN[curve] || CURVE_FN.bezier;
    // gradient direction: for bottom overlay we want blur at the bottom edge,
    // so the mask reveals (white) toward the edge and hides (transparent) toward content
    // position='bottom' → blur near bottom → mask direction 'to top' so bottom=visible
    var dir = position === 'bottom' ? 'to top' : 'to bottom';
    var frag = document.createDocumentFragment();

    for (var i = 1; i <= divCount; i++) {
      var progress = fn(i / divCount);
      var blurVal = exponential
        ? Math.pow(2, progress * 4) * 0.0625 * strength
        : 0.0625 * (progress * divCount + 1) * strength;

      var p1 = +((increment * i - increment)).toFixed(1);
      var p2 = +((increment * i)).toFixed(1);
      var p3 = +((increment * i + increment)).toFixed(1);
      var p4 = +((increment * i + increment * 2)).toFixed(1);

      // white = show the blur, transparent = hide it
      var gradient = 'transparent ' + p1 + '%, white ' + p2 + '%';
      if (p3 <= 100) gradient += ', white ' + p3 + '%';
      if (p4 <= 100) gradient += ', transparent ' + p4 + '%';

      var mask  = 'linear-gradient(' + dir + ', ' + gradient + ')';
      var blur  = blurVal.toFixed(3) + 'rem';

      var layer = document.createElement('div');
      layer.style.cssText =
        'position:absolute;inset:0;' +
        '-webkit-mask-image:' + mask + ';' +
        'mask-image:'         + mask + ';' +
        '-webkit-backdrop-filter:blur(' + blur + ');' +
        'backdrop-filter:blur(' + blur + ');';
      frag.appendChild(layer);
    }
    return frag;
  }

  function GradualBlurScroll(opts) {
    var o = Object.assign({
      strength:     4,
      height:       '120px',
      divCount:     9,
      exponential:  true,
      curve:        'bezier',
      zIndex:       9000,
      showTopAfter: 80,
    }, opts || {});

    this._o = o;
    this._bottom = this._make('bottom');
    this._top    = this._make('top');
    this._overlays = [this._bottom, this._top];

    this._onScroll = this._tick.bind(this);
    window.addEventListener('scroll', this._onScroll, { passive: true });
    this._tick();
  }

  GradualBlurScroll.prototype._make = function (position) {
    var o = this._o;
    var el = document.createElement('div');

    // IMPORTANT: no overflow:hidden — that kills backdrop-filter
    el.style.cssText =
      'position:fixed;' +
      (position === 'bottom' ? 'bottom:0;' : 'top:0;') +
      'left:0;right:0;' +
      'height:' + o.height + ';' +
      'pointer-events:none;' +
      'z-index:' + o.zIndex + ';' +
      'opacity:' + (position === 'bottom' ? '1' : '0') + ';' +
      'transition:opacity 0.3s ease;' +
      'will-change:opacity;';

    // inner wrapper — position relative so absolute children work
    var inner = document.createElement('div');
    inner.style.cssText = 'position:relative;width:100%;height:100%;';
    inner.appendChild(buildLayers(position, o.strength, o.divCount, o.exponential, o.curve));

    el.appendChild(inner);
    document.body.appendChild(el);
    return el;
  };

  GradualBlurScroll.prototype._tick = function () {
    var sy  = window.scrollY || 0;
    var max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

    // bottom: always show once any scroll happened, fade out near the very end
    var nearBottom = max > 40 ? Math.min(1, (max - sy) / 60) : 1;
    this._bottom.style.opacity = nearBottom;

    // top: fade in after scrolling past threshold
    var topT = Math.max(0, Math.min(1, (sy - this._o.showTopAfter) / 50));
    this._top.style.opacity = topT;
  };

  GradualBlurScroll.prototype.show = function () {
    this._overlays.forEach(function (el) { el.style.display = ''; });
    this._tick();
  };

  GradualBlurScroll.prototype.hide = function () {
    this._overlays.forEach(function (el) { el.style.display = 'none'; });
  };

  GradualBlurScroll.prototype.destroy = function () {
    window.removeEventListener('scroll', this._onScroll);
    this._overlays.forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
  };

  window.GradualBlurScroll = GradualBlurScroll;
})();
