(() => {
    'use strict';

    // Raw GLSL sources from src/shaders/*.glsl so everything runs without bundling.
    const SHADERS = {
        cameraVert: `precision mediump float;
attribute vec4 position;
attribute vec4 vertColor;

uniform float perspective;
uniform mat4 camera;

varying vec4 fragColor;

void main() {
        vec4 pos = 2.0 * position - 1.0;
        pos.z = pos.z * 0.75 + 0.25;
        pos = camera * pos;
        float w = 1.0 + perspective*( pos.z );
        pos.z = pos.z * 0.5;
        gl_Position = vec4(pos.xyz, w);
        fragColor = vertColor;
}`,
        cameraFrag: `precision mediump float;

varying vec4 fragColor;

void main() {
        gl_FragColor = fragColor;
}`,
        flatTextureVert: `precision mediump float;

attribute vec2 position;
uniform float multY;

varying vec2 uv;

void main() {
        gl_Position = vec4(position,0.0,1.0);
        uv = position * vec2( 1.0, multY );
        uv = 0.5 * (uv+1.0);
}`,
        flatTextureFrag: `precision mediump float;

uniform sampler2D buffer;
varying vec2 uv;

void main() {
        gl_FragColor = texture2D(buffer, uv);
}`,
        diffReduce4Frag: `precision highp float;

uniform float inputDim;
uniform sampler2D bufferA;
uniform sampler2D bufferB;

const float mag = 255.0;

varying vec2 uv;

void main() {
        float ip = 1.0 / inputDim;
        float op = ip * 4.0;
        vec2 p = vec2(floor(uv.x/op)*op, floor(uv.y/op)*op );
        float sum = 0.0;
        vec2 offset = vec2(0.0);
        vec3 diff;
        for (int i=0; i<4; ++i) {
                for (int j=0; j<4; ++j) {
                        diff = texture2D(bufferA, p+offset).rgb -
                                texture2D(bufferB, p+offset).rgb;
                        sum += dot(diff,diff);
                        offset.y += ip;
                }
                offset.x += ip;
                offset.y = 0.0;
        }
        float avg = sum/16.0;
        avg /= 3.0;
        float r = floor( avg*mag ) / mag;
        float g = floor((avg-r)*mag*mag) / mag;
        float b = ((avg-r)*mag - g) * mag;
        gl_FragColor = vec4( r, g, b, 1.0 );
}`,
        avgReduce4Frag: `precision highp float;

uniform float inputDim;
uniform sampler2D buffer;

const float mag = 255.0;

varying vec2 uv;

void main() {
        float ip = 1.0 / inputDim;
        float op = ip * 4.0;
        vec2 p = vec2(floor(uv.x/op)*op, floor(uv.y/op)*op );
        float sum = 0.0;
        vec2 offset = vec2(0.0);
        vec4 col;
        for (int i=0; i<4; ++i) {
                for (int j=0; j<4; ++j) {
                        col = texture2D(buffer, p+offset);
                        sum += col.r + (col.g + col.b/mag)/mag;
                        offset.y += ip;
                }
                offset.x += ip;
                offset.y = 0.0;
        }
        float avg = sum/16.0;
        float r = floor( avg*mag ) / mag;
        float g = floor((avg-r)*mag*mag) / mag;
        float b = ((avg-r)*mag - g) * mag;
        gl_FragColor = vec4( r, g, b, 1.0 );
}`
    };

    function compileShader(gl, source, type) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile error', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    function createCameraProgram(gl) {
        const vert = compileShader(gl, SHADERS.cameraVert, gl.VERTEX_SHADER);
        const frag = compileShader(gl, SHADERS.cameraFrag, gl.FRAGMENT_SHADER);
        if (!vert || !frag) return null;
        const program = gl.createProgram();
        gl.attachShader(program, vert);
        gl.attachShader(program, frag);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program link error', gl.getProgramInfoLog(program));
            gl.deleteProgram(program);
            return null;
        }
        return program;
    }

    function init() {
        let viewCanvas = document.getElementById('view');
        const canvasContainer = document.querySelector('.canvas-frame');
        let triCloud = [];
        let paused = true;
        let gens = 0;
        let lastGpsUpdate = 0;
        let gensPerSecond = 0;
        let targetImg = null;
        let gl;
        let cameraProgram;
        let posLocation;
        let colorLocation;
        let posBuffer;
        let colorBuffer;
        let perspectiveLocation;
        let cameraLocation;

        const stats = {
            polys: document.getElementById('polys'),
            gens: document.getElementById('gens'),
            gps: document.getElementById('gps'),
            score: document.getElementById('score')
        };

        function updateStats(scoreVal = 0) {
            stats.polys.value = triCloud.length.toString();
            stats.gens.value = gens.toString();
            stats.gps.value = gensPerSecond.toFixed(1);
            stats.score.value = scoreVal.toFixed(3);
        }

        function syncPauseButton() {
            const checkbox = document.getElementById('paused');
            paused = checkbox.checked;
            document.getElementById('pauseBtn').textContent = paused ? '暫停中' : '運行中';
        }

        const randomVec = (mag = 1) => (Math.random() * 2 - 1) * mag;
        const randomColor = () => [Math.random(), Math.random(), Math.random(), 0.35 + Math.random() * 0.4];
        const randomTri = () => [
            { pos: { x: randomVec(), y: randomVec(), z: randomVec() }, color: randomColor() },
            { pos: { x: randomVec(), y: randomVec(), z: randomVec() }, color: randomColor() },
            { pos: { x: randomVec(), y: randomVec(), z: randomVec() }, color: randomColor() }
        ];

        function seedTris(count = 60) {
            triCloud = [];
            for (let i = 0; i < count; i++) {
                triCloud.push(randomTri());
            }
        }

        function mutateTri(tri, adjust = 0.5) {
            const idx = Math.floor(Math.random() * 3);
            const target = tri[idx].pos;
            target.x = Math.max(-1, Math.min(1, target.x + randomVec(adjust * 0.05)));
            target.y = Math.max(-1, Math.min(1, target.y + randomVec(adjust * 0.05)));
            target.z = Math.max(-1, Math.min(1, target.z + randomVec(adjust * 0.05)));
        }

        function jitterCloud(adjust) {
            if (triCloud.length === 0) seedTris();
            for (let i = 0; i < triCloud.length; i++) {
                mutateTri(triCloud[i], adjust);
            }
        }

        function exportData() {
            const exportable = triCloud.map(tri => tri.map(v => ({
                x: v.pos.x,
                y: v.pos.y,
                z: v.pos.z,
                color: v.color
            })));
            const data = JSON.stringify(exportable, null, 2);
            document.getElementById('data').value = data;
        }

        function importData() {
            try {
                const parsed = JSON.parse(document.getElementById('data').value);
                if (Array.isArray(parsed)) {
                    triCloud = parsed.map(tri => tri.map(v => ({
                        pos: { x: v.x, y: v.y, z: v.z },
                        color: Array.isArray(v.color) ? v.color : randomColor()
                    })));
                    updateStats();
                }
            } catch (e) {
                console.warn('Unable to parse triangle data', e);
            }
        }

        function loadImageFile(file) {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                window.loadImage(ev.target.result, (img) => {
                    targetImg = img;
                });
            };
            reader.readAsDataURL(file);
        }

        function updateBuffers(alphaRange, adjust) {
            const vertexCount = triCloud.length * 3;
            const positions = new Float32Array(vertexCount * 4);
            const colors = new Float32Array(vertexCount * 4);
            let pi = 0;
            let ci = 0;
            const shift = [0.3, 0.7, 1.0];
            triCloud.forEach(tri => {
                tri.forEach(({ pos, color }) => {
                    positions[pi++] = pos.x;
                    positions[pi++] = pos.y;
                    positions[pi++] = pos.z;
                    positions[pi++] = 1.0;

                    const base = [Math.abs(pos.x), Math.abs(pos.y), Math.abs(pos.z)];
                    colors[ci++] = base[0] * (1 - adjust) + shift[0] * adjust;
                    colors[ci++] = base[1] * (1 - adjust) + shift[1] * adjust;
                    colors[ci++] = base[2] * (1 - adjust) + shift[2] * adjust;
                    const alpha = Math.min(alphaRange[1], Math.max(alphaRange[0], (Math.abs(pos.x) + Math.abs(pos.y)) * 0.25));
                    colors[ci++] = alpha * color[3];
                });
            });

            gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(posLocation);
            gl.vertexAttribPointer(posLocation, 4, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
            gl.enableVertexAttribArray(colorLocation);
            gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0);

            return vertexCount;
        }

        const makeCameraMatrix = (theta) => {
            const c = Math.cos(theta);
            const s = Math.sin(theta);
            return new Float32Array([
                c, 0, s, 0,
                0, 1, 0, 0,
                -s, 0, c, 0,
                0, 0, 0, 1
            ]);
        };

        document.getElementById('pauseBtn').addEventListener('click', () => {
            const checkbox = document.getElementById('paused');
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        });

        document.getElementById('paused').addEventListener('change', syncPauseButton);
        document.getElementById('export').addEventListener('click', exportData);
        document.getElementById('import').addEventListener('click', importData);
        document.getElementById('uploadTrigger').addEventListener('click', () => document.getElementById('imageInput').click());
        document.getElementById('imageInput').addEventListener('change', (ev) => loadImageFile(ev.target.files[0]));

        seedTris();
        syncPauseButton();

        let lastGenTimestamp = performance.now();
        let scratchLayer;

        const sketch = (p) => {
            p.setup = () => {
                if (viewCanvas && viewCanvas.parentNode) {
                    viewCanvas.parentNode.removeChild(viewCanvas);
                }
                const cnv = p.createCanvas(500, 500, p.WEBGL);
                cnv.canvas.id = 'view';
                if (canvasContainer) cnv.parent(canvasContainer);
                viewCanvas = cnv.canvas;

                gl = p._renderer.GL;
                gl.disable(gl.DEPTH_TEST);
                gl.enable(gl.BLEND);
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

                cameraProgram = createCameraProgram(gl);
                posLocation = gl.getAttribLocation(cameraProgram, 'position');
                colorLocation = gl.getAttribLocation(cameraProgram, 'vertColor');
                perspectiveLocation = gl.getUniformLocation(cameraProgram, 'perspective');
                cameraLocation = gl.getUniformLocation(cameraProgram, 'camera');

                posBuffer = gl.createBuffer();
                colorBuffer = gl.createBuffer();

                p.noStroke();
                scratchLayer = p.createGraphics(500, 500, p.WEBGL);
            };

            p.windowResized = () => {
                p.resizeCanvas((viewCanvas && viewCanvas.clientWidth) || 500, 500);
            };

            p.draw = () => {
                const now = performance.now();
                const dt = (now - lastGenTimestamp) / 1000;
                if (dt > 0.5) {
                    gensPerSecond = (gens - lastGpsUpdate) / dt;
                    lastGenTimestamp = now;
                    lastGpsUpdate = gens;
                }

                const adjust = parseFloat(document.getElementById('adjust').value) || 0.5;
                const gensPerFrame = parseInt(document.getElementById('gensPerFrame').value, 10) || 1;
                const alphaMin = parseFloat(document.getElementById('minAlpha').value) || 0.1;
                const alphaMax = parseFloat(document.getElementById('maxAlpha').value) || 0.5;
                const tolerance = parseFloat(document.getElementById('preferFewer').value) || 0.001;

                if (!paused) {
                    for (let i = 0; i < gensPerFrame; i++) {
                        jitterCloud(adjust);
                        gens += 1;
                    }
                }

                const spread = triCloud.reduce((acc, tri) => {
                    const mag = tri.reduce((m, v) => m + Math.abs(v.pos.x) + Math.abs(v.pos.y), 0);
                    return acc + mag;
                }, 0) / Math.max(triCloud.length, 1);
                const score = Math.max(0, 1.5 - (spread * 0.15 + tolerance));

                p.background(8, 12, 24);

                if (cameraProgram) {
                    gl.useProgram(cameraProgram);
                    const vertCount = updateBuffers([alphaMin, alphaMax], adjust);
                    const cameraMatrix = makeCameraMatrix(p.frameCount * 0.002);
                    gl.uniform1f(perspectiveLocation, 0.2);
                    gl.uniformMatrix4fv(cameraLocation, false, cameraMatrix);
                    gl.viewport(0, 0, p.width, p.height);
                    gl.clear(gl.COLOR_BUFFER_BIT);
                    gl.drawArrays(gl.TRIANGLES, 0, vertCount);
                }

                if (document.getElementById('showRef').checked && targetImg) {
                    p.push();
                    p.resetMatrix();
                    p.translate(-p.width / 2, -p.height / 2, 0);
                    p.image(targetImg, 0, 0, p.width, p.height);
                    p.pop();
                }

                if (document.getElementById('showScr').checked) {
                    scratchLayer.push();
                    scratchLayer.clear();
                    scratchLayer.noStroke();
                    scratchLayer.fill(120, 170, 255, 50);
                    scratchLayer.rect(-scratchLayer.width / 2, -scratchLayer.height / 2, scratchLayer.width, scratchLayer.height);
                    scratchLayer.pop();
                    p.resetMatrix();
                    p.image(scratchLayer, -p.width / 2, -p.height / 2, p.width, p.height);
                }

                updateStats(score);
            };
        };

        new window.p5(sketch, document.body);
    }

    window.addEventListener('DOMContentLoaded', init);
})();
