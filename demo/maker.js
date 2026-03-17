import { Projectron } from '../src'
var $ = s => document.getElementById(s)

/*
 * init projectron
 */

var size = 256
var s = parseInt(new URLSearchParams(location.search).get('size'))
if (s > 8) size = s

var canvas = $('view')
var proj = new Projectron(canvas, size)

// 給 index.html 內 inline script 使用（顯示側視圖參考用）
window.p = proj

var mainImage = null   // 主視圖影像
var sideImage = null   // 側視圖影像（右 +90° 用）

// ==== 預設圖片路徑（在這裡改檔名即可） ====
var mainDefaultSrc = './img/1.png' // 主視圖預設圖
var sideDefaultSrc = './img/TS.jpg' // 側視圖預設圖
// =======================================

// 預設主視圖
if (mainDefaultSrc) {
    var imgMain = new Image()
    imgMain.onload = () => { setMainImage(imgMain) }
    imgMain.onerror = () => {
        console.warn('主視圖預設圖片載入失敗：', mainDefaultSrc)
    }
    imgMain.src = mainDefaultSrc
}

// 預設側視圖
if (sideDefaultSrc) {
    var imgSide = new Image()
    imgSide.onload = () => { setSideImage(imgSide) }
    imgSide.onerror = () => {
        console.warn('側視圖預設圖片載入失敗：', sideDefaultSrc)
    }
    imgSide.src = sideDefaultSrc
}

// 設定主視圖 target
function setMainImage(imgObj) {
    generations = 0
    mainImage = imgObj
    proj.setTargetImage(imgObj)

    var thumb = $('thumbMain')
    if (thumb) thumb.src = imgObj.src
}

// 設定側視圖 target（會啟用雙視角幾何平均）
function setSideImage(imgObj) {
    sideImage = imgObj
    proj.setTargetImage2(imgObj)

    var thumb = $('thumbSide')
    if (thumb) thumb.src = imgObj.src
}

console.log('GLSL-Projectron  ver ' + proj.version)

/*
 * rendering loop
 */

var paused = true
var showReference = false
var showScratch = false

var cameraRot = [0, 0]
var generations = 0
var gensPerFrame = 20
var gensPerSec = 0

// flags
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
            case 0:
                // 正常 3D 視角：這裡是主 camera
                proj.draw(-cameraRot[0], -cameraRot[1])
                break
            case 1:
                proj.drawTargetImage()      // 主視圖參考
                break
            case 2:
                proj._drawScratchImage()    // 主視圖 scratch
                break
        }
        drawNeeded = false
        lastDraw = now
    }
    requestAnimationFrame(render)
}
render()

/*
 * settings / ui
 */

var setupInput = (el, handler) => {
    $(el).addEventListener('change', ev => {
        var t = ev.target.type
        if (t === 'checkbox') return handler(ev.target.checked)
        return handler(ev.target.value)
    })
}

setupInput('paused',       val => { paused = val })
setupInput('showRef',      val => { showReference = val })
setupInput('showScr',      val => { showScratch = val })
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

$('exportPly').addEventListener('click', ev => {
    var ply = proj.exportPLY()
    var blob = new Blob([ply], { type: 'application/octet-stream' })
    var url = URL.createObjectURL(blob)
    var link = document.createElement('a')
    link.href = url
    link.download = 'projectron-export.ply'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 0)
})

$('import').addEventListener('click', ev => {
    var dat = $('data').value
    var res = proj.importData(dat)
    if (res) {
        $('data').value = ''
        drawNeeded = true
    }
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
 * reset / clear project
 */

function resetProject() {
    paused = true
    var pausedCheckbox = $('paused')
    if (pausedCheckbox) pausedCheckbox.checked = true

    generations    = 0
    gensPerSec     = 0
    lastGenCt      = 0
    lastDraw       = 0
    lastHtmlUpdate = performance.now()
    drawNeeded     = true

    proj = new Projectron(canvas, size)
    window.p = proj   // 更新給 index.html 的按鈕使用

    var minAlphaVal = parseFloat($('minAlpha').value) || 0.1
    var maxAlphaVal = parseFloat($('maxAlpha').value) || 0.5
    proj.setAlphaRange(minAlphaVal, maxAlphaVal)
    proj.setAdjustAmount(parseFloat($('adjust').value) || 0.5)
    proj.setFewerPolyTolerance(parseFloat($('preferFewer').value) || 0)

    // 若已有主視圖／側視圖，重設為目標
    if (mainImage) {
        proj.setTargetImage(mainImage)
    }
    if (sideImage) {
        proj.setTargetImage2(sideImage)
    }

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
 * mouse drag / cameraAngle
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
 * drag-drop + file inputs
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

function loadTextFromFile(file, onLoad) {
    if (!file) return
    var reader = new FileReader()
    reader.onloadend = e => onLoad(e.target.result || '')
    reader.readAsText(file)
}

window.addEventListener('load', function () {
    var stopPrevent = ev => {
        ev.stopPropagation()
        ev.preventDefault()
    }

    dropTarget.addEventListener('dragenter', stopPrevent)
    dropTarget.addEventListener('dragover',  stopPrevent)
    dropTarget.addEventListener('drop', ev => {
        stopPrevent(ev)
        var url = ev.dataTransfer.getData('text/plain')
        var imgTmp = new Image()
        if (url) {
            imgTmp.onload = () => { setMainImage(imgTmp) }
            imgTmp.src = url
        } else {
            var file = ev.dataTransfer.files[0]
            loadImageFromFile(file, setMainImage)
        }
    })

    // 主視圖：按鈕 + input
    var fileInput1 = $('imageInput')
    var uploadBtn1 = $('uploadTrigger')

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

    // 側視圖：按鈕 + input（右側 +90° 視角對應的影像）
    var fileInput2 = $('imageInput2')
    var uploadBtn2 = $('uploadTrigger2')

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

    var plyInput = $('plyInput')
    var importPlyBtn = $('importPly')

    if (plyInput && importPlyBtn) {
        importPlyBtn.addEventListener('click', () => {
            plyInput.value = ''
            plyInput.click()
        })

        plyInput.addEventListener('change', ev => {
            var file = ev.target.files && ev.target.files[0]
            loadTextFromFile(file, text => {
                var res = proj.importPLY(text)
                if (res) {
                    $('data').value = ''
                    drawNeeded = true
                }
            })
        })
    }
})
