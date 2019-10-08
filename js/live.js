'use strict';
/* eslint-enable no-undef */

((function ($) {

    const do_window = (fn) => {
        if (typeof window === undefined) {
            return undefined
        }
        return fn(window)
    }

    const varacc = {}
    varacc.extend = (h) => Object.entries(h).forEach(([k, v]) => varacc[k] = v)
    do_window((w) => w.varacc = varacc)

    const events = {}
    varacc.extend({events})

    // eslint-disable-next-line no-undef
    const refs = get_refs()
    varacc.extend({refs})
    const {CodeMirror, HydraSynth, loop, HydraLFO, zlib, Buffer} = refs

    function logger (...args) {
        setStorageItem('evt_logger', args)
    }

    const _console_log = console.log
    function console_log (...args) {
        _console_log(...args)
    }

    function localListener (evt) {
        const tgt = events[evt.key]
        if (typeof tgt === 'function') {
            tgt(evt.newValue)
        }
    }

    function setStorageItem (key, value) {
        const rv = localStorage.setItem(key, value)
        localListener({key, newValue: value})
        return rv
    }

    do_window((w) => {
        console_log('registering storage listener')
        w.addEventListener('storage', localListener, false)
    })

    const resize_canvas = () => {
        const canvas =  document.getElementById('hydra-canvas')
        const canvasWrapper =  document.getElementsByClassName('hydra-canvas-wrapper')[0]
        const output_side_length = Math.min(canvasWrapper.clientWidth, canvasWrapper.clientHeight)

        canvas.width = canvas.style.width = canvasWrapper.clientWidth
        canvas.height = canvas.style.height = canvasWrapper.clientHeight

        if (varacc.hydra) {
            varacc.hydra.width = canvas.width 
            varacc.hydra.height = canvas.height
        }
    }

    let layout_config = {
        showPopoutIcon: false,
        showCloseIcon: false,
        content: [{
            type: 'row',
            content:[
            {
                type: 'column',
                content:[{
                    type: 'component',
                    componentName: 'input-editor',
                    componentState: { },
                    isClosable: false
                },
                {
                    type: 'stack',
                    content: [{
                        type: 'component',
                        componentName: 'hydra-console',
                        componentState: { },
                        isClosable: false
                    },
                    {
                        type: 'component',
                        componentName: 'hydra-shader',
                        componentState: { },
                        isClosable: false
                    }]
                }]
            },
            {
                type: 'component',
                componentName: 'hydra-canvas',
                componentState: {  },
                isClosable: false
            }]
        }]
    }

    const editors = {}

    let saved_state = localStorage.getItem('layout_state')
    if (saved_state) {
        saved_state = JSON.parse(saved_state)
    }
    const layout = new GoldenLayout(saved_state || layout_config)
    layout.registerComponent('input-editor', function (container, componentState) {
        container.getElement().append($('.editor-wrapper'))
        container.on('resize', () => editors.input && editors.input.refresh())
    })
    layout.registerComponent('hydra-console', function (container, componentState) {
        container.getElement().append($('.console-wrapper'))
        container.on('resize', () => editors.console && editors.console.refresh())
    })
    layout.registerComponent('hydra-shader', function (container, componentState) {
        container.getElement().append($('.shader-wrapper'))
        container.on('resize', () => editors.shader && editors.shader.refresh())
        container.on('show', () => editors.shader && editors.shader.refresh())
        container.on('hide', () => editors.shader && editors.shader.refresh())
        container.on('tab', () => editors.shader && editors.shader.refresh())
        container.on('open', () => editors.shader && editors.shader.refresh())
    })
    layout.registerComponent('hydra-canvas', function (container, componentState) {
        container.getElement().append($('.hydra-canvas-wrapper'))
        container.on('resize', () => resize_canvas())
    })
    layout.on('stateChanged', () => {
        localStorage.setItem('layout_state', JSON.stringify(layout.toConfig()))
    })
    layout.on('initialised', () => {
        logger('layout initialized')
        const hydra_console =  CodeMirror.fromTextArea(
            document.getElementById('hydra_console')
            , {
                lineNumbers: false,
                lineWrapping: true,
                readOnly: true
            }
        )
        editors.console = hydra_console

        const hydra_shader =  CodeMirror.fromTextArea(
            document.getElementById('hydra_shader')
            , {
                mode: 'x-shader/x-fragment',
                lineNumbers: false,
                lineWrapping: true,
                readOnly: true
            }
        )

        varacc.extend({hydra_console})

        const local_logger = (args) => {
            console_log(...args)
            if (typeof args === 'undefined') {
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
                if (args[0] === 'PASSES' && args.length > 1 && Array.isArray(args[1])) {
                    
                    target = hydra_shader
                    args = args[1].map((pass, i) => `/*** PASS ${i} *************/\n${pass.frag}`)
                    console_log('new args', args)
                    hydra_shader.setValue('')
                }
            }
            if (typeof target === 'object') {
                const newLines = args.map(x => (x ? x : '').toString()).reduce((s, v) => `${s}\n${v}`, ``)
                const doc = target.getDoc()
    
                doc.replaceRange(newLines, {line: doc.size, ch: 0})
    
                target.scrollIntoView({line: doc.size - 1, ch: 0})
                target.refresh()
            } else {
                console_log(...args)
            }
        }
    
        events.evt_logger = local_logger
    
        const extensions = {
            transform: {
                linGrad: {
                    type: 'src',
                    inputs: [
                        /*{
                            name: 'colorStart',
                            type: 'vec4'
                        },
                        {
                            name: 'colorEnd',
                            type: 'vec4'
                        }*/
                    ],
                    glsl: `vec4 linGrad(vec2 _st) {
                        vec4 colorStart = vec4(1.0, 0.0, 0.0, 1.0);
                        vec4 colorEnd = vec4(0.0, 0.0, 0.0, 1.0);
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
        
        resize_canvas()
        
        logger('Creating hydra instance')
        const hydra = new HydraSynth({pb:{}, canvas, autoLoop: false /*, logger, extensions */})
    
        varacc.extend({hydra})
    
        const hydralfo = HydraLFO
    
        varacc.extend({hydralfo})
        varacc.extend({zlib})
        varacc.extend({Buffer})
    
        const local_run_code = (code) => {
            const fnargs = {}
            
            const add_fn_arg = (name, value) => {
                fnargs[name] = value
            }
    
            Object.getOwnPropertyNames(hydra)
                .filter(name => typeof hydra[name] === 'function')
                .forEach(name => {
                    add_fn_arg(name, hydra[name])
                })
            
            add_fn_arg('L', hydralfo.init())
    
            const old_console_log = console.log
            console.log = logger
            try {
                const fnarg_names = Object.keys(fnargs)
                const fnarg_values = fnarg_names.map(x => fnargs[x])
                const codefun = new Function(...fnarg_names, code)
                codefun.apply(undefined, fnarg_values)
            } catch (e) {
                logger('error', e)
            }
            console.log = old_console_log
        }
    
        const run_code = (code) => {
            setStorageItem('evt_eval', code)
        }
    
        events.evt_eval = local_run_code
        
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
                        run_code(instance.getValue())
                    },
                    'Tab': function (instance) {
                        instance.replaceSelection('  ', 'end')
                    }
                },
            }
        )
    
        let initValue = do_window((w) => {
            let rval
            if (w.location.hash.length > 1) {
                let hval = decodeURI(w.location.hash.substr(1))
                //logger(hval)
                
                try {
                    hval = Buffer.from(hval, 'base64')
                    rval = zlib.inflateSync(hval).toString()
                    try {
                        rval = JSON.parse(rval)
                    } catch (e) {
                        rval = {
                            e: rval
                        }
                    }
                    
                } catch (e) {
                    logger(e)
                }
            }
            return rval
        })
        
        if (!initValue) {
            initValue = {}
        }
        if (!initValue.e) {
            initValue.e = `shape(3).rotate(0,0.1).out(o0)`
        }
        console_log({initValue})
        editor.setValue(initValue.e)
    
        const event_info = {
            last_hash_update: 0,
            timeout_running: false
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
            do_window((w) => w.location.hash = encodeURI(comprv.toString('base64')))
            event_info.timeout_running = false
        }
    
        editor.on('changes', (instance, changeObj) => {
            event_info.last_hash_update = new Date().getTime()
            update_hash()
        })
        
        setTimeout(() => {
            editor.focus()
            run_code(editor.getValue())
        }, 500)
    
        varacc.extend({editor})
        editors.input = editor
    
        const hydra_loop = loop((dt) => {
            hydra.tick(dt)
        })
    
        logger('Starting hydra loop')
        hydra_loop.start()
        varacc.extend({hydra_loop})
    })
    layout.init()
})($))
