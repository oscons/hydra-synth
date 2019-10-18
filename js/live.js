'use strict';
/* eslint-enable no-undef */

((function ($, GoldenLayout, get_refs, M) {

    $(document).on('click', '.collapsible-header', {}, (e) => {
        $(e.target).parent().children('.collapsible-body').toggle()
    })

    function withO (o, fn, fnu) {
        if (typeof o === 'undefined' || (typeof o === 'object' && o === null)) {
            if (typeof fnu === 'function') {
                return fnu()
            }
            return fnu
        }
        if (typeof fn === 'function') {
            return fn(o)
        } else if (typeof fn === 'undefined' || fn === null) {
            return o
        }
        return fn
    }

    function withOA (oa, fn, fnu) {
        if (!Array.isArray(oa)) {
            return withO(oa, fn, fnu)
        }
        if (oa.length === 0) {
            return withO(undefined, x => x, fnu)
        }
        
        let prev
        const ret = {pass: true}
        for (let i = 0; i < oa.length; i++) {
            let ox = oa[i]

            if (typeof ox === 'function') {
                ox = ox(prev)
            }

            ret.pass = true
            prev = withO(ox, v => v, () => ret.pass = false)

            if (!ret.pass) {
                return withO(undefined, x => x, fnu)
            }
        }
        
        return withO(prev, fn, fnu)
    }

    function with_window (fn, fnu) {
        return withO(window, fn, fnu)
    }

    function extend (h, e) {
        return Object.entries(e).reduce((p, [k, v]) => {p[k] = v; return p}, h)
    }

    function format_log (x, options = {}) {
        const {maxlen = 50, maxd = 2, d = 0, quote = true} = options
        const onext = {maxlen, maxd, d: d + 1}
        if (d === 0 && Array.isArray(x)) {
            const onfirst = {maxlen, maxd, d: onext.d, quote: false}
            return `${x.map(v => `${format_log(v, onfirst)}`).join(' ')}\n\n`
        }

        if (typeof x === 'undefined') {
            return 'undefined'
        }

        if (typeof x === 'object') {
            if (d > maxd) {
                return '...'
            }
            if (Array.isArray(x)) {
                return `[${x.map(v => `${format_log(v, onext)}`).join(', ')}]`
            }
            return `{${Object.getOwnPropertyNames(x)
                .map(k => `${k}: ${format_log(x[k], onext)}`)
                .join(', ')}}`
        }
        
        if (typeof x === 'function') {
            if (d > maxd) {
                return '...'
            }
            x = `function ${x.name}(...) { ${x.toString()} }`
        }

        if (typeof x === 'string') {
            if (maxlen > 0 && x.length > maxlen) {
                x = `${x.substr(0, maxlen)} ...`
            }
            if (!quote) {
                return x
            }
            return `"${x.replace(/[\\]/, '\\\\').replace(/["]/, '\\"')}"`
        }
        
        return x.toString()
    }
    
    class Debouncer {
        constructor (time, fn) {
            this.timeout = time
            this.fn = fn
            this.running = false
            this.last_call = 0
        }
        run () {
            this.last_call = new Date().getTime()
            if (this.running) {
                return
            }
            this.running = true
            this._do_repeat(this.timeout)
        }
        _do_repeat (to) {
            with_window(
                (w) => w.setTimeout(this._cb.bind(this), to)
                , () => {
                    this.fn()
                    this.running = false
                }
            )
        }
        _cb () {
            const current_time = new Date().getTime()
            const tdiff = this.timeout - (current_time - this.last_call)
            if (tdiff <= 0) {
                this.fn()
                this.running = false
                return
            }
            this._do_repeat(Math.max(100, tdiff))
        }
    }

    const gather_args_from_hydra = (h) => {
        const hydra_args = {}
        withO(h, hydra => {
            Object.getOwnPropertyNames(hydra)
                .filter(name => 
                    !name.match(/^_/) && (
                        typeof hydra[name] === 'function'
                        || name.match(/^a\d*$/)
                    )
                )
                .forEach(name => hydra_args[name] = hydra[name])
            
            if (!hydra.makeGlobal) {
                withO(hydra.synth, synth => {
                    withO(synth.generators, generators => {
                        Object.entries(generators).forEach(([method, transform]) => {
                            hydra_args[method] = transform
                        })
                    })
                })
            }

            Object.entries({
                    a: 'audio',
                    time: 'time',
                    bpm: (newBpm) => {
                        if (typeof newBpm === 'undefined') {
                            return hydra.bpm
                        }
                        hydra.bpm = newBpm
                        return newBpm
                    },
                    render: hydra.render.bind(hydra),
                    hydra: hydra
                }).forEach(([k, s]) => {
                if (typeof s === 'string') {
                    hydra_args[k] = hydra[s]
                } else {
                    hydra_args[k] = s
                }
            });

            ['a', 's', 'o'].forEach(p => {
                withO(hydra[p], arr => {
                    arr.forEach((entry, i) => {
                        hydra_args[`${p}${i}`] = entry
                    })
                })
            })
        })
        return hydra_args
    }

    const varacc = {}
    varacc.extend = (h) => extend(varacc, h)
    with_window((w) => w.varacc = varacc)

    const events = {}
    varacc.extend({events})

    const refs = get_refs()
    varacc.extend({refs})

    const _console_log = console.log
    function console_log (...args) {
        _console_log(...args)
    }

    const {CodeMirror, HydraSynth, loop, HydraLFO, zlib, Buffer} = refs

    const compress64 = x => withO(x, y => zlib.deflateSync(JSON.stringify(y), {level: zlib.Z_BEST_COMPRESSION}).toString('base64'))
    const decompress64 = x => withO(x, y => JSON.parse(zlib.inflateSync(Buffer.from(y, 'base64')).toString()))

    const encodeForStorage = x => withO(x, y => compress64(y))
    const decodeFromStorage = x => withO(x, y => decompress64(y))

    const localListener = (evt) => {
        const tgt = events[evt.key]
        if (typeof tgt === 'function') {
            tgt(evt.newValue)
        }
    }

    const setStorageItem = (key, value) => {
        const rv = localStorage.setItem(key, encodeForStorage(value))
        localListener({key, newValue: value})
        return rv
    }

    const setHash = (hash) => {
        setStorageItem('evt_hash', hash)
    }

    const logger = (...args) => {
        setStorageItem('evt_logger', args)
    }

    with_window((w) => {
        console_log('registering storage listener')
        w.addEventListener('storage', (evt) => {
            localListener({key: evt.key, newValue: decodeFromStorage(evt.newValue)})
        }, false)
    })

    const resize_canvas = () => {
        const canvas =  document.getElementById('hydra-canvas')
        const canvasWrapper =  document.getElementsByClassName('canvas-wrapper')[0]

        canvas.width = canvas.style.width = canvasWrapper.clientWidth
        canvas.height = canvas.style.height = canvasWrapper.clientHeight

        withO(varacc.hydra, h => {
            h.width = canvas.width 
            h.height = canvas.height
        })
    }

    const layout_config = {
        settings:{
            showPopoutIcon: false,
            showCloseIcon: false
        },
        content: [{
            type: 'row',
            content:[
            {
                type: 'column',
                content:[
                {
                    type: 'stack',
                    content: [{
                        type: 'component',
                        componentName: 'info',
                        title: 'Info',
                        isClosable: false
                    },
                    {
                        type: 'component',
                        componentName: 'hydra-input',
                        title: 'Editor',
                        isClosable: false
                    }]
                },
                {
                    type: 'stack',
                    content: [{
                        type: 'component',
                        componentName: 'hydra-console',
                        title: 'Console',
                        isClosable: false
                    },
                    {
                        type: 'component',
                        componentName: 'hydra-shader',
                        title: 'Shaders',
                        isClosable: false
                    },
                    {
                        type: 'component',
                        componentName: 'hydra-help',
                        title: 'Help',
                        isClosable: false
                    }]
                }]
            },
            {
                type: 'component',
                componentName: 'hydra-canvas',
                title: 'Hydra output',
                componentState: {  },
                isClosable: false
            }]
        }]
    }

    const editors = {}

    let saved_state
    try {
        saved_state = decodeFromStorage(localStorage.getItem('layout_state'))
    } catch (e) {
        console_log('error', 'could not restore state: ', e)
    }

    const layout_components = {
        info: ['.info-wrapper'],
        'hydra-input': ['.input-wrapper', () => editors.input],
        'hydra-console': ['.console-wrapper', () => editors.console],
        'hydra-shader': ['.shader-wrapper', () => editors.shader],
        'hydra-canvas': ['.canvas-wrapper', () => ({refresh: resize_canvas})],
        'hydra-help': ['.help-wrapper', () => {}, (container) => {
            $(container.getElement()).css('overflow-y', 'scroll')
        }]
    }

    const layout = ((gl) => {
        let use_default_config = false
        
        const has_invalid_components = (c) => {
            if (typeof c === 'object') {
                if ('content' in c) {
                    return c.content.map(x => has_invalid_components(x))
                        .reduce((prev, curr) => prev || curr, false)
                } else if ('type' in c && c.type === 'component') {
                    return !(c.componentName in layout_components)
                }
            }
            return false
        }

        const get_all_components = (c) => {
            if (typeof c === 'object') {
                if ('content' in c) {
                    return c.content
                        .map(x => get_all_components(x))
                        .reduce((prev, curr) => {
                            if (Array.isArray(curr)) {
                                curr.forEach(x => prev.push(x))
                            } else {
                                prev.push(curr)
                            }
                            return prev
                        }, [])
                } else if ('type' in c && c.type === 'component') {
                    return [c.componentName]
                }
            }
            return []
        }

        use_default_config = withO(saved_state, (s) => {
            const flag_dict = (arr) => arr.reduce((h, v) => {
                h[v] = true
                return h
            }, {})

            const saved_components = flag_dict(get_all_components(s))
            const defined_components = flag_dict(get_all_components(layout_config))

            const just = (x, y) => Object.entries(x)
                .map(([k]) => k in y ? undefined : k)
                .filter(k => typeof k !== 'undefined')
            let res

            if ((res = just(saved_components, defined_components)).length > 0) {
                console_log('found undefined layout components, reverting to default config', res)
                return true
            }
            if ((res = just(defined_components, saved_components)).length > 0) {
                console_log('found unused layout components, reverting to default config', res)
                return true
            }

            return false
        }, true)
        
        try {
            return new gl(use_default_config ? layout_config : saved_state)
        } catch (e) {
            console_log(e)
        }
        return new gl(layout_config)
    })(GoldenLayout)

    Object.entries(layout_components).forEach(([name, [clazz, editor, setup]]) => {
        console_log(`Registering layout component ${name}`)
        layout.registerComponent(name, function (container, componentState) {
            container.getElement().append($(clazz))
            container.on('resize', () => withO(editor, f => withO(f(), (e) => e.refresh())))
            withO(setup, f => f(container, name))
        })
    })

    layout.on('stateChanged', () => {
        localStorage.setItem('layout_state', encodeForStorage(layout.toConfig()))
    })

    layout.on('initialised', () => {
        logger('layout initialized')
        const hydra_console =  CodeMirror.fromTextArea(
            document.getElementById('hydra-console')
            , {
                name: 'console',
                mode: {name: 'javascript', globalVars: true},
                lineNumbers: false,
                lineWrapping: true,
                readOnly: true
            }
        )
        editors.console = hydra_console

        const hydra_shader =  CodeMirror.fromTextArea(
            document.getElementById('hydra-shader')
            , {
                name: 'shader',
                mode: 'x-shader/x-fragment',
                lineNumbers: false,
                lineWrapping: true,
                readOnly: true
            }
        )
        editors.shader = hydra_shader

        varacc.extend({hydra_console})

        const logger_debounce = {
            last_update: 0,
            update_cnt: 0,
            running: false
        }

        logger_debounce.fn = () => {
            if (logger_debounce.running) {
                return
            }
            if (logger_debounce.update_cnt === 0) {
                return
            }
            with_window((w) => w.setTimeout(logger_debounce.fn, 500))
        }

        const log_debouncers = {}

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
            let maxlen = undefined
            let clear_editor = false
            if (typeof args[0] === 'string') {
                const a0 = args[0].toLowerCase()
                if (a0 === 'passes' && args.length > 1 && Array.isArray(args[1])) {
                    
                    target = hydra_shader
                    args = args[1].map((pass, i) => `/*** PASS ${i} *************/\n${pass.frag}`)
                    console_log('new args', args)
                    maxlen = 0
                    clear_editor = true
                } else if (a0 === 'debug') {
                    target = undefined // ignore debbug messages
                } else if (a0 === 'error') {
                    maxlen = 0
                } else if (a0 === 'checking' ||  a0 === 'creating' || a0 === 'processing' || a0 === 'processing args' || a0 === 'rendering') {
                    return
                } 
            }

            if (typeof target === 'object') {
                const newLines = format_log(args, {maxlen})
                const doc = target.getDoc()
    
                if (clear_editor) {
                    doc.replaceRange(newLines, {line: 0, ch: 0}, {line: doc.size, ch: 0})
                } else {
                    doc.replaceRange(newLines, {line: doc.size, ch: 0})
                }

                withO(log_debouncers[target.name], 0, () => {
                    log_debouncers[target.name] = new Debouncer(500, () => {
                        target.scrollIntoView({line: doc.size - 1, ch: 0})
                        target.refresh()
                    })
                })

                const debouncer = log_debouncers[target.name]

                debouncer.run()
            }
        }
    
        events.evt_logger = (args) => {
            local_logger(args)
        }
    
        const extendTransforms = (functions) => {
            const extensions = {
                linGrad: {
                    type: 'src',
                    inputs: [
                        {
                            name: 'colorStart',
                            type: 'vec4',
                            default: [1.0, 0.0, 0.0, 1.0]
                        },
                        {
                            name: 'colorEnd',
                            type: 'vec4',
                            default: [0.0, 0.0, 0.0, 1.0]
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
                            type: 'vec4',
                            default: [1.0, 0.0, 0.0, 1.0]
                        },
                        {
                            name: 'colorEnd',
                            type: 'vec4',
                            default: [0.0, 0.0, 0.0, 1.0]
                        }
                    ],
                    glsl: `vec4 radGrad(vec2 _st, vec4 colorStart, vec4 colorEnd) {
                        vec4 m = (colorEnd - colorStart) / 0.5;
                        vec2 st = _st - 0.5;
                        return colorStart + m * sqrt(st.x * st.x + st.y * st.y);
                    }
                    `
                }
            }

            Object.entries(extensions).forEach(([name, def]) => {
                functions[name] = def
            })

            return functions
        }

        const canvas =  document.getElementById('hydra-canvas')
        
        resize_canvas()
        
        logger('Creating hydra instance')
    
        varacc.extend({hydra: new HydraSynth({pb:{}, canvas, autoLoop: false, extendTransforms, makeGlobal: false})})
    
        const hydralfo = HydraLFO
    
        varacc.extend({hydralfo})
        varacc.extend({zlib})
        varacc.extend({Buffer})
    
        const local_run_code = (code) => {
            const fnargs = {}
            
            const add_fn_arg = (name, value) => {
                fnargs[name] = value
            }
            
            add_fn_arg('L', hydralfo.init({logger, hydra: varacc.hydra}))

            const reset_flag = {
                needs_reset: true,
                has_reset: false
            }

            add_fn_arg('reset_hydra', (dynTransforms = {}) => {
                if (!reset_flag.needs_reset) {
                    return
                }
                const all_transforms = (functions) => {
                    const extendT = (f, t) => {
                        if (typeof t === 'function') {
                            return t(f)
                        }
                        return extend(extend({}, f), t)
                    }

                    functions = extendT(functions, extendTransforms)
                    functions = extendT(functions, dynTransforms)
                    return functions
                }

                withO(varacc.hydra, hydra => {
                    console_log('hydra', hydra)
                    if (!hydra.makeGlobal) {
                        withOA([window, w=>w.synth], ws => {
                            const glslTransforms = ws.glslTransforms

                            Object.entries(glslTransforms)
                                .forEach(([method, transform]) => {
                                    if (typeof window[method] === 'function' && window[method] === transform) {
                                        delete window[method]
                                        delete glslTransforms[method]
                                        withO(window.glslSource, gls => {
                                            if (gls.prototype[method]) {
                                                delete gls.prototype[method]
                                            }
                                        })
                                    }
                                })
                            console_log('glsltransforms:', ws.glslTransforms)
                        })
                    }

                    hydra.extendTransforms = all_transforms
                    hydra._generateGlslTransforms()
                },
                () => {
                    varacc.extend({
                        hydra: new HydraSynth({pb:{}, canvas, autoLoop: false, all_transforms, makeGlobal: false})
                    })
                })
                reset_flag.has_reset = true
                reset_flag.needs_reset = false
            })

            const apply_help_functions_search_filter = () => {
                const fltr = $('#help_functions_search').val().split(/\s+/igu).map(x => x.toLowerCase())

                $('ul#help_functions')
                    .children('li')
                    .show()
                    .filter((_, x) => !(
                        fltr.reduce((p, c) => p && $(x).find('.collapsible-header').text().toLowerCase().indexOf(c) > -1, true)
                    ))
                    .hide()
            }
            $('#help_functions_search').on('keyup', (e) => {
                apply_help_functions_search_filter()
            })

            const update_help = (h) => {
                const help_list = $('#help_functions')
                const item_template = $('.template')
                withOA([h, hy=>hy.synth, sy=>sy.glslTransforms], transforms => {
                    $('ul#help_functions').find('li[class!=template]').remove()

                    Object.entries(transforms)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .forEach(([method, transform]) => {
                        const fni = $(item_template.clone())
                        fni.removeClass('template')
                        fni.find('.collapsible-header')
                            .text(`${transform.glsl_return_type} ${method}(${transform.inputs.map(x => `${x.type} ${x.name}`).join(', ')})    :${transform.type}`)
                        
                        let glsl = transform.glsl
                        if (!glsl) {
                            glsl = transform.frag
                        }

                        fni.find('.collapsible-body')
                            .append($(`<ul class="input-list">`).append(
                                transform.inputs.map(({type, name, default: default_value}) => $(`<li></li>`).text(`${type} ${name} = ${JSON.stringify(default_value)}`))
                            )).append($('<div class="glslcode"></div>').append($('<code></code>').text(glsl)))
                        help_list.append(fni)
                    })

                    apply_help_functions_search_filter()
                })
            }

            extend(fnargs, gather_args_from_hydra(varacc.hydra))
            update_help(varacc.hydra)

            withO(editors.console, (c) => c.setValue(''))

            fnargs['_run'] = false
            let cnt = 0

            // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AsyncFunction
            const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

            const old_console_log = console.log
            console.log = logger
            while (cnt++ < 2) {
                if (reset_flag.has_reset) {
                    extend(fnargs, gather_args_from_hydra(varacc.hydra))
                    update_help(varacc.hydra)
                }

                try {
                    const fnarg_names = Object.keys(fnargs)
                    const fnarg_values = fnarg_names.map(x => fnargs[x])
                    const codefun = new AsyncFunction(...fnarg_names, code)
                    console_log({fnarg_names})
                    codefun.apply(undefined, fnarg_values)
                } catch (e) {
                    console_log(e)
                    logger('error', e)
                }

                if (!reset_flag.has_reset) {
                    break
                }

                if (fnargs['_run']) {
                    break
                }

                fnargs['_run'] = true
            }
            console.log = old_console_log
        }
    
        const run_code = (code) => {
            setStorageItem('evt_eval', code)
        }
    
        events.evt_eval = local_run_code
        
        const editor = CodeMirror.fromTextArea(
            document.getElementById('hydra-input')
            , {
                name: 'editor',
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
    
        const DEFAULT_EDITOR_VALUE = `shape(3).rotate(0,0.1).out(o0)`

        const get_init_value = () => {
            let initValue = with_window((w) => {
                let rval
                if (w.location.hash.length > 1) {
                    try {
                        const hval = decodeURI(w.location.hash.substr(1))
                        rval = decompress64(hval)
                        console.log('rval:', rval)
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
                let last_hash = localStorage.getItem('evt_hash')
                if (last_hash) {
                    const leval = last_hash
                    last_hash = undefined
                    try {
                        last_hash = decodeFromStorage(leval)
                        console_log({last_hash})
                    } catch (e) {
                        console_log('error decoding last hash:', e)
                    }
                }
                
                initValue = last_hash ? last_hash : {}
            }
            if (!initValue.e) {
                initValue.e = DEFAULT_EDITOR_VALUE
            }
            if (typeof initValue.e === 'object') {
                if (Array.isArray(initValue.e)) {
                    initValue.e = initValue.e[0]
                } else {
                    if ('e' in initValue.e) {
                        initValue.e = initValue.e.e
                    }
                }
            }
            if (typeof initValue.e !== 'string') {
                initValue.e = DEFAULT_EDITOR_VALUE
            }
            return initValue
        }

        const initValue = get_init_value()
        console_log({initValue})
        editor.setValue(initValue.e)
    
        events.evt_hash = (hash) => {
            console_log('hash update', hash)
            with_window((w) => w.location.hash = encodeURI(compress64(hash)))
        }

        const hash_debouncer = new Debouncer(1000, () => setHash({e: editor.getValue()}))
    
        editor.on('changes', () => {
            hash_debouncer.run()
        })
        
        setTimeout(() => {
            editor.focus()
            run_code(editor.getValue())
        }, 500)
    
        varacc.extend({editor})
        editors.input = editor
    
        const hydra_loop = loop((dt) => {
            withO(varacc.hydra, hydra => {
                hydra.tick(dt)
            })
        })
    
        logger('Starting hydra loop')
        hydra_loop.start()
        varacc.extend({hydra_loop})
    })
    layout.init()
    
// eslint-disable-next-line no-undef
})($, GoldenLayout, get_refs))
