// Art Gallery (src/animations/art-gallery/shaders): the background gradient and the mosaic, as
// RN's WebGPU canvas draws them into its bgra8unorm (encoded sRGB, no conversion) texture. The
// vertex and fragment code is RN's (mosaic-vertex.ts, mosaic-fragment.ts, background-shader.ts)
// line for line; the deduped atlas is a single texture, so the fragment samples that one where
// RN samples seven and keeps the first (every tile's atlasIndex is 0). They draw into the
// surface's `scene` (rgba8unorm, the same encoded values); art_gallery_present.wgsl puts it on
// the screen.

struct Uniforms {
    screenWidth: f32,
    screenHeight: f32,
    focusedX: f32,
    focusedY: f32,
    atlasWidth: f32,
    atlasHeight: f32,
    contrast: f32,
    time: f32,
    scale: f32,
    translateX: f32,
    translateY: f32,
    animProgress: f32,
    atlasReveal: f32,
    cellWidth: f32,
    cellHeight: f32,
    focusIntensity: f32,
    // The background's own uniforms (RN's second buffer): the canvas in device pixels.
    pixelWidth: f32,
    pixelHeight: f32,
    pad0: f32,
    pad1: f32,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
// 12 floats per tile: [posX, posY, width, height, uvX, uvY, uvW, uvH, atlasIndex, pad, pad, pad].
@group(0) @binding(1) var<storage, read> tiles: array<f32>;
@group(0) @binding(2) var<storage, read> oldTiles: array<f32>;
@group(0) @binding(3) var atlasTexture: texture_2d<f32>;
@group(0) @binding(4) var atlasSampler: sampler;

@vertex
fn bg_vs(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4<f32> {
    // Fullscreen triangle (covers entire screen with 3 vertices)
    var pos = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
    return vec4<f32>(pos[vertexIndex], 0.0, 1.0);
}

@fragment
fn bg_fs(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
    let centerX = uniforms.pixelWidth / 2.0;
    let centerY = uniforms.pixelHeight / 2.0;
    let dx = fragCoord.x - centerX;
    let dy = fragCoord.y - centerY;
    let refSize = min(uniforms.pixelWidth, uniforms.pixelHeight);
    let dist = sqrt(dx * dx + dy * dy) / refSize;
    let centerBrightness = 0.12;
    let edgeBrightness = 0.02;
    let falloff = smoothstep(0.1, 0.7, dist);
    let brightness = mix(centerBrightness, edgeBrightness, falloff);
    return vec4<f32>(vec3<f32>(brightness), 1.0);
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) atlasUV: vec2<f32>,
    @location(1) @interpolate(flat) atlasIndex: u32,
    @location(2) @interpolate(flat) focusDim: f32,
};

@vertex
fn tile_vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
    var output: VertexOutput;
    let quadIndex = vertexIndex % 6u;
    var localPos: vec2<f32>;
    var localUV: vec2<f32>;
    switch (quadIndex) {
        case 0u: { localPos = vec2<f32>(0.0, 0.0); localUV = vec2<f32>(0.0, 0.0); }
        case 1u: { localPos = vec2<f32>(1.0, 0.0); localUV = vec2<f32>(1.0, 0.0); }
        case 2u: { localPos = vec2<f32>(0.0, 1.0); localUV = vec2<f32>(0.0, 1.0); }
        case 3u: { localPos = vec2<f32>(0.0, 1.0); localUV = vec2<f32>(0.0, 1.0); }
        case 4u: { localPos = vec2<f32>(1.0, 0.0); localUV = vec2<f32>(1.0, 0.0); }
        case 5u: { localPos = vec2<f32>(1.0, 1.0); localUV = vec2<f32>(1.0, 1.0); }
        default: { localPos = vec2<f32>(0.0, 0.0); localUV = vec2<f32>(0.0, 0.0); }
    }
    let tileOffset = instanceIndex * 12u;
    let tileX = tiles[tileOffset + 0u];
    let tileY = tiles[tileOffset + 1u];
    let tileW = tiles[tileOffset + 2u];
    let tileH = tiles[tileOffset + 3u];
    let uvX = tiles[tileOffset + 4u];
    let uvY = tiles[tileOffset + 5u];
    let uvW = tiles[tileOffset + 6u];
    let uvH = tiles[tileOffset + 7u];
    let atlasIdx = u32(tiles[tileOffset + 8u]);
    let oldX = oldTiles[tileOffset + 0u];
    let oldY = oldTiles[tileOffset + 1u];
    let oldW = oldTiles[tileOffset + 2u];
    let oldH = oldTiles[tileOffset + 3u];

    // Animation progress: t goes from 1 (old) to 0 (new)
    let t = uniforms.animProgress;
    let posX = mix(tileX, oldX, t);
    let posY = mix(tileY, oldY, t);
    var sizeW = mix(tileW, oldW, t);
    var sizeH = mix(tileH, oldH, t);

    // Random tile reveal - each tile has a random threshold within its atlas band
    let seed = f32(instanceIndex);
    let randomDelay = fract(sin(seed * 12.9898 + 78.233) * 43758.5453);
    let revealThreshold = f32(atlasIdx) + randomDelay * 0.95;
    let revealDelta = uniforms.atlasReveal - revealThreshold;
    let revealT = clamp(revealDelta * 8.0, 0.0, 1.0);
    let overshoot = 1.0 + sin(revealT * 3.14159) * 0.15;
    let revealScale = revealT * overshoot;
    sizeW *= revealScale;
    sizeH *= revealScale;

    let deltaX = tileX - oldX;
    let deltaY = tileY - oldY;
    let moveDistance = sqrt(deltaX * deltaX + deltaY * deltaY);
    let normalizedMove = min(moveDistance / uniforms.screenWidth, 1.0);
    let effectIntensity = sin(t * 3.14159);
    let zDepth = effectIntensity * (80.0 + normalizedMove * 120.0);
    let rotationAmount = effectIntensity * 0.15 * normalizedMove;
    let cornerX = (localPos.x - 0.5) * sizeW;
    let cornerY = (localPos.y - 0.5) * sizeH;
    let cosR = cos(rotationAmount);
    let sinR = sin(rotationAmount);
    let rotatedX = cornerX * cosR;
    let rotatedZ = cornerX * sinR;
    let tileCenterX = posX + sizeW * 0.5;
    let tileCenterY = posY + sizeH * 0.5;
    let worldX = tileCenterX + rotatedX;
    let worldY = tileCenterY + cornerY;
    let worldZ = zDepth + rotatedZ * 20.0;
    let scaledX = worldX * uniforms.scale;
    let scaledY = worldY * uniforms.scale;
    var screenX = scaledX + uniforms.translateX + uniforms.screenWidth / 2.0;
    var screenY = scaledY + uniforms.translateY + uniforms.screenHeight / 2.0;
    let cameraZ = 800.0;
    let perspectiveFactor = cameraZ / (cameraZ - worldZ);
    let blendedPerspective = mix(1.0, perspectiveFactor, effectIntensity);
    let screenCenterX = uniforms.screenWidth / 2.0;
    let screenCenterY = uniforms.screenHeight / 2.0;
    screenX = screenCenterX + (screenX - screenCenterX) * blendedPerspective;
    screenY = screenCenterY + (screenY - screenCenterY) * blendedPerspective;
    let ndcX = 2.0 * (screenX / uniforms.screenWidth) - 1.0;
    let ndcY = 1.0 - 2.0 * (screenY / uniforms.screenHeight);
    let ndcZ = worldZ / 1000.0;

    output.position = vec4<f32>(ndcX, ndcY, clamp(ndcZ, 0.0, 1.0), 1.0);
    output.atlasUV = vec2<f32>(uvX + localUV.x * uvW, uvY + localUV.y * uvH);
    output.atlasIndex = atlasIdx;

    var focusDim = 0.0;
    if (uniforms.focusedX > -9000.0 && uniforms.focusIntensity > 0.001) {
        let tileCenterX = posX + sizeW * 0.5;
        let tileCenterY = posY + sizeH * 0.5;
        let dx = (tileCenterX - uniforms.focusedX) / uniforms.cellWidth;
        let dy = (tileCenterY - uniforms.focusedY) / uniforms.cellHeight;
        let dist = sqrt(dx * dx + dy * dy);
        let falloff = clamp(dist, 0.0, 1.0);
        focusDim = 0.8 * falloff * uniforms.focusIntensity;
    }
    output.focusDim = focusDim;
    return output;
}

@fragment
fn tile_fs(input: VertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(atlasTexture, atlasSampler, input.atlasUV);
    // Apply contrast boost
    let contrast = uniforms.contrast;
    let offset = 0.5 * (1.0 - contrast);
    var boosted = color.rgb * contrast + vec3<f32>(offset);
    // Apply focus dimming (focusDim = 0 for focused cell, 0.8 for others)
    boosted = boosted * (1.0 - input.focusDim);
    return vec4<f32>(clamp(boosted, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
