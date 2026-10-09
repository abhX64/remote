const { mouse, keyboard, screen, Button, Key } = require('@nut-tree-fork/nut-js');
const logger = require('./logger');

mouse.config.autoDelayMs = 0;
keyboard.config.autoDelayMs = 0;

const BUTTONS = { left: Button.LEFT, right: Button.RIGHT, middle: Button.MIDDLE };

// Maps browser KeyboardEvent.code (layout-independent) to nut-js Key.
const CODE_TO_KEY = {
  KeyA: Key.A, KeyB: Key.B, KeyC: Key.C, KeyD: Key.D, KeyE: Key.E, KeyF: Key.F,
  KeyG: Key.G, KeyH: Key.H, KeyI: Key.I, KeyJ: Key.J, KeyK: Key.K, KeyL: Key.L,
  KeyM: Key.M, KeyN: Key.N, KeyO: Key.O, KeyP: Key.P, KeyQ: Key.Q, KeyR: Key.R,
  KeyS: Key.S, KeyT: Key.T, KeyU: Key.U, KeyV: Key.V, KeyW: Key.W, KeyX: Key.X,
  KeyY: Key.Y, KeyZ: Key.Z,

  Digit0: Key.Num0, Digit1: Key.Num1, Digit2: Key.Num2, Digit3: Key.Num3,
  Digit4: Key.Num4, Digit5: Key.Num5, Digit6: Key.Num6, Digit7: Key.Num7,
  Digit8: Key.Num8, Digit9: Key.Num9,

  Numpad0: Key.NumPad0, Numpad1: Key.NumPad1, Numpad2: Key.NumPad2, Numpad3: Key.NumPad3,
  Numpad4: Key.NumPad4, Numpad5: Key.NumPad5, Numpad6: Key.NumPad6, Numpad7: Key.NumPad7,
  Numpad8: Key.NumPad8, Numpad9: Key.NumPad9,
  NumpadAdd: Key.Add, NumpadSubtract: Key.Subtract, NumpadMultiply: Key.Multiply,
  NumpadDivide: Key.Divide, NumpadDecimal: Key.Decimal, NumpadEqual: Key.NumPadEqual,
  NumpadEnter: Key.Enter,

  Minus: Key.Minus, Equal: Key.Equal, BracketLeft: Key.LeftBracket, BracketRight: Key.RightBracket,
  Backslash: Key.Backslash, Semicolon: Key.Semicolon, Quote: Key.Quote,
  Comma: Key.Comma, Period: Key.Period, Slash: Key.Slash, Backquote: Key.Grave,

  Enter: Key.Enter, Space: Key.Space, Tab: Key.Tab, Backspace: Key.Backspace,
  Delete: Key.Delete, Escape: Key.Escape, CapsLock: Key.CapsLock,

  ArrowUp: Key.Up, ArrowDown: Key.Down, ArrowLeft: Key.Left, ArrowRight: Key.Right,
  Home: Key.Home, End: Key.End, PageUp: Key.PageUp, PageDown: Key.PageDown, Insert: Key.Insert,

  ShiftLeft: Key.LeftShift, ShiftRight: Key.RightShift,
  ControlLeft: Key.LeftControl, ControlRight: Key.RightControl,
  AltLeft: Key.LeftAlt, AltRight: Key.RightAlt,
  MetaLeft: Key.LeftSuper, MetaRight: Key.RightSuper,

  F1: Key.F1, F2: Key.F2, F3: Key.F3, F4: Key.F4, F5: Key.F5, F6: Key.F6,
  F7: Key.F7, F8: Key.F8, F9: Key.F9, F10: Key.F10, F11: Key.F11, F12: Key.F12,

  PrintScreen: Key.Print, ScrollLock: Key.ScrollLock, Pause: Key.Pause,
  ContextMenu: Key.Menu, NumLock: Key.NumLock,
};

let screenSize = null;
async function getScreenSize() {
  if (!screenSize) {
    screenSize = { width: await screen.width(), height: await screen.height() };
  }
  return screenSize;
}

async function handleInputMessage(msg) {
  try {
    switch (msg.action) {
      case 'mousemove': {
        const { width, height } = await getScreenSize();
        await mouse.setPosition({ x: Math.round(msg.x * width), y: Math.round(msg.y * height) });
        break;
      }
      case 'mousedown': {
        const btn = BUTTONS[msg.button];
        if (btn !== undefined) await mouse.pressButton(btn);
        break;
      }
      case 'mouseup': {
        const btn = BUTTONS[msg.button];
        if (btn !== undefined) await mouse.releaseButton(btn);
        break;
      }
      case 'wheel': {
        const steps = Math.min(Math.max(Math.round(Math.abs(msg.deltaY) / 20), 1), 10);
        if (msg.deltaY > 0) await mouse.scrollDown(steps);
        else if (msg.deltaY < 0) await mouse.scrollUp(steps);
        break;
      }
      case 'keydown': {
        const key = CODE_TO_KEY[msg.code];
        if (key !== undefined) await keyboard.pressKey(key);
        break;
      }
      case 'keyup': {
        const key = CODE_TO_KEY[msg.code];
        if (key !== undefined) await keyboard.releaseKey(key);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    logger.error('input handling failed', { message: err.message, action: msg.action });
  }
}

module.exports = { handleInputMessage };
