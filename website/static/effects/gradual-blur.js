/**
 * GradualBlur — vanilla JS port of the React Bits component.
 * No dependencies required.
 *
 * Usage:
 *   new GradualBlur(parentElement, options)
 *
 * Or auto-init via data attributes:
 *   <div data-gradual-blur="bottom" data-blur-height="6rem" data-blur-strength="2"> ... </div>
 */

(function () {
  'use strict';

  /* ── curve functions (matches React source exactly) ── */
  var CURVE_FUNCTIONS = {
    linear:       function (p) { return p; },
    bezier:       function (p) { return p * p * (3 - 2 * p); },
    'ease-in':    function (p) { return p * p; },
    'ease-out':   function (p) { return 1 - Math.pow(1 - p, 2); },
    'ease-in-out':function (p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
  };

  var DIRECTION_MAP = {
    top: 'to top', bottom: 'to bottom',
    left: 'to left', right: 'to right'
  };

  function GradualBlur(container, opts) {
    var o = Object.assign({
      position:    'bottom',
      strength:    2,
      height:      '6rem',
      width:       null,
      divCount:    5,
      exponential: false,
      curve:       'linear',
      opacity:     1,
      zIndex:      1000,
    }, opts || {});

    /* outer wrapper */
    var wrap = document.createElement('div');
    wrap.className = 'gradual-blur gradual-blur-parent';

    var isVertical   = o.position === 'top'  || o.position === 'bottom';
    var isHorizontal = o.position === 'left' || o.position === 'right';

    wrap.style.cssText = [
      'position:absolute',
      'pointer-events:none',
      'z-index:' + o.zIndex,
      isVertical   ? ('height:' + o.height)          : ('height:100%'),
      isVertical   ? ('width:'  + (o.width || '100%')): ('width:' + (o.width || o.height)),
      o.position + ':0',
      isVertical   ? 'left:0;right:0' : 'top:0;bottom:0',
    ].join(';') + ';';

    /* inner */
    var inner = document.createElement('div');
    inner.className = 'gradual-blur-inner';
    inner.style.cssText = 'position:relative;width:100%;height:100%;';

    /* build blur layers */
    var increment = 100 / o.divCount;
    var curveFunc  = CURVE_FUNCTIONS[o.curve] || CURVE_FUNCTIONS.linear;
    var direction  = DIRECTION_MAP[o.position] || 'to bottom';

    for (var i = 1; i <= o.divCount; i++) {
      var progress = curveFunc(i / o.divCount);

      var blurValue;
      if (o.exponential) {
        blurValue = Math.pow(2, progress * 4) * 0.0625 * o.strength;
      } else {
        blurValue = 0.0625 * (progress * o.divCount + 1) * o.strength;
      }

      var p1 = Math.round((increment * i - increment) * 10) / 10;
      var p2 = Math.round( increment * i              * 10) / 10;
      var p3 = Math.round((increment * i + increment) * 10) / 10;
      var p4 = Math.round((increment * i + increment * 2) * 10) / 10;

      var gradient = 'transparent ' + p1 + '%, black ' + p2 + '%';
      if (p3 <= 100) gradient += ', black ' + p3 + '%';
      if (p4 <= 100) gradient += ', transparent ' + p4 + '%';

      var maskValue = 'linear-gradient(' + direction + ', ' + gradient + ')';
      var blurStr   = blurValue.toFixed(3) + 'rem';

      var layer = document.createElement('div');
      layer.style.cssText = [
        'position:absolute',
        'inset:0',
        '-webkit-mask-image:'    + maskValue,
        'mask-image:'            + maskValue,
        '-webkit-backdrop-filter:blur(' + blurStr + ')',
        'backdrop-filter:blur('  + blurStr + ')',
        'opacity:'               + o.opacity,
      ].join(';') + ';';

      inner.appendChild(layer);
    }

    wrap.appendChild(inner);

    /* ensure container has position so absolute child works */
    var pos = window.getComputedStyle(container).position;
    if (pos === 'static') container.style.position = 'relative';

    container.appendChild(wrap);
    this.el = wrap;
  }

  GradualBlur.prototype.destroy = function () {
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
  };

  /* inject base CSS once */
  (function injectCSS() {
    if (document.getElementById('gradual-blur-styles')) return;
    var s = document.createElement('style');
    s.id = 'gradual-blur-styles';
    s.textContent = [
      '.gradual-blur { isolation: isolate; overflow: hidden; }',
      '.gradual-blur-inner { pointer-events: none; }',
      '@supports not (backdrop-filter: blur(1px)) {',
      '  .gradual-blur-inner > div { background: rgba(255,255,255,0.5); }',
      '}',
    ].join('\n');
    document.head.appendChild(s);
  })();

  window.GradualBlur = GradualBlur;
})();
