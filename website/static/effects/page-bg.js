/**
 * PageBackground — full-screen Grainient WebGL background for authenticated pages.
 * Uses the same GLSL shader as the DM effects but without any lens/refraction.
 * Depends on Three.js being loaded first.
 */
(function (global) {
  var hexToRgb = function(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return [1, 1, 1];
    return [parseInt(result[1], 16) / 255, parseInt(result[2], 16) / 255, parseInt(result[3], 16) / 255];
  };

  var vertexShader = [
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
    '}'
  ].join('\n');

  var fragmentShader = [
    'precision highp float;',
    'varying vec2 vUv;',
    'uniform vec2 iResolution;',
    'uniform float iTime;',
    'uniform float uTimeSpeed;',
    'uniform float uColorBalance;',
    'uniform float uWarpStrength;',
    'uniform float uWarpFrequency;',
    'uniform float uWarpSpeed;',
    'uniform float uWarpAmplitude;',
    'uniform float uBlendAngle;',
    'uniform float uBlendSoftness;',
    'uniform float uRotationAmount;',
    'uniform float uNoiseScale;',
    'uniform float uGrainAmount;',
    'uniform float uGrainScale;',
    'uniform float uGrainAnimated;',
    'uniform float uContrast;',
    'uniform float uGamma;',
    'uniform float uSaturation;',
    'uniform vec2 uCenterOffset;',
    'uniform float uZoom;',
    'uniform vec3 uColor1;',
    'uniform vec3 uColor2;',
    'uniform vec3 uColor3;',
    '#define S(a,b,t) smoothstep(a,b,t)',
    'mat2 Rot(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}',
    'vec2 hash(vec2 p){p=vec2(dot(p,vec2(2127.1,81.17)),dot(p,vec2(1269.5,283.37)));return fract(sin(p)*43758.5453);}',
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);float n=mix(mix(dot(-1.0+2.0*hash(i+vec2(0.0,0.0)),f-vec2(0.0,0.0)),dot(-1.0+2.0*hash(i+vec2(1.0,0.0)),f-vec2(1.0,0.0)),u.x),mix(dot(-1.0+2.0*hash(i+vec2(0.0,1.0)),f-vec2(0.0,1.0)),dot(-1.0+2.0*hash(i+vec2(1.0,1.0)),f-vec2(1.0,1.0)),u.x),u.y);return 0.5+0.5*n;}',
    'void main(){',
    '  float t = iTime * uTimeSpeed;',
    '  vec2 uv = vUv;',
    '  float ratio = iResolution.x / iResolution.y;',
    '  vec2 tuv = uv - 0.5 + uCenterOffset;',
    '  tuv.x *= ratio;',
    '  tuv /= max(uZoom, 0.001);',
    '  float degree = noise(vec2(t * 0.1, tuv.x * tuv.y) * uNoiseScale);',
    '  tuv *= Rot(radians((degree - 0.5) * uRotationAmount + 180.0));',
    '  float frequency = uWarpFrequency;',
    '  float ws = max(uWarpStrength, 0.001);',
    '  float amplitude = uWarpAmplitude / ws;',
    '  float warpTime = t * uWarpSpeed;',
    '  tuv.x += sin(tuv.y * frequency + warpTime) / amplitude;',
    '  tuv.y += sin(tuv.x * (frequency * 1.5) + warpTime) / (amplitude * 0.5);',
    '  vec3 colLav = uColor1;',
    '  vec3 colOrg = uColor2;',
    '  vec3 colDark = uColor3;',
    '  float b = uColorBalance;',
    '  float s = max(uBlendSoftness, 0.0);',
    '  mat2 blendRot = Rot(radians(uBlendAngle));',
    '  float blendX = (tuv * blendRot).x;',
    '  float edge0 = -0.3 - b - s;',
    '  float edge1 = 0.2 - b + s;',
    '  float v0 = 0.5 - b + s;',
    '  float v1 = -0.3 - b - s;',
    '  vec3 layer1 = mix(colDark, colOrg, S(edge0, edge1, blendX));',
    '  vec3 layer2 = mix(colOrg, colLav, S(edge0, edge1, blendX));',
    '  vec3 col = mix(layer1, layer2, S(v0, v1, tuv.y));',
    '  vec2 grainUv = vUv * max(uGrainScale, 0.001);',
    '  if (uGrainAnimated > 0.5) { grainUv += vec2(iTime * 0.05); }',
    '  float grain = fract(sin(dot(grainUv, vec2(12.9898, 78.233))) * 43758.5453);',
    '  col += (grain - 0.5) * uGrainAmount;',
    '  col = (col - 0.5) * uContrast + 0.5;',
    '  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));',
    '  col = mix(vec3(luma), col, uSaturation);',
    '  col = pow(max(col, 0.0), vec3(1.0 / max(uGamma, 0.001)));',
    '  col = clamp(col, 0.0, 1.0);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function PageBackground(container, options) {
    this.container = container;
    this.options = Object.assign({
      color1: '#5c3538',
      color2: '#ff5252',
      color3: '#6d3434',
      timeSpeed: 0.35,
      colorBalance: 0.0,
      warpStrength: 1.0,
      warpFrequency: 5.0,
      warpSpeed: 2.0,
      warpAmplitude: 50.0,
      blendAngle: 0.0,
      blendSoftness: 0.05,
      rotationAmount: 500.0,
      noiseScale: 2.0,
      grainAmount: 0.08,
      grainScale: 2.0,
      grainAnimated: false,
      contrast: 1.5,
      gamma: 1.0,
      saturation: 1.0,
      centerX: 0.0,
      centerY: 0.0,
      zoom: 0.9,
    }, options || {});

    this.running = false;
    this.raf = null;
    this._onResize = this._onResize.bind(this);
    this._tick = this._tick.bind(this);
    this._init();
  }

  PageBackground.prototype._getSize = function() {
    return { w: window.innerWidth, h: window.innerHeight };
  };

  PageBackground.prototype._init = function() {
    var sz = this._getSize();
    var w = sz.w, h = sz.h;
    var aspect = w / h;

    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.domElement.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;z-index:0;pointer-events:none;';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10);
    this.camera.position.z = 5;

    var rgb1 = hexToRgb(this.options.color1);
    var rgb2 = hexToRgb(this.options.color2);
    var rgb3 = hexToRgb(this.options.color3);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        iTime:           { value: 0 },
        iResolution:     { value: new THREE.Vector2(w, h) },
        uTimeSpeed:      { value: this.options.timeSpeed },
        uColorBalance:   { value: this.options.colorBalance },
        uWarpStrength:   { value: this.options.warpStrength },
        uWarpFrequency:  { value: this.options.warpFrequency },
        uWarpSpeed:      { value: this.options.warpSpeed },
        uWarpAmplitude:  { value: this.options.warpAmplitude },
        uBlendAngle:     { value: this.options.blendAngle },
        uBlendSoftness:  { value: this.options.blendSoftness },
        uRotationAmount: { value: this.options.rotationAmount },
        uNoiseScale:     { value: this.options.noiseScale },
        uGrainAmount:    { value: this.options.grainAmount },
        uGrainScale:     { value: this.options.grainScale },
        uGrainAnimated:  { value: this.options.grainAnimated ? 1.0 : 0.0 },
        uContrast:       { value: this.options.contrast },
        uGamma:          { value: this.options.gamma },
        uSaturation:     { value: this.options.saturation },
        uCenterOffset:   { value: new THREE.Vector2(this.options.centerX, this.options.centerY) },
        uZoom:           { value: this.options.zoom },
        uColor1:         { value: new THREE.Vector3(rgb1[0], rgb1[1], rgb1[2]) },
        uColor2:         { value: new THREE.Vector3(rgb2[0], rgb2[1], rgb2[2]) },
        uColor3:         { value: new THREE.Vector3(rgb3[0], rgb3[1], rgb3[2]) },
      },
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      depthWrite: false,
      depthTest: false,
    });

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2 * aspect, 2), this.material);
    this.scene.add(this.mesh);

    window.addEventListener('resize', this._onResize);
  };

  PageBackground.prototype._onResize = function() {
    var w = window.innerWidth, h = window.innerHeight;
    if (w === 0 || h === 0) return;
    var aspect = w / h;
    this.renderer.setSize(w, h);
    this.material.uniforms.iResolution.value.set(w, h);
    this.camera.left = -aspect;
    this.camera.right = aspect;
    this.camera.updateProjectionMatrix();
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.PlaneGeometry(2 * aspect, 2);
  };

  PageBackground.prototype.start = function() {
    if (this.running) return;
    this.running = true;
    this.startTime = performance.now();
    this.raf = requestAnimationFrame(this._tick);
  };

  PageBackground.prototype.stop = function() {
    this.running = false;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
  };

  PageBackground.prototype._tick = function() {
    if (!this.running) return;
    this.material.uniforms.iTime.value = (performance.now() - this.startTime) * 0.001;
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this._tick);
  };

  PageBackground.prototype.destroy = function() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  };

  global.PageBackground = PageBackground;
})(window);
