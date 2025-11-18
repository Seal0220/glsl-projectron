import { Projectron } from '../src'
var $ = s => document.getElementById(s)

/*
 * 
 *      init projectron
 * 
*/

var size = 256
var s = parseInt(new URLSearchParams(location.search).get('size'))
if (s > 8) size = s

var canvas = $('view')
var proj = new Projectron(canvas, size)

// 主視圖 / 側視圖
var mainImage = null
var sideImage = null

var img = new Image()
img.onload = () => { setMainImage(img) }
img.src = './img/chen.jpg'

// img.src = './img/lena.png'
// img.src = './img/teapot512.png'

function setMainImage(img) {
    generations = 0
    mainImage = img
    proj.setTargetImage(img)
}

console.log('GLSL-Projectron  ver ' + proj.version)

/*
 * 
 *      rendering loop
 * 
*/

var paused = true
var showReference = false
var showScratch = false

var cameraRot = [0, 0]
var generations = 0
var gensPerFrame = 20
var gensPerSec = 0

// flags etc
var drawNeeded = true
var lastDraw = 0
var lastGenCt = 0
var lastHtmlUpdate = 0

function render() {
    if (!paused) {
        for (var i = 0; i < gensPerFrame; i++) proj.runGeneration()
        generations += gensPerFrame
    }
    var now = performance.now()
    if (now - lastHtmlUpdate > 500) {
        gensPerSec = (generations - lastGenCt) / (now - lastHtmlUpdate) * 1000
        updateHTML()
        lastGenCt = generations
        lastHtmlUpdate = now
    }
    if (now - lastDraw > 500 || (paused && drawNeeded)) {
        var mode = (showReference) ? 1 : (showScratch) ? 2 : 0
        switch (mode) {
            case 0: proj.draw(-cameraRot[0], -cameraRot[1]); break
            case 1: proj.drawTargetImage(); break
            case 2: proj._drawScratchImage(); break
        }
        drawNeeded = false
        lastDraw = now
    }
    requestAnimationFrame(render)
}
render()

/*
 * 
 *      settings / ui
 * 
*/

var setupInput = (el, handler) => {
    $(el).addEventListener('change', ev => {
        var t = ev.target.type
        if (t === 'checkbox') return handler(ev.target.checked)
        return handler(ev.target.value)
    })
}

setupInput('paused', val => { paused = val })
setupInput('showRef', val => { showReference = val })
setupInput('showScr', val => { showScratch = val })
setupInput('gensPerFrame', val => { gensPerFrame = parseInt(val) })

var minAlpha = 0.1
var maxAlpha = 0.5
var setAlpha = () => proj.setAlphaRange(minAlpha, maxAlpha)
setupInput('minAlpha', val => { minAlpha = parseFloat(val); setAlpha() })
setupInput('maxAlpha', val => { maxAlpha = parseFloat(val); setAlpha() })
setupInput('adjust',   val => { proj.setAdjustAmount(parseFloat(val) || 0.5) })
setupInput('preferFewer', val => { proj.setFewerPolyTolerance(parseFloat(val) || 0) })

$('export').addEventListener('click', ev => {
    var dat = proj.exportData()
    $('data').value = dat
})

$('import').addEventListener('click', ev => {
    var dat = $('data').value
    var res = proj.importData(dat)
    if (res) $('data').value = ''
})

function updateHTML() {
    $('polys').value = proj.getNumPolys()
    $('score').value = proj.getScore().toFixed(5)
    $('gens').value  = generations
    $('gps').value   = gensPerSec.toFixed(0)
    $('paused').checked = paused
}

document.onkeydown = ev => {
    if (ev.keyCode === 32) {
        ev.preventDefault()
        paused = !paused
        $('paused').checked = paused
    }
}

/*
 * 
 *      reset / clear project
 * 
*/

function resetProject() {
    // 停止演化
    paused = true
    var pausedCheckbox = $('paused')
    if (pausedCheckbox) pausedCheckbox.checked = true

    // 統計歸零
    generations    = 0
    gensPerSec     = 0
    lastGenCt      = 0
    lastDraw       = 0
    lastHtmlUpdate = performance.now()
    drawNeeded     = true

    // 重新 new 一個 Projectron，真正清除多邊形
    proj = new Projectron(canvas, size)

    // 套回 UI 參數
    var minAlphaVal = parseFloat($('minAlpha').value) || 0.1
    var maxAlphaVal = parseFloat($('maxAlpha').value) || 0.5
    proj.setAlphaRange(minAlphaVal, maxAlphaVal)
    proj.setAdjustAmount(parseFloat($('adjust').value) || 0.5)
    proj.setFewerPolyTolerance(parseFloat($('preferFewer').value) || 0)

    // 用「主視圖」再次當作 target，從零開始逼近
    if (mainImage) {
        proj.setTargetImage(mainImage)
    }

    // UI 顯示歸零
    $('polys').value = 0
    $('gens').value  = 0
    $('gps').value   = 0
    $('score').value = '0.00000'
}

var resetBtn = $('resetBtn')
if (resetBtn) {
    resetBtn.addEventListener('click', resetProject)
}

/*
 * 
 *      mouse drag / cameraAngle
 * 
*/

var rotScale = 1 / 150
var cameraReturn = 0.9
var dragging = false
var lastLoc = [0, 0]

var getEventLoc = ev => {
    if (typeof ev.clientX === 'number') return [ev.clientX, ev.clientY]
    if (ev.targetTouches && ev.targetTouches.length) {
        var touch = ev.targetTouches[0]
        return [touch.clientX, touch.clientY]
    }
    return null
}
var startDrag = ev => {
    ev.preventDefault()
    dragging = true
    lastLoc = getEventLoc(ev) || lastLoc
}
var drag = ev => {
    if (!dragging) return
    var loc = getEventLoc(ev)
    if (!loc) return
    ev.preventDefault()
    cameraRot[0] += (loc[0] - lastLoc[0]) * rotScale
    cameraRot[1] += (loc[1] - lastLoc[1]) * rotScale
    lastLoc = loc
    drawNeeded = true
}
var stopDrag = ev => {
    dragging = false
    returnCamera()
}
canvas.addEventListener('mousedown', startDrag)
canvas.addEventListener('touchstart', startDrag)
document.body.addEventListener('mouseup', stopDrag)
document.body.addEventListener('touchend', stopDrag)
document.body.addEventListener('mousemove', drag)
document.body.addEventListener('touchmove', drag)

function returnCamera() {
    if (dragging) return
    cameraRot.forEach((rot, i) => {
        rot *= cameraReturn
        cameraRot[i] = (Math.abs(rot) < 1e-4) ? 0 : rot
        drawNeeded = true
    })
    if (cameraRot[0] || cameraRot[1]) {
        requestAnimationFrame(returnCamera)
    }
}

/*
 * 
 *      drag-drop / file input for images
 * 
*/

var dropTarget = document.body

function loadImageFromFile(file, onLoad) {
    if (!file || !file.type.match(/image.*/)) return
    var img = new Image()
    img.onload = () => onLoad(img)
    var reader = new FileReader()
    reader.onloadend = e => { img.src = e.target.result }
    reader.readAsDataURL(file)
}

window.addEventListener('load', function () {
    var stopPrevent = ev => {
        ev.stopPropagation()
        ev.preventDefault()
    }

    // drag & drop 更換主視圖
    dropTarget.addEventListener('dragenter', stopPrevent)
    dropTarget.addEventListener('dragover',  stopPrevent)
    dropTarget.addEventListener('drop', ev => {
        stopPrevent(ev)
        var url = ev.dataTransfer.getData('text/plain')
        var img = new Image()
        if (url) {
            img.onload = () => { setMainImage(img) }
            img.src = url
        } else {
            var file = ev.dataTransfer.files[0]
            loadImageFromFile(file, setMainImage)
        }
    })

    // 主視圖：檔案選擇
    var fileInput1  = $('imageInput')
    var uploadBtn1  = $('uploadTrigger')

    if (fileInput1 && uploadBtn1) {
        uploadBtn1.addEventListener('click', () => {
            fileInput1.value = ''
            fileInput1.click()
        })

        fileInput1.addEventListener('change', ev => {
            var file = ev.target.files && ev.target.files[0]
            loadImageFromFile(file, setMainImage)
        })
    }

    // 側視圖：第二張圖片（目前先存成 sideImage，之後可用於多視角優化）
    var fileInput2 = $('imageInput2')
    var uploadBtn2 = $('uploadTrigger2')

    function setSideImage(img) {
        sideImage = img
        // 目前只紀錄起來，之後你在 Projectron 核心裡用來做第二視角的 target
        // 例如未來可以呼叫 proj.setTargetImages(mainImage, sideImage)
        // 或在 GPU 比分時同時計算兩個投影誤差
    }

    if (fileInput2 && uploadBtn2) {
        uploadBtn2.addEventListener('click', () => {
            fileInput2.value = ''
            fileInput2.click()
        })

        fileInput2.addEventListener('change', ev => {
            var file = ev.target.files && ev.target.files[0]
            loadImageFromFile(file, setSideImage)
        })
    }
})
