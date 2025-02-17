const glslTransforms = require('./glsl/composable-glsl-functions.js')
const GlslSource = require('./glsl-source.js')

const renderpassFunctions = require('./glsl/renderpass-functions.js')

const {Transform} = require('./glsl-utils')

Array.prototype.fast = function (speed) {
  this.speed = speed
  return this
}

class Synth {
  constructor (defaultOutput, extendTransforms = (x => x), changeListener = (() => {})) {
    this.defaultOutput = defaultOutput
    this.changeListener = changeListener
    this.extendTransforms = extendTransforms
    this.generators = {}
    this.init()
  }
  init () {
    this.glslTransforms = []
    this.generators = Object.entries(this.generators).reduce((prev, [method, transform]) => {
      this.changeListener({type: 'remove', synth: this, method})
      return prev
    }, {})

    this.sourceClass = (() => {
      return class extends GlslSource {
      }
    })()

    let functions = []

    const addTransforms = (transforms) => {
      if (typeof transforms === 'object' && transforms !== null) {
        if (!Array.isArray(transforms)) {
          transforms = Object.entries(transforms).map(([method, transform])  => {
            transform.name = method
            return transform
          })
        }
      } else {
        return
      }
      Array.prototype.push.apply(functions, transforms.filter(x => typeof x === 'object' && x !== null))
    }

    addTransforms(glslTransforms)
    addTransforms(renderpassFunctions)

    if (typeof this.extendTransforms === 'function') {
      const handler = {
        set: (obj, prop, value) => {
          if (Array.isArray(obj) && typeof prop === 'string' && !obj.hasOwnProperty(prop)) {
            try {
              if (Number.isInteger(Number.parseFloat(prop))) {
                return Reflect.set(obj, prop, value)
              }
            } catch (e) {
              /* propery is not a number, assume someone is trying to use the
                functions array like an object */
            }
            value.name = prop
            return Reflect.apply(Array.prototype.push, obj, [value])
          }
          return Reflect.set(obj, prop, value)
        }
      }
      const tprox = new Proxy(functions, handler)

      functions = this.extendTransforms(tprox)
    } else {
      addTransforms(this.extendTransforms)
    }

    functions = functions.map(x => new Transform(this, x))

    /* Make sure there's only one function per unique type. Right now there's
    only two types of functions that can c-oexist: Generators and non-generators.
    Hence the unique key is comprised of the name and the is_generator property.
    This logic needs to be in sync with the handling in setFunction.

    Due to the use of Array.reduce, the last function of a specific key is the
    one that's retained.
    */
    const get_unique_key = (transform) => `${transform.name}_${transform.is_generator}`
    functions = Object.entries(
      functions
        .reduce((h, transform) => {
          h[get_unique_key(transform)] = transform
          return h
        }, {})
    )
      .map(([, transform]) => transform)
      .map(transform => {
        if (typeof transform.glsl_return_type === 'undefined' && transform.glsl) {
          transform.glsl_return_type = transform.glsl.replace(new RegExp(`^(?:[\\s\\S]*\\W)?(\\S+)\\s+${transform.name}\\s*[(][\\s\\S]*`, 'ugm'), '$1')
        }

        return this.setFunction(transform)
      })

    return functions
  }

  setFunction (transform, arg2) {
    // support legacy method signature of setFunction (method, transform)
    if (typeof transform !== 'object') {
      if (typeof arg2 === 'object') {
        if (typeof transform === 'string') {
          arg2.name = transform
          transform = arg2
        } else {
          transform = arg2
        }
      } else {
        throw new Error(`No transformation provided: arg1=${transform} arg2=${arg2}`)
      }
    }

    if (!(transform instanceof Transform)) {
      transform = new Transform(this, transform)
    }

    const method = transform.name
    this.glslTransforms.push(transform)
    if (transform.is_generator) {
      const func = (...args) => new this.sourceClass({
        name: method,
        transform: transform,
        userArgs: args,
        defaultOutput: this.defaultOutput,
        synth: this
      })
      this.generators[method] = func
      this.changeListener({type: 'add', synth: this, method})
      return func
    } else  {
      this.sourceClass.prototype[method] = function (...args) {
        this.transforms.push({name: method, transform: transform, userArgs: args})
        return this
      }
    }
    return undefined
  }
}

module.exports = Synth
