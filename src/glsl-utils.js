// converts a tree of javascript functions to a shader

module.exports = {
  generateGlsl: function (transforms, synth) {
    var shaderParams = {
      uniforms: [], // list of uniforms used in shader
      glslFunctions: [], // list of functions used in shader
      fragColor: ''
    }

    var gen = generateGlsl(transforms, shaderParams, synth)('st')
    shaderParams.fragColor = gen
    return shaderParams
  },
  formatArguments: formatArguments
}
// recursive function for generating shader string from object containing functions and user arguments. Order of functions in string depends on type of function
// to do: improve variable names
function generateGlsl (transforms, shaderParams, synth) {

  // transform function that outputs a shader string corresponding to gl_FragColor
  var fragColor = () => ''
  // var uniforms = []
  // var glslFunctions = []
  transforms.forEach((transform) => {
    var inputs = formatArguments(transform, shaderParams.uniforms.length, synth)
    inputs.forEach((input) => {
      if(input.isUniform) shaderParams.uniforms.push(input)
    })

   // add new glsl function to running list of functions
    if(!contains(transform, shaderParams.glslFunctions)) shaderParams.glslFunctions.push(transform)

    // current function for generating frag color shader code
    var f0 = fragColor
    if (transform.transform.type === 'src') {
      fragColor = (uv) => `${shaderString(uv, transform.name, inputs, shaderParams, synth)}`
    } else if (transform.transform.type === 'coord') {
      fragColor = (uv) => `${f0(`${shaderString(uv, transform.name, inputs, shaderParams, synth)}`)}`
    } else if (transform.transform.type === 'color') {
      fragColor = (uv) =>  `${shaderString(`${f0(uv)}`, transform.name, inputs, shaderParams, synth)}`
    } else if (transform.transform.type === 'combine') {
      // combining two generated shader strings (i.e. for blend, mult, add funtions)
      var f1 = inputs[0].value && inputs[0].value.transforms ?
        (uv) => `${generateGlsl(inputs[0].value.transforms, shaderParams, synth)(uv)}` :
        (inputs[0].isUniform ? () => inputs[0].name : () => inputs[0].value)
      fragColor = (uv) => `${shaderString(`${f0(uv)}, ${f1(uv)}`, transform.name, inputs.slice(1), shaderParams, synth)}`
    } else if (transform.transform.type === 'combineCoord') {
      // combining two generated shader strings (i.e. for modulate functions)
      var f1 = inputs[0].value && inputs[0].value.transforms ?
        (uv) => `${generateGlsl(inputs[0].value.transforms, shaderParams, synth)(uv)}` :
        (inputs[0].isUniform ? () => inputs[0].name : () => inputs[0].value)
      fragColor = (uv) => `${f0(`${shaderString(`${uv}, ${f1(uv)}`, transform.name, inputs.slice(1), shaderParams, synth)}`)}`
    }
  })

  return fragColor
}

// assembles a shader string containing the arguments and the function name, i.e. 'osc(uv, frequency)'
function shaderString (uv, method, inputs, shaderParams, synth) {
  const str = inputs.map((input) => {
    if (input.isUniform) {
      return input.name
    } else if (input.value && input.value.transforms) {
      // this by definition needs to be a generator, hence we start with 'st' as the initial value for generating the glsl fragment
      return `${generateGlsl(input.value.transforms, shaderParams, synth)('st')}`
    }
    return input.value
  }).reduce((p, c) => `${p}, ${c}`, '')

  return `${method}(${uv}${str})`
}

// merge two arrays and remove duplicates
function mergeArrays (a, b) {
  return a.concat(b.filter(function (item) {
    return a.indexOf(item) < 0;
  }))
}

// check whether
function contains(object, arr) {
  console.log('checking', object.name, arr)
  for(var i = 0; i < arr.length; i++){
    if(object.name == arr[i].name) return true
  }
  return false
}
// convert arrays to this function
const seq = (arr = []) => ({time, bpm}) =>
{
   let speed = arr.speed ? arr.speed : 1
   return arr[Math.floor(time * speed * (bpm / 60) % (arr.length))]
}

function fillArrayWithDefaults (arr, len, defaults) {
  const default_defaults = [0.0, 0.0, 0.0, 1.0]
  // fill the array with default values if it's too short
  if (typeof defaults === 'undefined') {
    defaults = default_defaults
  }
  else if (!Array.isArray(defaults)) {
    if (typeof defaults === 'number') {
      defaults = [defaults]
    } else {
      defaults = default_defaults
    }
  }
  while (arr.length < len) {
    if (arr.length < defaults.length) {
      arr.push(defaults[arr.length])
    } else {
      arr.push(0.0)
    }
  }
  return arr.slice(0, len)
}

const ensure_decimal_dot = (val) => {
  val = val.toString()
  if (val.indexOf('.') < 0) {
    val += '.'
  }
  return val
}

function formatArguments (transform, startIndex, synth) {
  console.log('processing args', transform, startIndex)
  const defaultArgs = transform.transform.inputs
  const userArgs = transform.userArgs
  return defaultArgs.map( (input, index) => {
    const typedArg = {
      value: input.default,
      type: input.type, //
      isUniform: false,
      name: input.name,
      vecLen: 0
    //  generateGlsl: null // function for creating glsl
    }

    if (input.type.startsWith('vec')) {
      try {
        typedArg.vecLen = Number.parseInt(input.type.substr(3))
      } catch (e) {
        console.log(`Error determining length of vector input type ${input.type} (${input.name})`)
      }
    }

    // if user has input something for this argument
    if(userArgs.length > index) {
      typedArg.value = typeof userArgs[index] === 'undefined' ? typedArg.value : userArgs[index]
      // do something if a composite or transform

      if (typeof userArgs[index] === 'function') {
        if (typedArg.vecLen > 0) { // expected input is a vector, not a scalar
          typedArg.value = (context, props, batchId) => (fillArrayWithDefaults(userArgs[index](props), typedArg.vecLen, input.default))
        } else {
          typedArg.value = (context, props, batchId) => (userArgs[index](props))
        }
        
        typedArg.isUniform = true
      } else if (userArgs[index].constructor === Array) {
        if (typedArg.vecLen > 0) { // expected input is a vector, not a scalar
          typedArg.isUniform = true
          typedArg.value = fillArrayWithDefaults(typedArg.value, typedArg.vecLen, input.default)
        } else {
      //  console.log("is Array")
          typedArg.value = (context, props, batchId) => seq(userArgs[index])(props)
          typedArg.isUniform = true
        }
      }
    }

    if(startIndex< 0){
    } else {
    if (typedArg.value && typedArg.value.transforms) {
      typedArg.isUniform = false
    } else if (typedArg.type === 'float' && typeof typedArg.value === 'number') {
      typedArg.value = ensure_decimal_dot(typedArg.value)
    } else if (typedArg.type.startsWith('vec') && typeof typedArg.value === 'object' && Array.isArray(typedArg.value)) {
      typedArg.isUniform = false
      typedArg.value = `${typedArg.type}(${typedArg.value.map(ensure_decimal_dot).join(', ')})`
    } else if (input.type === 'texture') {
      // typedArg.tex = typedArg.value
      var x = typedArg.value
      typedArg.value = () => (x.getTexture())
      typedArg.isUniform = true
    } else {
      // if passing in a texture reference, when function asks for vec4, convert to vec4
      if (typedArg.value.getTexture && input.type === 'vec4') {
        var x1 = typedArg.value
        typedArg.value = synth.generators['src'](x1)
        typedArg.isUniform = false
      }
    }

    // add tp uniform array if is a function that will pass in a different value on each render frame,
    // or a texture/ external source

      if(typedArg.isUniform) {
         typedArg.name += startIndex
      //  shaderParams.uniforms.push(typedArg)
      }
}
    return typedArg
  })
}
