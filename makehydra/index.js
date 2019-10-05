'use strict'

import * as _ from 'codemirror/mode/javascript/javascript'

import HydraSynth from 'hydra-synth'
import loop from 'raf-loop'
import CodeMirror from 'codemirror'
import HydraLFO from 'hydra-lfo'
import zlib from 'zlib'
import ascii85 from 'ascii85'

import {Buffer} from 'buffer'

const get_refs = () => ({
    HydraSynth,
    loop,
    CodeMirror,
    HydraLFO,
    zlib,
    Buffer,
    ascii85
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
