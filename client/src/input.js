function attachInputHandlers(canvas, send) {
  function normalizedPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    return {
      x: Math.min(Math.max(x, 0), 1),
      y: Math.min(Math.max(y, 0), 1),
    };
  }

  function normalizedCoords(event) {
    return normalizedPoint(event.clientX, event.clientY);
  }

  function buttonName(event) {
    if (event.button === 2) return 'right';
    if (event.button === 1) return 'middle';
    return 'left';
  }

  canvas.addEventListener('mousemove', (event) => {
    const { x, y } = normalizedCoords(event);
    send({ type: 'input', action: 'mousemove', x, y });
  });

  canvas.addEventListener('mousedown', (event) => {
    event.preventDefault();
    canvas.focus();
    const { x, y } = normalizedCoords(event);
    send({ type: 'input', action: 'mousedown', button: buttonName(event), x, y });
  });

  canvas.addEventListener('mouseup', (event) => {
    event.preventDefault();
    const { x, y } = normalizedCoords(event);
    send({ type: 'input', action: 'mouseup', button: buttonName(event), x, y });
  });

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      send({ type: 'input', action: 'wheel', deltaY: event.deltaY });
    },
    { passive: false }
  );

  canvas.addEventListener('keydown', (event) => {
    event.preventDefault();
    send({ type: 'input', action: 'keydown', code: event.code });
  });

  canvas.addEventListener('keyup', (event) => {
    event.preventDefault();
    send({ type: 'input', action: 'keyup', code: event.code });
  });

  // Touch support (phones/tablets): map a single-finger drag to
  // mousedown -> mousemove* -> mouseup, since there is no physical mouse.
  canvas.addEventListener(
    'touchstart',
    (event) => {
      event.preventDefault();
      canvas.focus();
      const touch = event.touches[0];
      if (!touch) return;
      const { x, y } = normalizedPoint(touch.clientX, touch.clientY);
      send({ type: 'input', action: 'mousemove', x, y });
      send({ type: 'input', action: 'mousedown', button: 'left', x, y });
    },
    { passive: false }
  );

  canvas.addEventListener(
    'touchmove',
    (event) => {
      event.preventDefault();
      const touch = event.touches[0];
      if (!touch) return;
      const { x, y } = normalizedPoint(touch.clientX, touch.clientY);
      send({ type: 'input', action: 'mousemove', x, y });
    },
    { passive: false }
  );

  function endTouch(event) {
    event.preventDefault();
    const touch = event.changedTouches[0];
    if (!touch) return;
    const { x, y } = normalizedPoint(touch.clientX, touch.clientY);
    send({ type: 'input', action: 'mouseup', button: 'left', x, y });
  }

  canvas.addEventListener('touchend', endTouch, { passive: false });
  canvas.addEventListener('touchcancel', endTouch, { passive: false });
}
