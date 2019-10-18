
const {should, expect, assert} = require('chai')
const rewire = require('rewire')
const sinon = require('sinon')
const {JSDOM} = require('jsdom')

const Synth = require('../src/create-synth')

describe('Synth', () => {
    let dummyOutput

    beforeEach(() => {
        dummyOutput = {}
    })

    it('Sets the seq prototype on Array', () => {
        expect(Array.prototype).to.include.keys('fast')

        expect(Array.prototype.fast).to.be.a('function')
    })

    it('Contains all transforms', () => {
        const transforms = require('../src/glsl/composable-glsl-functions')
        const srcNames = Object.entries(transforms).filter(([, transform]) => transform.type === 'src').map(([name]) => name)

        const events = []
        const synth = new Synth(dummyOutput, {}, (e) => events.push(e))

        expect(synth.generators)
            .to.be.an('object')
            .and.to.have.all.keys(srcNames)

        expect(events.filter(({type}) => type === 'add').map(({method}) => method))
            .to.have.members(srcNames)
    })

    it('Can be extended', () => {
        const transforms = require('../src/glsl/composable-glsl-functions')
        const srcNames = Object.entries(transforms).filter(([, transform]) => transform.type === 'src').map(([name]) => name)

        const events = []
        const synth = new Synth(dummyOutput, 'invalid', (e) => events.push(e))

        expect(synth.generators)
            .to.be.an('object')
            .and.to.have.all.keys(srcNames)

        expect(events.filter(({type}) => type === 'add').map(({method}) => method))
            .to.include.members(srcNames);

        [{
            foo: {
                type: 'src',
                inputs: [],
                glsl: '<foo>'
            }
        },
        [
            {
                name: 'foo',
                type: 'src',
                inputs: [],
                glsl: '<foo>'
            }
        ]].forEach((ext, i) => {
            synth.extendTransforms = ext

            events.length = 0
            synth.init()

            expect(events.filter(({type}) => type === 'remove').map(({method}) => method))
                .to.include.all.members(srcNames)

            expect(events.filter(({type}) => type === 'add').map(({method}) => method))
                .to.have.all.members([
                    ...srcNames,
                    'foo'
                ])
        })

        synth.setFunction('bar', {
            type: 'src',
            inputs: [],
            glsl: '<bar>'
        })

        expect(synth.generators).to.include.keys('bar')



    })

    it('Can create function chains', () => {
        const synth = new Synth(dummyOutput)

        assert.doesNotThrow(() => {
            synth.generators.solid().repeatX()
        })
    })

    it('Supports multiple functions with the same name', () => {
        const synth = new Synth(dummyOutput, [
            {
                name: 'neg',
                type: 'src',
                inputs: [{name: 'v', type: 'float', default: 0}],
                glsl: `float neg(vec2 _st, float v){return -v;}`
            },
            {
                name: 'neg',
                type: 'color',
                inputs: [],
                glsl: `vec4 neg(vec4 v){return -v;}`
            }
        ])

        expect(synth.generators).to.include.keys('neg')
        expect(synth.glslTransforms.filter(x => x.name === 'neg')).to.have.lengthOf(2)

        assert.doesNotThrow(() => {
            synth.generators.neg().neg()
        })
    })

})

