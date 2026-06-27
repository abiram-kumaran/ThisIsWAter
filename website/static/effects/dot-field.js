/**
 * DotField — vanilla JS port of React Bits DotField
 */
(function (global) {
  const TWO_PI = Math.PI * 2;

  const THEMES = {
    light: {
      gradientFrom: 'rgba(168, 85, 247, 0.75)', // purple #A855F7
      gradientTo: 'rgba(168, 85, 247, 0.4)',
      glowColor: '#ffffff', // cursor glow white
    },
    dark: {
      gradientFrom: 'rgba(168, 85, 247, 0.45)', // purple #A855F7
      gradientTo: 'rgba(168, 85, 247, 0.2)',
      glowColor: '#000000', // cursor glow black
    },
    messaging: {
      gradientFrom: 'rgba(0, 0, 0, 0)', // fade out dots in DM mode
      gradientTo: 'rgba(0, 0, 0, 0)',
      glowColor: 'transparent',
    },
  };

  function DotField(container, options = {}) {
    this.container = container;
    this.options = Object.assign({
      dotRadius: 1.5,
      dotSpacing: 14,
      cursorRadius: 500,
      cursorForce: 0.1,
      bulgeOnly: true,
      bulgeStrength: 67,
      glowRadius: 160,
      sparkle: false,
      waveAmplitude: 0,
      theme: 'light',
    }, options);

    this.dots = [];
    this.mouse = { x: -9999, y: -9999, prevX: -9999, prevY: -9999, speed: 0 };
    this.size = { w: 0, h: 0, offsetX: 0, offsetY: 0 };
    this.glowOpacity = 0;
    this.engagement = 0;
    this.frameCount = 0;
    this.raf = null;
    this.glowId = 'dot-glow-' + Math.random().toString(36).slice(2, 9);
    this._init();
  }

  DotField.prototype._themeColors = function () {
    return THEMES[this.options.theme] || THEMES.light;
  };

  DotField.prototype.setTheme = function (theme) {
    this.options.theme = theme;
  };

  DotField.prototype._init = function () {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d', { alpha: true });
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;');
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    this.gradEl = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
    this.gradEl.setAttribute('id', this.glowId);
    defs.appendChild(this.gradEl);
    this.svg.appendChild(defs);
    this.glowCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    this.glowCircle.setAttribute('r', this.options.glowRadius);
    this.glowCircle.setAttribute('fill', 'url(#' + this.glowId + ')');
    this.glowCircle.setAttribute('style', 'opacity:0;will-change:opacity');
    this.svg.appendChild(this.glowCircle);
    this.container.appendChild(this.svg);

    this._onResize = this._debounce(this._doResize.bind(this), 100);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._tick = this._tick.bind(this);

    window.addEventListener('resize', this._onResize);
    window.addEventListener('mousemove', this._onMouseMove, { passive: true });
    this._speedInterval = setInterval(this._updateMouseSpeed.bind(this), 20);
    this._doResize();
    this.raf = requestAnimationFrame(this._tick);
  };

  DotField.prototype._debounce = function (fn, ms) {
    let t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  };

  DotField.prototype._doResize = function () {
    const rect = this.container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.size = { w, h, offsetX: rect.left + window.scrollX, offsetY: rect.top + window.scrollY };
    this._buildDots(w, h);
  };

  DotField.prototype._buildDots = function (w, h) {
    const p = this.options;
    const step = p.dotRadius + p.dotSpacing;
    const cols = Math.floor(w / step);
    const rows = Math.floor(h / step);
    const padX = (w % step) / 2;
    const padY = (h % step) / 2;
    const dots = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const ax = padX + col * step + step / 2;
        const ay = padY + row * step + step / 2;
        dots.push({ ax, ay, sx: ax, sy: ay, vx: 0, vy: 0, x: ax, y: ay });
      }
    }
    this.dots = dots;
  };

  DotField.prototype._onMouseMove = function (e) {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
  };

  DotField.prototype._updateMouseSpeed = function () {
    const m = this.mouse;
    const dx = m.prevX - m.x;
    const dy = m.prevY - m.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    m.speed += (dist - m.speed) * 0.5;
    if (m.speed < 0.001) m.speed = 0;
    m.prevX = m.x;
    m.prevY = m.y;
  };

  DotField.prototype._tick = function () {
    this.frameCount++;
    const dots = this.dots;
    const m = this.mouse;
    const { w, h } = this.size;
    const p = this.options;
    const colors = this._themeColors();
    const len = dots.length;
    const t = this.frameCount * 0.02;

    const targetEngagement = Math.min(m.speed / 5, 1);
    this.engagement += (targetEngagement - this.engagement) * 0.06;
    if (this.engagement < 0.001) this.engagement = 0;
    const eng = this.engagement;

    this.glowOpacity += (eng - this.glowOpacity) * 0.08;
    this.glowCircle.setAttribute('cx', m.x);
    this.glowCircle.setAttribute('cy', m.y);
    this.glowCircle.style.opacity = this.glowOpacity;

    const stop0 = this.gradEl.querySelector('stop[offset="0%"]') || document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    const stop1 = this.gradEl.querySelector('stop[offset="100%"]') || document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    if (!stop0.parentNode) { stop0.setAttribute('offset', '0%'); this.gradEl.appendChild(stop0); }
    if (!stop1.parentNode) { stop1.setAttribute('offset', '100%'); this.gradEl.appendChild(stop1); }
    stop0.setAttribute('stop-color', colors.glowColor);
    stop1.setAttribute('stop-color', 'transparent');

    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, colors.gradientFrom);
    grad.addColorStop(1, colors.gradientTo);
    ctx.fillStyle = grad;

    const cr = p.cursorRadius;
    const crSq = cr * cr;
    const rad = p.dotRadius / 2;
    const isBulge = p.bulgeOnly;

    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const d = dots[i];
      const dx = m.x - d.ax;
      const dy = m.y - d.ay;
      const distSq = dx * dx + dy * dy;

      if (distSq < crSq && eng > 0.01) {
        const dist = Math.sqrt(distSq);
        if (isBulge) {
          const tt = 1 - dist / cr;
          const push = tt * tt * p.bulgeStrength * eng;
          const angle = Math.atan2(dy, dx);
          d.sx += (d.ax - Math.cos(angle) * push - d.sx) * 0.15;
          d.sy += (d.ay - Math.sin(angle) * push - d.sy) * 0.15;
        } else {
          const angle = Math.atan2(dy, dx);
          const move = (500 / dist) * (m.speed * p.cursorForce);
          d.vx += Math.cos(angle) * -move;
          d.vy += Math.sin(angle) * -move;
        }
      } else if (isBulge) {
        d.sx += (d.ax - d.sx) * 0.1;
        d.sy += (d.ay - d.sy) * 0.1;
      }

      if (!isBulge) {
        d.vx *= 0.9;
        d.vy *= 0.9;
        d.x = d.ax + d.vx;
        d.y = d.ay + d.vy;
        d.sx += (d.x - d.sx) * 0.1;
        d.sy += (d.y - d.sy) * 0.1;
      }

      let drawX = d.sx;
      let drawY = d.sy;
      if (p.waveAmplitude > 0) {
        drawY += Math.sin(d.ax * 0.03 + t) * p.waveAmplitude;
        drawX += Math.cos(d.ay * 0.03 + t * 0.7) * p.waveAmplitude * 0.5;
      }

      ctx.moveTo(drawX + rad, drawY);
      ctx.arc(drawX, drawY, rad, 0, TWO_PI);
    }
    ctx.fill();

    this.raf = requestAnimationFrame(this._tick);
  };

  DotField.prototype.destroy = function () {
    cancelAnimationFrame(this.raf);
    clearInterval(this._speedInterval);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('mousemove', this._onMouseMove);
    this.container.innerHTML = '';
  };

  global.DotField = DotField;
  global.DotFieldThemes = THEMES;
})(window);
