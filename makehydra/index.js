'use strict'

import * as _js from 'codemirror/mode/javascript/javascript'
import * as _clike from 'codemirror/mode/clike/clike'

import HydraSynth from 'hydra-synth'
import loop from 'raf-loop'
import CodeMirror from 'codemirror'
import HydraLFO from 'hydra-lfo'
import zlib from 'zlib'

import {Buffer} from 'buffer'

const get_refs = () => ({
    HydraSynth,
    loop,
    CodeMirror,
    HydraLFO,
    zlib,
    Buffer
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
