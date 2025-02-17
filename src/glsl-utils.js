// converts a tree of javascript functions to a shader

// Add extra functionality to Array.prototype for generating sequences in time
const arrayUtils = require('./lib/array-utils.js')

const DEFAULT_CONVERSIONS = {
  float: {
    'vec4': {name: 'sum', args: [[1, 1, 1, 1]]},
    'vec2': {name: 'sum', args: [[1, 1]]}
  }
}

// recursive function for generating shader string from object containing functions and user arguments. Order of functions in string depends on type of function
// to do: improve variable names
function generateGlsl (transforms, shaderParams) {

  // transform function that outputs a shader string corresponding to gl_FragColor
  var fragColor = () => ''
  // var uniforms = []
  // var glslFunctions = []
  transforms.forEach((transform_instance) => {
    var inputs = transform_instance.transform.formatArguments(transform_instance, shaderParams.uniforms.length)
    inputs.forEach((input) => {
      if(input.isUniform) shaderParams.uniforms.push(input)
    })

   // add new glsl function to running list of functions
    if(!contains(transform_instance, shaderParams.glslFunctions)) shaderParams.glslFunctions.push(transform_instance)

    fragColor = transform_instance.transform.compose(fragColor, inputs, shaderParams)
  })

  return fragColor
}

// assembles a shader string containing the arguments and the function name, i.e. 'osc(uv, frequency)'
function shaderString (uv, method, inputs, shaderParams) {
  const str = inputs.map((input) => {
    if (input.isUniform) {
      return input.name
    } else if (input.value && input.value.transforms) {
      // this by definition needs to be a generator, hence we start with 'st' as the initial value for generating the glsl fragment
      return `${generateGlsl(input.value.transforms, shaderParams)('st')}`
    }
    return input.value
  })

  if (typeof uv === 'undefined') {
    uv = []
  } else if (!Array.isArray(uv)) {
    uv = [uv]
  }

  return `${method}(${uv.concat(str).join(', ')})`
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


class Transform {
  constructor (synth, definition) {
    const that = this

    this.synth = synth
    Object.entries(definition)
      .filter(([name]) => ['is_generator'].indexOf(name) === -1)
      .forEach(([name, value]) => {
        that[name] = value
      })

    if (typeof definition.is_generator === 'undefined') {
      this.is_generator = this.type === 'src'
    } else {
      this.is_generator = definition.is_generator
    }
  }

  compose (f0, inputs, shaderParams) {
    let compose = this._compose

    if (typeof compose !== 'function') {
      // eslint-disable-next-line no-shadow
      compose = (f0, inputs, shaderParams, {generateGlsl, shaderString}) => {
        if (this.type === 'src') {
          return (uv) => `${shaderString(uv, this.name, inputs, shaderParams, this.synth)}`
        } else if (this.type === 'coord') {
          return (uv) => `${f0(`${shaderString(uv, this.name, inputs, shaderParams, this.synth)}`)}`
        } else if (this.type === 'color') {
          return (uv) =>  `${shaderString(`${f0(uv)}`, this.name, inputs, shaderParams, this.synth)}`
        } else if (this.type === 'combine') {
          // combining two generated shader strings (i.e. for blend, mult, add funtions)
          const f1 = inputs[0].value && inputs[0].value.transforms ?
            (uv) => `${generateGlsl(inputs[0].value.transforms, shaderParams, this.synth)(uv)}` :
            (inputs[0].isUniform ? () => inputs[0].name : () => inputs[0].value)
          return (uv) => `${shaderString(`${f0(uv)}, ${f1(uv)}`, this.name, inputs.slice(1), shaderParams, this.synth)}`
        } else if (this.type === 'combineCoord') {
          // combining two generated shader strings (i.e. for modulate functions)
          const f1 = inputs[0].value && inputs[0].value.transforms ?
            (uv) => `${generateGlsl(inputs[0].value.transforms, shaderParams, this.synth)(uv)}` :
            (inputs[0].isUniform ? () => inputs[0].name : () => inputs[0].value)
          return (uv) => `${f0(`${shaderString(`${uv}, ${f1(uv)}`, this.name, inputs.slice(1), shaderParams, this.synth)}`)}`
        } else if (this.type === 'combineAll') {
          return (uv) => `${shaderString('st', this.name, inputs, shaderParams, this.synth)}`
        }
        return f0
      }
    }

    return compose.apply(this, [f0, inputs, shaderParams, {generateGlsl, shaderString}])
  }

  formatArguments (transform_instance, startIndex) {
    const defaultArgs = this.inputs
    const userArgs = transform_instance.userArgs
    const synth = this.synth
    
    return defaultArgs.map((input, index) => {
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
          typedArg.value = (context, props, batchId) => arrayUtils.getValue(userArgs[index])(props)
          typedArg.isUniform = true
        }
      }
    }

    if(startIndex< 0){
    } else {
    if (typedArg.value && typedArg.value.transforms) {
      const final_transform = typedArg.value.transforms[typedArg.value.transforms.length - 1]



      if (final_transform.transform.glsl_return_type !== input.type) {
        const defaults = DEFAULT_CONVERSIONS[input.type]
        if (typeof defaults !== 'undefined') {
          const default_def = defaults[final_transform.transform.glsl_return_type]
          if (typeof default_def !== 'undefined') {
            const {name, args} = default_def
            typedArg.value = typedArg.value[name](...args)
          }
        }
      }

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
}

module.exports = {
  generateGlsl: function (transforms) {
    var shaderParams = {
      uniforms: [], // list of uniforms used in shader
      glslFunctions: [], // list of functions used in shader
      fragColor: ''
    }

    var gen = generateGlsl(transforms, shaderParams)('st')
    shaderParams.fragColor = gen
    return shaderParams
  },
  Transform
}

