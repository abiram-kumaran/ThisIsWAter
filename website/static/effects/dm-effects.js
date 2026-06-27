(function (global) {
  const hexToRgb = hex => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return [1, 1, 1];
    return [parseInt(result[1], 16) / 255, parseInt(result[2], 16) / 255, parseInt(result[3], 16) / 255];
  };

  const grainientVertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const grainientFragmentShader = `
    precision highp float;
    varying vec2 vUv;

    uniform vec2 iResolution;
    uniform float iTime;
    uniform float uTimeSpeed;
    uniform float uColorBalance;
    uniform float uWarpStrength;
    uniform float uWarpFrequency;
    uniform float uWarpSpeed;
    uniform float uWarpAmplitude;
    uniform float uBlendAngle;
    uniform float uBlendSoftness;
    uniform float uRotationAmount;
    uniform float uNoiseScale;
    uniform float uGrainAmount;
    uniform float uGrainScale;
    uniform float uGrainAnimated;
    uniform float uContrast;
    uniform float uGamma;
    uniform float uSaturation;
    uniform vec2 uCenterOffset;
    uniform float uZoom;
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    uniform vec3 uColor3;

    #define S(a,b,t) smoothstep(a,b,t)
    mat2 Rot(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}
    vec2 hash(vec2 p){p=vec2(dot(p,vec2(2127.1,81.17)),dot(p,vec2(1269.5,283.37)));return fract(sin(p)*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);float n=mix(mix(dot(-1.0+2.0*hash(i+vec2(0.0,0.0)),f-vec2(0.0,0.0)),dot(-1.0+2.0*hash(i+vec2(1.0,0.0)),f-vec2(1.0,0.0)),u.x),mix(dot(-1.0+2.0*hash(i+vec2(0.0,1.0)),f-vec2(0.0,1.0)),dot(-1.0+2.0*hash(i+vec2(1.0,1.0)),f-vec2(1.0,1.0)),u.x),u.y);return 0.5+0.5*n;}

    void main(){
      float t = iTime * uTimeSpeed;
      vec2 uv = vUv;
      float ratio = iResolution.x / iResolution.y;

      vec2 tuv = uv - 0.5 + uCenterOffset;
      tuv.x *= ratio;
      tuv /= max(uZoom, 0.001);

      float degree = noise(vec2(t * 0.1, tuv.x * tuv.y) * uNoiseScale);
      tuv *= Rot(radians((degree - 0.5) * uRotationAmount + 180.0));

      float frequency = uWarpFrequency;
      float ws = max(uWarpStrength, 0.001);
      float amplitude = uWarpAmplitude / ws;
      float warpTime = t * uWarpSpeed;
      tuv.x += sin(tuv.y * frequency + warpTime) / amplitude;
      tuv.y += sin(tuv.x * (frequency * 1.5) + warpTime) / (amplitude * 0.5);

      vec3 colLav = uColor1;
      vec3 colOrg = uColor2;
      vec3 colDark = uColor3;
      float b = uColorBalance;
      float s = max(uBlendSoftness, 0.0);
      mat2 blendRot = Rot(radians(uBlendAngle));
      float blendX = (tuv * blendRot).x;
      float edge0 = -0.3 - b - s;
      float edge1 = 0.2 - b + s;
      float v0 = 0.5 - b + s;
      float v1 = -0.3 - b - s;
      vec3 layer1 = mix(colDark, colOrg, S(edge0, edge1, blendX));
      vec3 layer2 = mix(colOrg, colLav, S(edge0, edge1, blendX));
      vec3 col = mix(layer1, layer2, S(v0, v1, tuv.y));

      vec2 grainUv = vUv * max(uGrainScale, 0.001);
      if (uGrainAnimated > 0.5) { grainUv += vec2(iTime * 0.05); }
      float grain = fract(sin(dot(grainUv, vec2(12.9898, 78.233))) * 43758.5453);
      col += (grain - 0.5) * uGrainAmount;

      col = (col - 0.5) * uContrast + 0.5;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);
      col = pow(max(col, 0.0), vec3(1.0 / max(uGamma, 0.001)));
      col = clamp(col, 0.0, 1.0);

      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const lensVertexShader = `
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec4 vScreenSpacePosition;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vViewPosition = -mvPosition.xyz;
      gl_Position = projectionMatrix * mvPosition;
      vScreenSpacePosition = gl_Position;
    }
  `;

  const lensFragmentShader = `
    precision highp float;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec4 vScreenSpacePosition;

    uniform sampler2D tBackground;
    uniform float uIor;
    uniform float uChromaticAberration;

    void main() {
      vec2 screenUv = (vScreenSpacePosition.xy / vScreenSpacePosition.w) * 0.5 + 0.5;
      vec3 normal = normalize(vNormal);
      vec3 viewDir = normalize(vViewPosition);

      vec3 refracted = refract(-viewDir, normal, 1.0 / uIor);
      vec2 refractOffset = refracted.xy * 0.12;

      vec4 color;
      color.r = texture2D(tBackground, screenUv + refractOffset * (1.0 + uChromaticAberration)).r;
      color.g = texture2D(tBackground, screenUv + refractOffset).g;
      color.b = texture2D(tBackground, screenUv + refractOffset * (1.0 - uChromaticAberration)).b;
      color.a = 1.0;

      float specular = pow(max(dot(normal, vec3(0.0, 0.0, 1.0)), 0.0), 32.0) * 0.3;
      color.rgb += vec3(specular);

      float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
      color.rgb += vec3(fresnel * 0.25);

      gl_FragColor = color;
    }
  `;

  function DMEffects(container, options) {
    this.container = container;
    this.options = Object.assign({
      color1: '#FF9FFC',
      color2: '#5227FF',
      color3: '#B497CF',
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
      grainAmount: 0.1,
      grainScale: 2.0,
      grainAnimated: false,
      contrast: 1.5,
      gamma: 1.0,
      saturation: 1.0,
      centerX: 0.0,
      centerY: 0.0,
      zoom: 0.9,
      lensIor: 1.25,
      lensChromaticAberration: 0.15,
      lensRadius: 0.18,
    }, options || {});

    this.mouse = { x: 0, y: 0 };
    this.smoothMouse = { x: 0, y: 0 };
    this.currentLensScale = 0.0;
    this.running = false;
    this.raf = null;

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onResize = this._onResize.bind(this);
    this._tick = this._tick.bind(this);

    this._init();
  }

  DMEffects.prototype._getSize = function () {
    const rect = this.container.getBoundingClientRect();
    return {
      w: rect.width  || window.innerWidth,
      h: rect.height || window.innerHeight,
    };
  };

  DMEffects.prototype._init = function () {
    const { w, h } = this._getSize();
    const aspect = w / h;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.domElement.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
    this.container.appendChild(this.renderer.domElement);

    this.scene  = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 100);
    this.camera.position.z = 10;

    this.fbo = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });

    const rgb1 = hexToRgb(this.options.color1);
    const rgb2 = hexToRgb(this.options.color2);
    const rgb3 = hexToRgb(this.options.color3);

    this.bgMaterial = new THREE.ShaderMaterial({
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
        uColor1:         { value: new THREE.Vector3(...rgb1) },
        uColor2:         { value: new THREE.Vector3(...rgb2) },
        uColor3:         { value: new THREE.Vector3(...rgb3) },
      },
      vertexShader: grainientVertexShader,
      fragmentShader: grainientFragmentShader,
      depthWrite: false,
      depthTest: false,
    });

    // Background plane sized to fill the orthographic frustum exactly
    this.bgMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * aspect, 2),
      this.bgMaterial
    );
    this.bgMesh.position.z = 0;
    this.scene.add(this.bgMesh);

    // Refraction sphere sized in NDC units
    this.lensMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tBackground:          { value: null },
        uIor:                 { value: this.options.lensIor },
        uChromaticAberration: { value: this.options.lensChromaticAberration },
      },
      vertexShader: lensVertexShader,
      fragmentShader: lensFragmentShader,
    });

    this.lensMesh = new THREE.Mesh(
      new THREE.SphereGeometry(this.options.lensRadius, 64, 64),
      this.lensMaterial
    );
    this.lensMesh.position.z = 5;
    this.lensMesh.visible = false;
    this.scene.add(this.lensMesh);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this._onResize());
      this.resizeObserver.observe(this.container);
    }
    window.addEventListener('resize', this._onResize);
    window.addEventListener('mousemove', this._onMouseMove);
  };

  DMEffects.prototype._onMouseMove = function (e) {
    const rect = this.container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const aspect = rect.width / rect.height;
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top)  / rect.height;
    this.mouse.x =  (nx * 2 - 1) * aspect;
    this.mouse.y = -(ny * 2 - 1);
  };

  DMEffects.prototype._onResize = function () {
    const { w, h } = this._getSize();
    if (w === 0 || h === 0) return;
    const aspect = w / h;

    this.renderer.setSize(w, h);
    this.fbo.setSize(w, h);
    this.bgMaterial.uniforms.iResolution.value.set(w, h);

    this.camera.left   = -aspect;
    this.camera.right  =  aspect;
    this.camera.top    =  1;
    this.camera.bottom = -1;
    this.camera.updateProjectionMatrix();

    this.bgMesh.geometry.dispose();
    this.bgMesh.geometry = new THREE.PlaneGeometry(2 * aspect, 2);
  };

  DMEffects.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.startTime = performance.now();
    this.raf = requestAnimationFrame(this._tick);
  };

  DMEffects.prototype.stop = function () {
    this.running = false;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
  };

  DMEffects.prototype._tick = function () {
    if (!this.running) return;

    const time = (performance.now() - this.startTime) * 0.001;
    this.bgMaterial.uniforms.iTime.value = time;

    this.smoothMouse.x += (this.mouse.x - this.smoothMouse.x) * 0.12;
    this.smoothMouse.y += (this.mouse.y - this.smoothMouse.y) * 0.12;
    this.lensMesh.position.set(this.smoothMouse.x, this.smoothMouse.y, 5);

    const isMessaging = document.body.classList.contains('messaging-mode');
    const targetScale = isMessaging ? 1.0 : 0.0;
    this.currentLensScale += (targetScale - this.currentLensScale) * 0.12;

    const show = this.currentLensScale > 0.01;

    // Pass 1: render BG to FBO with lens hidden
    this.lensMesh.visible = false;
    this.renderer.setRenderTarget(this.fbo);
    this.renderer.render(this.scene, this.camera);

    // Pass 2: render lens on top to screen
    if (show) {
      this.lensMesh.scale.setScalar(this.currentLensScale);
      this.lensMesh.visible = true;
      this.lensMaterial.uniforms.tBackground.value = this.fbo.texture;
    }
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);

    this.raf = requestAnimationFrame(this._tick);
  };

  DMEffects.prototype.destroy = function () {
    this.stop();
    if (this.resizeObserver) this.resizeObserver.disconnect();
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('mousemove', this._onMouseMove);
    this.renderer.dispose();
    this.fbo.dispose();
    this.bgMaterial.dispose();
    this.bgMesh.geometry.dispose();
    this.lensMaterial.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  };

  global.DMEffects = DMEffects;
})(window);
