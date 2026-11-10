//! Images, as `useImage` gives them to `<Image>`, an image shader and `<Atlas>`: decoded once
//! ([`Image::from_jpeg`], [`Image::from_rgba`]) and uploaded once as one mipmapped texture
//! array ([`Images::upload`]) that a [`crate::Renderer`] samples ([`crate::Renderer::set_images`]).
//! A texture a canvas drew into once (`useTexture`, an atlas of glyphs) is [`Images::target`].
//!
//! Every layer is padded to the largest image's size by repeating its edge pixels, so the
//! coarser mip levels never bleed transparent padding into an image's border. Texels are
//! premultiplied, sRGB-encoded (as Skia keeps an `SkImage` in an sRGB surface); filtering
//! happens in that encoding, as Skia's does.

use crate::wgpu;

/// A decoded bitmap: premultiplied RGBA8, sRGB-encoded, rows top to bottom.
#[derive(Clone, Debug)]
pub struct Image {
    /// Pixels across.
    pub width: u32,
    /// Pixels down.
    pub height: u32,
    /// `width × height × 4` bytes.
    pub pixels: Vec<u8>,
}

impl Image {
    /// A JPEG file's pixels (baseline or progressive), opaque.
    pub fn from_jpeg(bytes: &[u8]) -> Option<Image> {
        use zune_jpeg::zune_core::bytestream::ZCursor;
        use zune_jpeg::zune_core::colorspace::ColorSpace;
        use zune_jpeg::zune_core::options::DecoderOptions;
        let options = DecoderOptions::default().jpeg_set_out_colorspace(ColorSpace::RGBA);
        let mut decoder = zune_jpeg::JpegDecoder::new_with_options(ZCursor::new(bytes), options);
        let pixels = decoder.decode().ok()?;
        let info = decoder.info()?;
        let (width, height) = (info.width as u32, info.height as u32);
        (pixels.len() == (width * height * 4) as usize).then_some(Image { width, height, pixels })
    }

    /// Straight-alpha RGBA8 pixels, premultiplied here.
    pub fn from_rgba(width: u32, height: u32, mut pixels: Vec<u8>) -> Image {
        for p in pixels.chunks_exact_mut(4) {
            let a = p[3] as u32;
            for c in &mut p[..3] {
                *c = ((*c as u32 * a + 127) / 255) as u8;
            }
        }
        Image { width, height, pixels }
    }
}

/// One image of an [`Images`] set, as a paint names it: its layer and size in pixels.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct ImageRef {
    /// The texture array's layer.
    pub layer: u32,
    /// Pixels across.
    pub width: f32,
    /// Pixels down.
    pub height: f32,
}

/// A set of images on the GPU: one texture array, a layer each, mipmapped.
pub struct Images {
    texture: wgpu::Texture,
    pub(crate) view: wgpu::TextureView,
    sizes: Vec<(u32, u32)>,
}

impl Images {
    /// Uploads `images` (each its own layer, padded to the largest), with their mip chains.
    pub fn upload(device: &wgpu::Device, queue: &wgpu::Queue, images: &[&Image]) -> Images {
        let w = images.iter().map(|i| i.width).max().unwrap_or(1).max(1);
        let h = images.iter().map(|i| i.height).max().unwrap_or(1).max(1);
        let layers = images.len().max(1) as u32;
        let levels = 32 - w.max(h).leading_zeros();
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("skia images"),
            size: wgpu::Extent3d { width: w, height: h, depth_or_array_layers: layers },
            mip_level_count: levels,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        let mut level = vec![0u8; (w * h * 4) as usize];
        for (layer, image) in images.iter().enumerate() {
            // The image, its last column and row repeated out to the layer's size.
            for y in 0..h {
                let sy = y.min(image.height.saturating_sub(1));
                for x in 0..w {
                    let sx = x.min(image.width.saturating_sub(1));
                    let s = ((sy * image.width + sx) * 4) as usize;
                    let d = ((y * w + x) * 4) as usize;
                    level[d..d + 4].copy_from_slice(&image.pixels[s..s + 4]);
                }
            }
            let (mut lw, mut lh) = (w, h);
            let mut current = level.clone();
            for mip in 0..levels {
                queue.write_texture(
                    wgpu::TexelCopyTextureInfo {
                        texture: &texture,
                        mip_level: mip,
                        origin: wgpu::Origin3d { x: 0, y: 0, z: layer as u32 },
                        aspect: wgpu::TextureAspect::All,
                    },
                    &current,
                    wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(lw * 4), rows_per_image: Some(lh) },
                    wgpu::Extent3d { width: lw, height: lh, depth_or_array_layers: 1 },
                );
                let (nw, nh) = ((lw / 2).max(1), (lh / 2).max(1));
                let mut next = vec![0u8; (nw * nh * 4) as usize];
                for y in 0..nh {
                    for x in 0..nw {
                        for c in 0..4 {
                            let at = |dx: u32, dy: u32| current[((((2 * y + dy).min(lh - 1)) * lw + (2 * x + dx).min(lw - 1)) * 4 + c) as usize] as u32;
                            next[((y * nw + x) * 4 + c) as usize] = ((at(0, 0) + at(1, 0) + at(0, 1) + at(1, 1) + 2) / 4) as u8;
                        }
                    }
                }
                current = next;
                (lw, lh) = (nw, nh);
            }
        }
        let view = texture.create_view(&wgpu::TextureViewDescriptor { dimension: Some(wgpu::TextureViewDimension::D2Array), ..Default::default() });
        Images { texture, view, sizes: images.iter().map(|i| (i.width, i.height)).collect() }
    }

    /// One image as one level, no mip chain: what `<Image>` / `drawImageRect` sample with RN
    /// Skia's default `SkSamplingOptions(SkFilterMode::kLinear)` (bilinear at level 0, however
    /// far it is scaled down), and no CPU time spent on levels nothing reads.
    pub fn upload_unmipped(device: &wgpu::Device, queue: &wgpu::Queue, image: &Image) -> Images {
        let (w, h) = (image.width.max(1), image.height.max(1));
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("skia image (one level)"),
            size: wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        if image.pixels.len() == (w * h * 4) as usize {
            queue.write_texture(
                wgpu::TexelCopyTextureInfo { texture: &texture, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
                &image.pixels,
                wgpu::TexelCopyBufferLayout { offset: 0, bytes_per_row: Some(w * 4), rows_per_image: Some(h) },
                wgpu::Extent3d { width: w, height: h, depth_or_array_layers: 1 },
            );
        }
        let view = texture.create_view(&wgpu::TextureViewDescriptor { dimension: Some(wgpu::TextureViewDimension::D2Array), ..Default::default() });
        Images { texture, view, sizes: vec![(w, h)] }
    }

    /// One layer of `width`×`height` a canvas draws into ([`Images::render_view`]), then sampled
    /// as image 0 (`useTexture`, `drawAsImage`). One mip level.
    pub fn target(device: &wgpu::Device, width: u32, height: u32) -> Images {
        let (width, height) = (width.max(1), height.max(1));
        let texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("skia image target"),
            size: wgpu::Extent3d { width, height, depth_or_array_layers: 1 },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let view = texture.create_view(&wgpu::TextureViewDescriptor { dimension: Some(wgpu::TextureViewDimension::D2Array), ..Default::default() });
        Images { texture, view, sizes: vec![(width, height)] }
    }

    /// A [`Images::target`]'s layer as a render target ([`wgpu::TextureFormat::Rgba8Unorm`]).
    pub fn render_view(&self) -> wgpu::TextureView {
        self.texture.create_view(&wgpu::TextureViewDescriptor { dimension: Some(wgpu::TextureViewDimension::D2), base_array_layer: 0, array_layer_count: Some(1), ..Default::default() })
    }

    /// The `index`th image, for a paint.
    pub fn image(&self, index: usize) -> ImageRef {
        let (w, h) = self.sizes.get(index).copied().unwrap_or((1, 1));
        ImageRef { layer: index as u32, width: w as f32, height: h as f32 }
    }

    /// How many images.
    pub fn len(&self) -> usize {
        self.sizes.len()
    }

    /// Whether there are none.
    pub fn is_empty(&self) -> bool {
        self.sizes.is_empty()
    }
}
