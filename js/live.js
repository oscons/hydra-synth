'use strict';

/* eslint-enable no-undef */

((function () {

    // eslint-disable-next-line no-undef
    const refs = get_refs()
    const {CodeMirror, HydraSynth, loop, HydraLFO, zlib, Buffer} = refs

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

    window.zlib = zlib
    window.Buffer = Buffer

    if (!window.editor) {
        const editor = CodeMirror.fromTextArea(
            document.getElementById('input')
            , {
                lineNumbers: true,
                mode: {name: 'javascript', globalVars: true},
                extraKeys: {
                    'Shift-Ctrl-Enter': function (instance) {
                        const pefp = Object.getOwnPropertyNames(hydra)
                            .sort()
                            .reduce((s, n) => 
                                `${s}const ${n} = window.hydra.${n};\n`
                            , '')
    
                        const code = `${pefp};
    const L = hydralfo.init();
    ${editor.getValue()};`
                        console.log(code)
    
                        eval(code)
                    }
                },
            }
        )
    
        let initValue
        
        if(window.location.hash.length > 1) {
            let hval = window.location.hash.substr(1)
            console.log(hval)
            
            try {
                hval = Buffer.from(hval, 'base64')
                initValue = zlib.inflateSync(hval).toString()
            } catch(e) {
                console.log(e)
            }
        }
        
        if (!initValue) {
            initValue = `shape(3).rotate(0,0.1).out(o0)`
        }
        editor.setValue(initValue)

        const event_info = {
            last_hash_update: 0
            , timeout_running: false
        }

        const update_hash = () => {
            if (event_info.timeout_running) {
                return
            }

            if (new Date().getTime() - event_info.last_hash_update < 500) {
                event_info.timeout_running = true

                setTimeout(() => {
                    event_info.timeout_running = false
                    update_hash()
                }, 1000)

                return
            }

            const comprv = zlib.deflateSync(editor.getValue(), {level: zlib.Z_BEST_COMPRESSION})
            console.log(comprv)
            window.location.hash = comprv.toString('base64')
            event_info.timeout_running = false
        }

        editor.on('changes', (instance, changeObj) => {
            event_info.last_hash_update = new Date().getTime()
            update_hash()
        })
        window.editor = editor
    }

    if (!window.hydra_loop) {
		window.hydra_loop = loop((dt) => {
			hydra.tick(dt)
        })
        console.log('Starting hydra loop')
        window.hydra_loop.start()
    }
    
})())
