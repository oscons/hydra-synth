'use strict'

import * as _ from 'codemirror/mode/javascript/javascript'

import HydraSynth from 'hydra-synth'
import loop from 'raf-loop'
import CodeMirror from 'codemirror'
import HydraLFO from 'hydra-lfo'


const get_refs = () => ({
    HydraSynth,
    loop,
    CodeMirror,
    HydraLFO
})

const config = {
    get_refs
}

export default config

if (typeof window !== 'undefined') {
    console.log('init')
    Object.entries(config).forEach(([name, ref]) => {
        console.log(`exporting ${name}`)
        window[name] = ref
    })
}
