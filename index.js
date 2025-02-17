const Output = require('./src/output.js')
const loop = require('raf-loop')
const Source = require('./src/hydra-source.js')
//const GeneratorFactory = require('./src/GeneratorFactory.js')

//const RenderPasses = require('./RenderPasses.js')
// const Mouse = require('mouse-change')()
const Audio = require('./src/lib/audio.js')
const VidRecorder = require('./src/lib/video-recorder.js')
const ArrayUtils = require('./src/lib/array-utils.js')

const Synth = require('./src/create-synth.js')

// to do: add ability to pass in certain uniforms and transforms
class HydraSynth {

  constructor ({
    pb = null,
    width = 1280,
    height = 720,
    numSources = 4,
    numOutputs = 4,
    makeGlobal = true,
    autoLoop = true,
    detectAudio = true,
    enableStreamCapture = true,
    extendTransforms = {},
    canvas
  } = {}) {

    this.bpm = 60
    this.pb = pb
    this.width = width
    this.height = height
    this.time = 0
    this.makeGlobal = makeGlobal
    this.renderAll = false
    this.detectAudio = detectAudio

    this.extendTransforms = extendTransforms

    // boolean to store when to save screenshot
    this.saveFrame = false

    // if stream capture is enabled, this object contains the capture stream
    this.captureStream = null

    this.synth = undefined

    this._initCanvas(canvas)
    this._initRegl()
    this._initOutputs(numOutputs)
    this._initSources(numSources)
    this._generateGlslTransforms()
  // this._generateRenderPasses()

    this.screencap = () => {
      this.saveFrame = true
    }
    if (this.makeGlobal) window.screencap = this.screencap

    if (enableStreamCapture) {
      this.captureStream = this.canvas.captureStream(25)

      // to do: enable capture stream of specific sources and outputs
      this.vidRecorder = new VidRecorder(this.captureStream)
      if (this.makeGlobal) window.vidRecorder = this.vidRecorder
    }

    if(detectAudio) this._initAudio()

  //  this.mouse = Mouse

    if (makeGlobal) window.mouse = this.mouse
    if (makeGlobal) window.time = this.time
    if (makeGlobal) window.render = this.render.bind(this)
    if (makeGlobal) window.bpm = this._setBpm.bind(this)
    if (makeGlobal) ArrayUtils.init() // add extra functions to Array.prototype

    if(autoLoop) loop(this.tick.bind(this)).start()
  }

  getScreenImage(callback) {
    this.imageCallback = callback
    this.saveFrame = true
  }

  canvasToImage (callback) {
    const a = document.createElement('a')
    a.style.display = 'none'

    let d = new Date()
    a.download = `hydra-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}-${d.getHours()}.${d.getMinutes()}.${d.getSeconds()}.png`
    document.body.appendChild(a)
    var self = this
    this.canvas.toBlob( (blob) => {
      //  var url = window.URL.createObjectURL(blob)

        if(self.imageCallback){
          self.imageCallback(blob)
          delete self.imageCallback
        } else {
          a.href = URL.createObjectURL(blob)
          console.log(a.href)
          a.click()
        }
    }, 'image/png')
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(a.href);
    }, 300);
  }

  _initAudio () {
    const that = this
    this.audio = new Audio({
      numBins: 4,
      changeListener: ({audio}) => {
        that.a = audio.bins.map((_, index) =>
          (scale = 1, offset = 0) => () => (audio.fft[index] * scale + offset)
        )

        if (that.makeGlobal) {
          that.a.forEach((a, index) => {
            const aname = `a${index}`
            window[aname] = a
          })
        }
      }
    })
    if(this.makeGlobal) window.a = this.audio
  }
  // create main output canvas and add to screen
  _initCanvas (canvas) {
    if (canvas) {
      this.canvas = canvas
      this.width = canvas.width
      this.height = canvas.height
    } else {
      this.canvas = document.createElement('canvas')
      this.canvas.width = this.width
      this.canvas.height = this.height
      this.canvas.style.width = '100%'
      this.canvas.style.height = '100%'
      document.body.appendChild(this.canvas)
    }

    // @todo: make mouse relative to canvas position
    this.mouse = { x: 0, y: 0}
    window.addEventListener('mousemove', (e) => {
      this.mouse.prevX = this.mouse.x
      this.mouse.prevY = this.mouse.y
      this.mouse.x = e.clientX
      this.mouse.y = e.clientY
    })
    if(this.makeGlobal) {
      window.mouse = this.mouse
      window.width = this.width
      window.height = this.height
    }
  }

  _initRegl () {
    this.regl = require('regl')({
      canvas: this.canvas,
      pixelRatio: 1,
      extensions: [
        'oes_texture_half_float',
        'oes_texture_half_float_linear'
      ],
      optionalExtensions: [
        'oes_texture_float',
        'oes_texture_float_linear'
      ]})

    // This clears the color buffer to black and the depth buffer to 1
    this.regl.clear({
      color: [0, 0, 0, 1]
    })

    this.renderAll = this.regl({
      frag: `
      precision mediump float;
      varying vec2 uv;
      uniform sampler2D tex0;
      uniform sampler2D tex1;
      uniform sampler2D tex2;
      uniform sampler2D tex3;

      void main () {
        vec2 st = vec2(1.0 - uv.x, uv.y);
        st*= vec2(2);
        vec2 q = floor(st).xy*(vec2(2.0, 1.0));
        int quad = int(q.x) + int(q.y);
        st.x += step(1., mod(st.y,2.0));
        st.y += step(1., mod(st.x,2.0));
        st = fract(st);
        if(quad==0){
          gl_FragColor = texture2D(tex0, st);
        } else if(quad==1){
          gl_FragColor = texture2D(tex1, st);
        } else if (quad==2){
          gl_FragColor = texture2D(tex2, st);
        } else {
          gl_FragColor = texture2D(tex3, st);
        }

      }
      `,
      vert: `
      precision mediump float;
      attribute vec2 position;
      varying vec2 uv;

      void main () {
        uv = position;
        gl_Position = vec4(1.0 - 2.0 * position, 0, 1);
      }`,
      attributes: {
        position: [
          [-2, 0],
          [0, -2],
          [2, 2]
        ]
      },
      uniforms: {
        tex0: this.regl.prop('tex0'),
        tex1: this.regl.prop('tex1'),
        tex2: this.regl.prop('tex2'),
        tex3: this.regl.prop('tex3')
      },
      count: 3,
      depth: { enable: false }
    })

    this.renderFbo = this.regl({
      frag: `
      precision mediump float;
      varying vec2 uv;
      uniform vec2 resolution;
      uniform sampler2D tex0;

      void main () {
        gl_FragColor = texture2D(tex0, vec2(1.0 - uv.x, uv.y));
      }
      `,
      vert: `
      precision mediump float;
      attribute vec2 position;
      varying vec2 uv;

      void main () {
        uv = position;
        gl_Position = vec4(1.0 - 2.0 * position, 0, 1);
      }`,
      attributes: {
        position: [
          [-2, 0],
          [0, -2],
          [2, 2]
        ]
      },
      uniforms: {
        tex0: this.regl.prop('tex0'),
        resolution: this.regl.prop('resolution')
      },
      count: 3,
      depth: { enable: false }
    })
  }

  _initOutputs (numOutputs) {
    const self = this
    this.o = (Array(numOutputs)).fill().map((el, index) => {
      var o = new Output({regl: this.regl, width: this.width, height: this.height})
    //  o.render()
      o.id = index
      if (self.makeGlobal) window['o' + index] = o
      return o
    })

    // set default output
    this.output = this.o[0]
  }

  _initSources (numSources) {
    this.s = []
    for(var i = 0; i < numSources; i++) {
      this.createSource()
    }
  }

  _setBpm(bpm) {
    this.bpm = bpm
  }

  createSource () {
    let s = new Source({regl: this.regl, pb: this.pb, width: this.width, height: this.height})
    if(this.makeGlobal) {
      window['s' + this.s.length] = s
    }
    this.s.push(s)
    return s
  }

  _generateGlslTransforms () {
    // const self = this
    // const gen = new GeneratorFactory(this.o[0])
    // window.generator = gen
    // Object.keys(gen.functions).forEach((key)=>{
    //   self[key] = gen.functions[key]
    //   if(self.makeGlobal === true) {
    //     window[key] = gen.functions[key]
    //   }
    // })

    if (typeof this.synth === 'undefined') {
      this.synth = new Synth(this.o[0], this.extendTransforms, ({type, method, synth}) => {
        if (this.makeGlobal) {
          if (type === 'add') {
            window[method] = synth.generators[method]
          } else if (type === 'remove') {
            delete window[method]
          }
        }
      })
    } else {
      this.synth.extendTransforms = this.extendTransforms
      this.synth.init()
    }

    if (this.makeGlobal) window.synth = this.synth

   //console.log('functions', functions)
    // Object.keys(functions).forEach((key)=>{
    //   self[key] = functions[key]
    //   if(self.makeGlobal === true) {
    //     window[key] = functions[key]
    //   }
    // })
  }

  // _generateRenderPasses () {
  //     const self = this
  //     const gen = new RenderPasses({ regl: this.regl, width: this.width, height: this.height})
  //   //  window.generator = gen
  //     Object.keys(gen.functions).forEach((key)=>{
  //       self[key] = gen.functions[key]
  //       if(self.makeGlobal === true) {
  //         window[key] = gen.functions[key]
  //       }
  //     })
  // }

  render (output) {
    if (output) {
      this.output = output
      this.isRenderingAll = false
    } else {
      this.isRenderingAll = true
    }
  }

  tick (dt, uniforms) {

  //  if(self.detectAudio === true) self.fft = self.audio.frequencies()
  // this.regl.frame(function () {
    this.time += dt * 0.001
    // console.log(this.time)
    // this.regl.clear({
    //   color: [0, 0, 0, 1]
    // })
    if (this.makeGlobal) window.time = this.time
    if(this.detectAudio === true) this.audio.tick()
    for (let i = 0; i < this.s.length; i++) {
      this.s[i].tick(this.time)
    }

    for (let i = 0; i < this.o.length; i++) {
    //  console.log('WIDTH', this.canvas.width, this.o[0].getCurrent())
      this.o[i].tick({
        time: this.time,
        mouse: this.mouse,
        bpm: this.bpm,
        resolution: [this.canvas.width, this.canvas.height]
      })
    }

    // console.log("looping", self.o[0].fbo)
    if (this.isRenderingAll) {
      this.renderAll({
        tex0: this.o[0].getCurrent(),
        tex1: this.o[1].getCurrent(),
        tex2: this.o[2].getCurrent(),
        tex3: this.o[3].getCurrent(),
        resolution: [this.canvas.width, this.canvas.height]
      })
    } else {
    //  console.log('out', self.output.id)
      this.renderFbo({
        tex0: this.output.getCurrent(),
        resolution: [this.canvas.width, this.canvas.height]
      })
    }
    if(this.saveFrame === true) {
      this.canvasToImage()
      this.saveFrame = false
    }
  }


}

module.exports = HydraSynth
