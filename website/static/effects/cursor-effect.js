/**
 * FluidGlass Cursor Effect - Vanilla JS/Three.js version
 * A lens-like cursor effect that follows the mouse with refraction
 */

(function() {
  'use strict';

  window.FluidGlassCursor = function(container, options) {
    this.container = container;
    this.options = Object.assign({
      mode: 'lens',
      scale: 0.15,
      ior: 1.15,
      thickness: 5,
      chromaticAberration: 0.1,
      anisotropy: 0.01,
      transmission: 1,
      roughness: 0
    }, options);

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.lensMesh = null;
    this.targetPosition = { x: 0, y: 0 };
    this.currentPosition = { x: 0, y: 0 };
    this.mouse = { x: 0, y: 0 };
    this.viewport = { width: 0, height: 0 };
    this.isInitialized = false;

    this.init();
  };

  window.FluidGlassCursor.prototype.init = function() {
    if (!this.container || typeof THREE === 'undefined') {
      console.warn('FluidGlassCursor: Container or THREE.js not available');
      return;
    }

    console.log('FluidGlassCursor: Initializing...');
    this.setupScene();
    this.setupCamera();
    this.setupRenderer();
    this.setupLens();
    this.setupEventListeners();
    this.animate();

    this.isInitialized = true;
    console.log('FluidGlassCursor: Initialized successfully');
  };

  window.FluidGlassCursor.prototype.setupScene = function() {
    this.scene = new THREE.Scene();
    
    // Add lighting for the glass material
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    this.scene.add(directionalLight);
  };

  window.FluidGlassCursor.prototype.setupCamera = function() {
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(15, aspect, 0.1, 1000);
    this.camera.position.set(0, 0, 20);
    
    this.updateViewport();
  };

  window.FluidGlassCursor.prototype.updateViewport = function() {
    if (!this.camera) return;
    
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.viewport.width = width;
    this.viewport.height = height;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  window.FluidGlassCursor.prototype.setupRenderer = function() {
    this.renderer = new THREE.WebGLRenderer({ 
      alpha: true, 
      antialias: true 
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0); // Transparent background
    
    this.container.appendChild(this.renderer.domElement);
  };

  window.FluidGlassCursor.prototype.setupLens = function() {
    // Create a cylinder geometry for the lens effect
    const geometry = new THREE.CylinderGeometry(1, 1, 0.5, 32);
    
    // Create a custom shader material for the glass effect
    const material = new THREE.MeshPhysicalMaterial({
      transmission: this.options.transmission,
      roughness: this.options.roughness,
      ior: this.options.ior,
      thickness: this.options.thickness,
      chromaticAberration: this.options.chromaticAberration,
      anisotropy: this.options.anisotropy,
      transparent: true,
      opacity: 1,
      metalness: 0,
      reflectivity: 0.5,
      clearcoat: 1,
      clearcoatRoughness: 0.1
    });

    this.lensMesh = new THREE.Mesh(geometry, material);
    this.lensMesh.rotation.x = Math.PI / 2;
    this.lensMesh.scale.setScalar(this.options.scale);
    
    this.scene.add(this.lensMesh);
  };

  window.FluidGlassCursor.prototype.setupEventListeners = function() {
    const updateMouse = (e) => {
      const rect = this.container.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    this.container.addEventListener('mousemove', updateMouse);
    this.container.addEventListener('touchmove', (e) => {
      if (e.touches.length > 0) {
        updateMouse(e.touches[0]);
      }
    });

    window.addEventListener('resize', () => {
      this.updateViewport();
      if (this.renderer) {
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
      }
    });
  };

  window.FluidGlassCursor.prototype.animate = function() {
    const animate = () => {
      requestAnimationFrame(animate);

      if (!this.lensMesh) return;

      // Smooth damping for cursor following
      const damping = 0.15;
      const targetX = this.mouse.x * (this.viewport.width / 2) * 0.5;
      const targetY = this.mouse.y * (this.viewport.height / 2) * 0.5;

      this.currentPosition.x += (targetX - this.currentPosition.x) * damping;
      this.currentPosition.y += (targetY - this.currentPosition.y) * damping;

      this.lensMesh.position.x = this.currentPosition.x;
      this.lensMesh.position.y = this.currentPosition.y;
      this.lensMesh.position.z = 15;

      // Subtle rotation based on movement
      this.lensMesh.rotation.z = this.currentPosition.x * 0.02;
      this.lensMesh.rotation.x = Math.PI / 2 + this.currentPosition.y * 0.02;

      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };

    animate();
  };

  window.FluidGlassCursor.prototype.destroy = function() {
    if (this.renderer) {
      this.renderer.dispose();
      if (this.container.contains(this.renderer.domElement)) {
        this.container.removeChild(this.renderer.domElement);
      }
    }
    this.isInitialized = false;
  };

})();
