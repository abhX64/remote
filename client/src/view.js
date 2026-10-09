function createScreenView(canvas) {
  const ctx = canvas.getContext('2d');
  let rendering = false;

  async function renderFrame(blob) {
    if (rendering) return; // drop the frame if we're still drawing the last one
    rendering = true;
    try {
      const bitmap = await createImageBitmap(blob);
      if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
      }
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
    } catch (err) {
      console.warn('Failed to render frame', err);
    } finally {
      rendering = false;
    }
  }

  return { renderFrame };
}
