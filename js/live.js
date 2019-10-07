'use strict';

/* eslint-enable no-undef */

((function () {

    // eslint-disable-next-line no-undef
    const refs = get_refs()
    const {CodeMirror, HydraSynth, loop, HydraLFO, zlib, Buffer} = refs

    const hydra_console =  CodeMirror.fromTextArea(
        document.getElementById('hydra_console')
        , {
            lineNumbers: false,
            lineWrapping: true,
            readOnly: true
        }
    )

    const hydra_shader =  CodeMirror.fromTextArea(
        document.getElementById('hydra_shader')
        , {
            mode: 'x-shader/x-fragment',
            lineNumbers: false,
            lineWrapping: true,
            readOnly: true
        }
    )

    window.hydra_console = hydra_console;

    const logger = (...args) => {
        console.log(...args)
        if (typeof args === 'undefined'){
            return
        }
        if (!Array.isArray(args)) {
            args = [args]
        }
        if (args.length === 0) {
            return
        }
        let target = hydra_console
        if (typeof args[0] === 'string') {
            if (args[0].toLowerCase() === 'shader') {
                target = hydra_shader
                args = args.slice(1)
                hydra_shader.setValue("")
            }
        }
        if (typeof target === 'object') {
            const newLines = args.map(x => x.toString()).reduce((s, v) => `${s}\n${v}`, ``)
            const doc = target.getDoc()

            doc.replaceRange(newLines, {line: doc.size, ch: 0})

            target.scrollIntoView({line: doc.size-1, ch: 0})
        } else {
            console.log(...args)
        }
    }

    window.refs = refs

    if (!window.hydra) {

        const extensions = {
            transforms: {
                linGrad: {
                    type: 'src',
                    inputs: [
                        {
                            name: 'colorStart',
                            type: 'vec4'
                        },
                        {
                            name: 'colorEnd',
                            type: 'vec4'
                        }
                    ],
                    glsl: `vec4 linGrad(vec2 _st, vec4 colorStart, vec4 colorEnd) {
                        vec4 m = (colorEnd - colorStart) / 1.0;
                      return colorStart + m * _st.x;
                    }
                    `
                },
                radGrad: {
                    type: 'src',
                    inputs: [
                        {
                            name: 'colorStart',
                            type: 'vec4'
                        },
                        {
                            name: 'colorEnd',
                            type: 'vec4'
                        }
                    ],
                    glsl: `vec4 radGrad(vec2 _st, vec4 colorStart, vec4 colorEnd) {
                        vec4 m = (colorEnd - colorStart) / 1.0;
                        vec2 st = _st - 0.5;
                        return colorStart + m * sqrt(st.x * st.x + st.y * st.y);
                    }
                    `
                },
            }
        }

        const canvas =  document.getElementById('hydra-canvas')
        const canvasWrapper =  document.getElementById('hydra-canvas-wrapper')
        const output_side_length = Math.min(canvasWrapper.clientWidth, canvasWrapper.clientHeight)
        
        // logger({output_side_length})

        canvas.width = output_side_length
        canvas.height = output_side_length

        canvas.style.width = output_side_length
        canvas.style.height = output_side_length

        logger('Creating hydra instance')
        window.hydra = new HydraSynth({pb:{}, canvas, autoLoop: false, logger, extensions})
    }
    const hydra = window.hydra

    if (!window.hydralfo) {
        window.hydralfo = HydraLFO
    }

    window.zlib = zlib
    window.Buffer = Buffer

    const run_code = (instance) => {
        const pefp = Object.getOwnPropertyNames(hydra)
                            .sort()
                            .reduce((s, n) => 
                                `${s}const ${n} = window.hydra.${n};\n`
                            , '')
    
        const code = `${pefp};
    const L = hydralfo.init();
    ${instance.getValue()};`
        // logger('///////////////////', code)
        
        try {
            eval(code)
        } catch(e) {
            logger('error', e)
        }
    }

    if (!window.editor) {
        const editor = CodeMirror.fromTextArea(
            document.getElementById('hydra_input')
            , {
                lineNumbers: true,
                mode: {name: 'javascript', globalVars: true},
                indentUnit: 2,
                tabSize: 2,
                indentWithTabs: false,
                lineWrapping: true,
                extraKeys: {
                    'Shift-Ctrl-Enter': function (instance) {
                        run_code(instance)
                    },
                    'Tab': function(instance){
                        instance.replaceSelection("  " , "end");
                    }
                },
            }
        )
    
        let initValue
        
        if(window.location.hash.length > 1) {
            let hval = decodeURI(window.location.hash.substr(1))
            //logger(hval)
            
            try {
                hval = Buffer.from(hval, 'base64')
                initValue = zlib.inflateSync(hval).toString()
                try {
                    initValue = JSON.parse(initValue)
                } catch(e) {
                    initValue = {
                        e: initValue
                    }
                }
                
            } catch(e) {
                logger(e)
            }
        }
        
        if (!initValue) {
            initValue = {}
        }
        if (!initValue.e) {
            initValue.e =`shape(3).rotate(0,0.1).out(o0)`
        }
        console.log({initValue})
        editor.setValue(initValue.e)

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

            const comprv = zlib.deflateSync(JSON.stringify({
                e: editor.getValue()
            }), {level: zlib.Z_BEST_COMPRESSION})
            // logger(comprv.toString('base64'))
            window.location.hash = encodeURI(comprv.toString('base64'))
            event_info.timeout_running = false
        }

        editor.on('changes', (instance, changeObj) => {
            event_info.last_hash_update = new Date().getTime()
            update_hash()
        })
        window.editor = editor
        setTimeout(() => {
            editor.focus()
            run_code(editor)
        }, 500)
    }

    if (!window.hydra_loop) {
		window.hydra_loop = loop((dt) => {
			hydra.tick(dt)
        })
        logger('Starting hydra loop')
        window.hydra_loop.start()
    }
})())
