
import { Projectron } from '../src'





/*
 * 
 *      init
 * 
*/


var canvas = document.getElementById('view')
var status = document.getElementById('viewerStatus')
var dataInput = document.getElementById('dataInput')
var loadButton = document.getElementById('loadData')
var proj = new Projectron(canvas)

// set the canvas size to its displayed size
canvas.width = canvas.clientWidth
canvas.height = canvas.clientHeight

var loadData = data => {
    var trimmed = (data || '').trim()
    if (!trimmed) {
        if (status) status.textContent = '請貼上從 maker 匯出的資料再載入'
        return
    }
    proj.importData(trimmed)
    if (dataInput && !dataInput.value.trim()) dataInput.value = trimmed
    if (status) status.textContent = '已載入資料，可拖曳旋轉檢視'
    drawNeeded = true
}

document.body.onload = () => {
    var data = document.getElementById('viewData').textContent
    loadData(data)
    requestAnimationFrame(render)
}

if (loadButton && dataInput) {
    loadButton.addEventListener('click', () => loadData(dataInput.value))
}







/*
 * 
 *      render loop
 * 
*/

var cameraRot = [0, 0]
var drawNeeded = true

function render() {
    if (drawNeeded) {
        proj.draw(-cameraRot[0], -cameraRot[1])
        drawNeeded = false
    }
    requestAnimationFrame(render)
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
    if (ev.originalEvent) ev = ev.originalEvent
    dragging = false
    returnCamera()
}
canvas.addEventListener('mousedown', startDrag)
canvas.addEventListener('touchstart', startDrag)
document.body.addEventListener('mouseup', stopDrag)
document.body.addEventListener('touchend', stopDrag)
document.body.addEventListener('mousemove', drag)
document.body.addEventListener('touchmove', drag)


// update/debounce
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

