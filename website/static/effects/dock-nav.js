/**
 * Dock — vanilla JS magnification nav (React Bits Dock port)
 */
(function (global) {
  function springStep(current, target, velocity, config) {
    const { stiffness = 150, damping = 12, mass = 0.1 } = config;
    const force = -stiffness * (current - target);
    const dampingForce = -damping * velocity;
    const acceleration = (force + dampingForce) / mass;
    velocity += acceleration * 0.016;
    current += velocity * 0.016;
    return { current, velocity };
  }

  function DockNav(panelEl, options) {
    this.panel = panelEl;
    this.items = panelEl.querySelectorAll('.dock-item');
    this.options = Object.assign({
      baseSize: 44,
      magnification: 62,
      distance: 120,
      spring: { mass: 0.1, stiffness: 150, damping: 12 },
    }, options);
    this.sizes = [];
    this.velocities = [];
    this.mouseY = Infinity;
    this.hovered = false;
    this.raf = null;

    for (let i = 0; i < this.items.length; i++) {
      this.sizes[i] = this.options.baseSize;
      this.velocities[i] = 0;
    }

    this._onMove = this._onMove.bind(this);
    this._onLeave = this._onLeave.bind(this);
    this._tick = this._tick.bind(this);

    this.panel.addEventListener('mousemove', this._onMove);
    this.panel.addEventListener('mouseleave', this._onLeave);
    this.raf = requestAnimationFrame(this._tick);
  }

  DockNav.prototype._onMove = function (e) {
    if (!this.hovered) {
      this.hovered = true;
      this.itemCenters = Array.from(this.items).map(item => {
        const rect = item.getBoundingClientRect();
        return rect.top + rect.height / 2;
      });
    }
    this.mouseY = e.clientY;
  };

  DockNav.prototype._onLeave = function () {
    this.hovered = false;
    this.mouseY = Infinity;
    this.itemCenters = null;
  };

  DockNav.prototype._tick = function () {
    const { baseSize, magnification, distance } = this.options;
    this.items.forEach((item, i) => {
      let target = baseSize;
      if (this.hovered && this.mouseY !== Infinity && this.itemCenters && this.itemCenters[i]) {
        const centerY = this.itemCenters[i];
        const dist = Math.abs(this.mouseY - centerY);
        if (dist < distance) {
          const t = 1 - dist / distance;
          target = baseSize + (magnification - baseSize) * t * t;
        }
      }
      const result = springStep(this.sizes[i], target, this.velocities[i], this.options.spring);
      this.sizes[i] = result.current;
      this.velocities[i] = result.velocity;
      const s = Math.round(this.sizes[i]);
      item.style.width = s + 'px';
      item.style.height = s + 'px';
    });
    this.raf = requestAnimationFrame(this._tick);
  };

  DockNav.prototype.destroy = function () {
    cancelAnimationFrame(this.raf);
    this.panel.removeEventListener('mousemove', this._onMove);
    this.panel.removeEventListener('mouseleave', this._onLeave);
  };

  global.DockNav = DockNav;
})(window);
