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
        if (Array.isArray(transforms)) {
          functions.concat(transforms)
        } else {
          Object.entries(transforms).forEach(([method, transform])  => {
            transform.name = method
            functions.push(transform)
          })
        }
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
    } else if (Array.isArray(this.extendTransforms)) {
      addTransforms(this.extendTransforms.reduce((h, transform) => {
        h[transform.name] = transform
        return h
      }, {}))
    } else if (typeof this.extendTransforms === 'object') {
      addTransforms(this.extendTransforms)
    }

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

 setFunction (transform) {
    transform = new Transform(this, transform)
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
