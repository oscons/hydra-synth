const generateGlsl = require('./glsl-utils.js').generateGlsl

const glslTransforms = require('./glsl/composable-glsl-functions.js')
const utilityGlsl = require('./glsl/utility-functions.js')

var GlslSource = function (obj) {
  console.log('creating', obj)
  this.transforms = []
  this.transforms.push(obj)
  this.defaultOutput = obj.defaultOutput
  this.synth = obj.synth

  return this
}

GlslSource.prototype.addTransform = function (obj)  {
    this.transforms.push(obj)
}

GlslSource.prototype.out = function (_output) {
  var output = _output || this.defaultOutput
  var glsl = this.glsl(output)
  this.synth.currentFunctions = []
  output.renderPasses(glsl)

}

GlslSource.prototype.glsl = function (_output) {
  var output = _output || this.defaultOutput
  var passes = []
  var transforms = []
  this.transforms.forEach((transform) => {

    if(transform.transform.type === 'renderpass'){
      if (transforms.length > 0) passes.push(this.compile(transforms, output))
      transforms = []
      var uniforms = {}
      const inputs = transform.transform.formatArguments(transform, -1)
      inputs.forEach((uniform) => { uniforms[uniform.name] = uniform.value })

      passes.push({
        frag: transform.transform.frag,
        uniforms: Object.assign({}, output.uniforms, uniforms)
      })
      transforms.push({name: 'prev', transform:  glslTransforms['prev'], defaultOutput: output, synth: this.synth})
    } else {
      transforms.push(transform)
    }
  })


  if (transforms.length > 0) passes.push(this.compile(transforms, output))
  console.log('PASSES', passes)

  return passes
}

GlslSource.prototype.compile = function (transforms, output) {

  var shaderInfo = generateGlsl(transforms)
  var uniforms = {}
  shaderInfo.uniforms.forEach((uniform) => { uniforms[uniform.name] = uniform.value })

//  console.log('transforms', shaderInfo)
  var frag = `
  precision mediump float;
  ${Object.values(shaderInfo.uniforms).map((uniform) => {
    let type = uniform.type
    switch (uniform.type) {
      case 'texture':
        type = 'sampler2D'
        break
    }
    return `
      uniform ${type} ${uniform.name};`
  }).join('')}
  uniform float time;
  uniform vec2 resolution;
  varying vec2 uv;
  uniform sampler2D prevBuffer;

  ${Object.values(utilityGlsl).map((transform) => {
  //  console.log(transform.glsl)
    return `
            ${transform.glsl}
          `
  }).join('')}

  ${shaderInfo.glslFunctions.map((transform) => {
    return `
            ${transform.transform.glsl}
          `
  }).join('')}

  void main () {
    vec4 c = vec4(1, 0, 0, 1);
    vec2 st = gl_FragCoord.xy/resolution;
    gl_FragColor = ${shaderInfo.fragColor};
  }
  `

  return {
    frag: frag,
    uniforms: Object.assign({}, output.uniforms, uniforms)
  }

}

module.exports = GlslSource
