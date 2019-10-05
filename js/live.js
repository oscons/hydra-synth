'use strict';

/* eslint-enable no-undef */

((function () {
    // eslint-disable-next-line no-undef
    const refs = get_refs()
    const {CodeMirror, HydraSynth, loop, HydraLFO} = refs

    if (!window.hydra) {
        const canvas =  document.getElementById('hydra-canvas')
        const canvasWrapper =  document.getElementById('hydra-canvas-wrapper')
        const sql = Math.min(canvasWrapper.clientWidth, canvasWrapper.clientHeight) - 300
        
        canvas.width = sql
        canvas.height = sql

        canvas.style.width = sql
        canvas.style.height = sql

        console.log('Creating hydra instance')
        window.hydra = new HydraSynth({pb:{}, canvas, autoLoop: false})
    }
    const hydra = window.hydra

    if (!window.hydralfo) {
        window.hydralfo = HydraLFO
    }

    const editor = CodeMirror.fromTextArea(
        document.getElementById('input')
        , {
            lineNumbers: true,
            mode: {name: 'javascript', globalVars: true},
            extraKeys: {
                'Shift-Ctrl-Enter': function (instance) {
                    const pefp = Object.getOwnPropertyNames(hydra)
                        .reduce((s, n) => 
                            `${s}const ${n} = window.hydra.${n};\n`
                        , '')

                    const code = `${pefp};
const L = hydralfo.init();
${editor.getValue()};`
                    console.log(code)

                    eval(code)
                }
            }
        }
    )

    editor.setValue(`shape(3).out(o0)`)

    if (!window.hydra_loop) {
		window.hydra_loop = loop((dt) => {
			hydra.tick(dt)
        })
        console.log('Starting hydra loop')
        window.hydra_loop.start()
    }
    
})())
