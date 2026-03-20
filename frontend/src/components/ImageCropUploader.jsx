import { useState, useCallback, useRef } from 'react'
import Cropper from 'react-easy-crop'
import { supabase } from '../lib/supabase'

async function createImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', reject)
    image.setAttribute('crossOrigin', 'anonymous')
    image.src = url
  })
}

async function getCroppedImg(imageSrc, croppedAreaPixels) {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = croppedAreaPixels.width
  canvas.height = croppedAreaPixels.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image,
    croppedAreaPixels.x, croppedAreaPixels.y,
    croppedAreaPixels.width, croppedAreaPixels.height,
    0, 0, croppedAreaPixels.width, croppedAreaPixels.height
  )
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
}

export default function ImageCropUploader({ bucket, path, aspectRatio, currentUrl, onUploadComplete, label }) {
  const [imageSrc, setImageSrc] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [showCropModal, setShowCropModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(currentUrl || null)
  const heroCanvasRef = useRef(null)
  const cardCanvasRef = useRef(null)

  const drawPreview = useCallback((src, pixels) => {
    if (!src || !pixels) return
    const img = new Image()
    img.onload = () => {
      // Hero preview: 120×150 (4:5)
      const hero = heroCanvasRef.current
      if (hero) {
        const ctx = hero.getContext('2d')
        ctx.clearRect(0, 0, hero.width, hero.height)
        ctx.drawImage(img, pixels.x, pixels.y, pixels.width, pixels.height, 0, 0, hero.width, hero.height)
      }
      // Card preview: 90×120 (3:4) — derive from same crop, adjust height
      const card = cardCanvasRef.current
      if (card) {
        const cardHeight = Math.min(pixels.width * (4 / 3), img.height - pixels.y)
        const ctx = card.getContext('2d')
        ctx.clearRect(0, 0, card.width, card.height)
        ctx.drawImage(img, pixels.x, pixels.y, pixels.width, cardHeight, 0, 0, card.width, card.height)
      }
    }
    img.src = src
  }, [])

  const onCropComplete = useCallback((_, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels)
    drawPreview(imageSrc, croppedPixels)
  }, [imageSrc, drawPreview])

  function onFileChange(e) {
    if (!e.target.files?.[0]) return
    const reader = new FileReader()
    reader.onload = () => {
      setImageSrc(reader.result)
      setShowCropModal(true)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
    }
    reader.readAsDataURL(e.target.files[0])
    // Reset input so the same file can be re-selected
    e.target.value = ''
  }

  async function handleCropAndUpload() {
    if (!croppedAreaPixels || !imageSrc) return
    setUploading(true)
    setError(null)
    try {
      const blob = await getCroppedImg(imageSrc, croppedAreaPixels)
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from(bucket).getPublicUrl(path)
      const url = data.publicUrl + '?t=' + Date.now()
      setPreviewUrl(url)
      onUploadComplete(url)
      setShowCropModal(false)
      setImageSrc(null)
    } catch (err) {
      setError(err.message || 'Upload failed')
    }
    setUploading(false)
  }

  const isSquare = aspectRatio === 1
  const previewContainerStyle = isSquare
    ? { width: 100, height: 100, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }
    : { width: '100%', aspectRatio: '4/5', maxWidth: 200, borderRadius: 10, overflow: 'hidden' }

  return (
    <div>
      {label && (
        <div style={{ fontSize: 12, color: '#7a6e65', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, fontWeight: 700 }}>
          {label}
        </div>
      )}

      {previewUrl ? (
        <div style={{ display: 'flex', flexDirection: isSquare ? 'row' : 'column', alignItems: isSquare ? 'center' : 'flex-start', gap: 12 }}>
          <div style={previewContainerStyle}>
            <img src={previewUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#faf7f2', border: '1px solid #e2dbd4', borderRadius: 8,
            padding: '8px 16px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', color: '#5a4e47', whiteSpace: 'nowrap',
          }}>
            📷 Change photo
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onFileChange} />
          </label>
        </div>
      ) : (
        <label style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          border: '2px dashed #e2dbd4', borderRadius: 12, padding: '28px 20px',
          background: '#faf7f2', cursor: 'pointer', gap: 8, minHeight: 100,
        }}>
          <span style={{ fontSize: 32 }}>📷</span>
          <span style={{ fontSize: 14, color: '#7a6e65', fontWeight: 600 }}>Upload photo</span>
          <span style={{ fontSize: 12, color: '#a09890' }}>Tap to select from camera or gallery</span>
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onFileChange} />
        </label>
      )}

      {error && <div style={{ fontSize: 12, color: '#cc0000', marginTop: 6 }}>{error}</div>}

      {/* Crop Modal */}
      {showCropModal && imageSrc && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f0c0c', marginBottom: 16 }}>
              Crop Photo
            </div>

            <div style={{ fontSize: 12, color: '#a09890', fontStyle: 'italic', marginBottom: 12 }}>
              💡 Tip: Position your face and costume to fill the frame. Avoid large empty spaces at top.
            </div>

            <div style={{ position: 'relative', height: 300, background: '#111', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={aspectRatio}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: '#7a6e65', marginBottom: 6, display: 'block', fontWeight: 600 }}>Zoom</label>
              <input
                type="range" min={1} max={3} step={0.05}
                value={zoom} onChange={e => setZoom(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#c8430a' }}
              />
            </div>

            {/* Live previews */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: '#7a6e65', fontWeight: 600, marginBottom: 10 }}>Preview how it will look:</div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                {/* Hero preview — Session page 4:5 */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e2dbd4', position: 'relative' }}>
                    {/* Mock page header bar */}
                    <div style={{ height: 8, background: '#1a1a1a', width: 120 }} />
                    <canvas ref={heroCanvasRef} width={120} height={150} style={{ display: 'block' }} />
                  </div>
                  <span style={{ fontSize: 11, color: '#a09890' }}>Session page</span>
                </div>
                {/* Card preview — Home card 3:4 */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #e2dbd4', position: 'relative', width: 90, height: 120 }}>
                    <canvas ref={cardCanvasRef} width={90} height={120} style={{ display: 'block' }} />
                    {/* Mock gradient overlay */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: 'linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.7) 100%)',
                      pointerEvents: 'none',
                    }} />
                    {/* Mock style chip top-left */}
                    <div style={{
                      position: 'absolute', top: 5, left: 5,
                      background: '#c8430a', borderRadius: 4,
                      padding: '1px 5px', fontSize: 8, color: 'white', fontWeight: 700,
                    }}>DANCE</div>
                    {/* Mock choreographer name bottom */}
                    <div style={{
                      position: 'absolute', bottom: 4, left: 5,
                      fontSize: 8, color: 'white', fontWeight: 600, lineHeight: 1.2,
                    }}>Choreographer</div>
                  </div>
                  <span style={{ fontSize: 11, color: '#a09890' }}>Home card</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setShowCropModal(false); setImageSrc(null) }}
                style={{
                  flex: 1, background: 'transparent', border: '1px solid #e2dbd4',
                  color: '#7a6e65', padding: '12px', borderRadius: 8, cursor: 'pointer',
                  fontSize: 14, fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCropAndUpload}
                disabled={uploading}
                style={{
                  flex: 2, background: uploading ? '#a09890' : '#c8430a', color: 'white',
                  border: 'none', padding: '12px', borderRadius: 8,
                  cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700,
                }}
              >
                {uploading ? 'Uploading...' : 'Crop & Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
